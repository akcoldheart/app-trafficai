import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { saveIntegration, getIntegrationStatus } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';
import {
  mintShopifyAccessToken,
  normalizeShopDomain,
  isValidShopDomain,
  redactShopifyConfig,
  ShopifyAuthError,
} from '@/lib/shopify-auth';
import { logEvent } from '@/lib/webhook-logger';

const PLATFORM: PlatformType = 'shopify';
const SHOPIFY_API_VERSION = '2024-01';

// Scopes the orders sync actually depends on. Client credentials tokens carry whatever
// the Dev Dashboard app is configured with — we can't request scopes at token time, so
// we read them back and warn rather than fail.
const REQUIRED_SCOPES = ['read_orders', 'read_customers'];

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

async function verifyTokenAgainstShop(shopDomain: string, accessToken: string): Promise<string | null> {
  const response = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return body.slice(0, 300) || response.statusText;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { api_key, client_id, client_secret, shop_domain } = req.body ?? {};

  if (!shop_domain || typeof shop_domain !== 'string') {
    return res.status(400).json({ error: 'Shop domain is required' });
  }

  const cleanDomain = normalizeShopDomain(shop_domain);
  if (!isValidShopDomain(cleanDomain)) {
    return res.status(400).json({
      error: 'Shop domain must look like your-store.myshopify.com',
    });
  }

  const usingCredentials = Boolean(client_id && client_secret);

  // Legacy path: a static shpat_ token from an admin-created custom app. Shopify stopped
  // issuing these for new apps on 2026-01-01, so the UI no longer offers it, but existing
  // customers can still reconnect with a token they already hold.
  if (!usingCredentials && !api_key) {
    return res.status(400).json({
      error: 'Client ID and Client Secret are required',
      details:
        'Shopify no longer issues static Admin API access tokens for new apps. Create an app in the Shopify Dev Dashboard and use its Client ID and Client Secret.',
    });
  }

  // Reconnecting must not wipe settings the merchant already chose (attribution pixel).
  const existing = await getIntegrationStatus(effectiveUserId, PLATFORM);
  const existingConfig = ((existing?.config || {}) as Record<string, unknown>);

  try {
    if (usingCredentials) {
      if (typeof client_id !== 'string' || typeof client_secret !== 'string') {
        return res.status(400).json({ error: 'Client ID and Client Secret must be strings' });
      }

      const minted = await mintShopifyAccessToken({
        shopDomain: cleanDomain,
        clientId: client_id,
        clientSecret: client_secret,
      });

      const verifyError = await verifyTokenAgainstShop(cleanDomain, minted.accessToken);
      if (verifyError) {
        await logEvent({
          type: 'api',
          event_name: 'shopify_connect',
          status: 'error',
          message: `Shopify token minted but shop.json call failed for ${cleanDomain}`,
          user_id: user.id,
          ip_address: getClientIp(req),
          request_data: { shop_domain: cleanDomain, auth_mode: 'client_credentials' },
          error_details: verifyError,
        });
        return res.status(400).json({
          error: 'Connected to Shopify but could not read the store. Check the app has Admin API access to this store.',
          details: verifyError,
        });
      }

      const grantedScopes = minted.scope ? minted.scope.split(',').map((s) => s.trim()) : [];
      const missingScopes = REQUIRED_SCOPES.filter((s) => !grantedScopes.includes(s));

      const saved = await saveIntegration(effectiveUserId, PLATFORM, {
        // Credentials mode does not use api_key — clear any stale legacy token so
        // getShopifyAccessToken can't silently fall back to an expired shpat_.
        api_key: null,
        config: {
          ...existingConfig,
          shop_domain: cleanDomain,
          client_id,
          client_secret,
          access_token: minted.accessToken,
          token_expires_at: minted.expiresAt,
          granted_scopes: minted.scope,
          auth_mode: 'client_credentials',
        },
      });

      await logEvent({
        type: 'api',
        event_name: 'shopify_connect',
        status: missingScopes.length ? 'warning' : 'success',
        message: missingScopes.length
          ? `Shopify connected to ${cleanDomain} but missing scopes: ${missingScopes.join(', ')}`
          : `Shopify connected to ${cleanDomain} via client credentials`,
        user_id: user.id,
        ip_address: getClientIp(req),
        request_data: { shop_domain: cleanDomain, auth_mode: 'client_credentials' },
        response_data: { granted_scopes: minted.scope, token_expires_at: minted.expiresAt },
      });

      return res.status(200).json({
        success: true,
        message: 'Shopify connected successfully',
        integration: { ...saved, config: redactShopifyConfig(saved?.config as Record<string, unknown>) },
        auth_mode: 'client_credentials',
        granted_scopes: grantedScopes,
        warning: missingScopes.length
          ? `Your app is missing the ${missingScopes.join(' and ')} scope${missingScopes.length > 1 ? 's' : ''}. Add ${missingScopes.length > 1 ? 'them' : 'it'} in the Dev Dashboard and reconnect, or order syncing will fail.`
          : undefined,
      });
    }

    // --- Legacy static token path ---
    if (typeof api_key !== 'string') {
      return res.status(400).json({ error: 'Access token must be a string' });
    }

    const verifyError = await verifyTokenAgainstShop(cleanDomain, api_key);
    if (verifyError) {
      return res.status(400).json({
        error: 'Invalid Shopify credentials. Please check your access token and shop domain.',
        details: verifyError,
      });
    }

    // Drop any credential-mode leftovers. getShopifyAccessToken prefers client_id +
    // client_secret over api_key, so leaving them behind would make this reconnect a no-op
    // and keep using the credentials the merchant just replaced.
    const {
      client_id: _staleClientId,
      client_secret: _staleClientSecret,
      access_token: _staleAccessToken,
      token_expires_at: _staleExpiry,
      granted_scopes: _staleScopes,
      ...configWithoutCredentials
    } = existingConfig;

    const savedLegacy = await saveIntegration(effectiveUserId, PLATFORM, {
      api_key,
      config: {
        ...configWithoutCredentials,
        shop_domain: cleanDomain,
        auth_mode: 'static_token',
      },
    });

    await logEvent({
      type: 'api',
      event_name: 'shopify_connect',
      status: 'success',
      message: `Shopify connected to ${cleanDomain} via legacy static token`,
      user_id: user.id,
      ip_address: getClientIp(req),
      request_data: { shop_domain: cleanDomain, auth_mode: 'static_token' },
    });

    return res.status(200).json({
      success: true,
      message: 'Shopify connected successfully',
      integration: { ...savedLegacy, config: redactShopifyConfig(savedLegacy?.config as Record<string, unknown>) },
      auth_mode: 'static_token',
    });
  } catch (error) {
    if (error instanceof ShopifyAuthError) {
      await logEvent({
        type: 'api',
        event_name: 'shopify_connect',
        status: 'error',
        message: `Shopify connect failed for ${cleanDomain}: ${error.message}`,
        user_id: user.id,
        ip_address: getClientIp(req),
        request_data: { shop_domain: cleanDomain, auth_mode: usingCredentials ? 'client_credentials' : 'static_token' },
        error_details: error.details,
      });
      return res.status(error.status).json({ error: error.message, details: error.details });
    }

    console.error('Error connecting to Shopify:', error);
    await logEvent({
      type: 'api',
      event_name: 'shopify_connect',
      status: 'error',
      message: `Shopify connect failed for ${cleanDomain}`,
      user_id: user.id,
      ip_address: getClientIp(req),
      error_details: (error as Error).message,
    });
    return res.status(500).json({ error: 'Failed to connect to Shopify' });
  }
}
