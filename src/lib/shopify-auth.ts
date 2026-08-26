import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Shopify stopped allowing admin-created ("legacy") custom apps on 2026-01-01, so new
 * stores can only hand us a Client ID + Client Secret. Those exchange for an access token
 * via the client credentials grant, which works when the app and the store live in the
 * same Shopify organization — the case for every merchant who builds an app for their
 * own store.
 *
 * The catch: client credentials tokens expire after 24h (expires_in is always 86399),
 * so unlike the old shpat_ tokens they can't be stored once and reused forever. This
 * module mints them on demand and caches them in platform_integrations.config.
 *
 * Legacy integrations that already hold a static shpat_ token in api_key keep working
 * untouched — getShopifyAccessToken returns it as-is.
 */

const TOKEN_ENDPOINT_PATH = '/admin/oauth/access_token';

// Refresh a little before the real expiry so a long sync can't have the token die
// out from under it mid-run.
const EXPIRY_SKEW_MS = 10 * 60 * 1000;

export interface ShopifyIntegrationRow {
  user_id: string;
  api_key: string | null;
  config: Record<string, unknown> | null;
}

export interface MintedToken {
  accessToken: string;
  expiresAt: string;
  scope: string;
}

/** Strip protocol/trailing slashes and lowercase, so "HTTPS://Shop.myshopify.com/" → "shop.myshopify.com". */
export function normalizeShopDomain(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Only ever send credentials to a real Shopify host. Without this an attacker-supplied
 * shop_domain would make us POST the merchant's client secret to a host they control.
 */
export function isValidShopDomain(domain: string): boolean {
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain);
}

export class ShopifyAuthError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status = 400, details?: string) {
    super(message);
    this.name = 'ShopifyAuthError';
    this.status = status;
    this.details = details;
  }
}

/**
 * Exchange Client ID + Client Secret for a short-lived Admin API access token.
 * Does not touch the database — callers decide whether to persist the result.
 */
export async function mintShopifyAccessToken(args: {
  shopDomain: string;
  clientId: string;
  clientSecret: string;
}): Promise<MintedToken> {
  const { shopDomain, clientId, clientSecret } = args;

  if (!isValidShopDomain(shopDomain)) {
    throw new ShopifyAuthError(
      `Invalid shop domain "${shopDomain}". Expected something like your-store.myshopify.com.`
    );
  }

  let response: Response;
  try {
    response = await fetch(`https://${shopDomain}${TOKEN_ENDPOINT_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
  } catch (err) {
    throw new ShopifyAuthError(
      `Could not reach ${shopDomain}. Check the shop domain is correct.`,
      502,
      (err as Error).message
    );
  }

  const rawBody = await response.text();

  if (!response.ok) {
    // Shopify returns 400/401 both for bad credentials and for an app that isn't in the
    // same organization as the store — the single most common setup mistake, and one the
    // raw error body does not explain.
    const hint =
      response.status === 400 || response.status === 401
        ? ' Verify the Client ID and Secret, and that the app and the store belong to the same Shopify organization (the client credentials grant requires this).'
        : '';
    throw new ShopifyAuthError(
      `Shopify rejected the credentials (${response.status}).${hint}`,
      response.status === 401 ? 400 : response.status,
      rawBody.slice(0, 500)
    );
  }

  let data: { access_token?: string; scope?: string; expires_in?: number };
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new ShopifyAuthError(
      'Shopify returned an unreadable token response.',
      502,
      rawBody.slice(0, 500)
    );
  }

  if (!data.access_token) {
    throw new ShopifyAuthError(
      'Shopify did not return an access token.',
      502,
      rawBody.slice(0, 500)
    );
  }

  // expires_in is documented as always 86399 (24h); fall back to that if it's absent.
  const expiresInSeconds = typeof data.expires_in === 'number' ? data.expires_in : 86399;

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    scope: data.scope || '',
  };
}

function hasUsableCachedToken(config: Record<string, unknown>): boolean {
  const token = config.access_token as string | undefined;
  const expiresAt = config.token_expires_at as string | undefined;
  if (!token || !expiresAt) return false;
  const expiryMs = Date.parse(expiresAt);
  if (Number.isNaN(expiryMs)) return false;
  return expiryMs - EXPIRY_SKEW_MS > Date.now();
}

/**
 * Return a usable Admin API access token for an integration, minting and caching a fresh
 * one when the cached token is missing or near expiry.
 *
 * Resolution order:
 *   1. Client ID + Secret in config → client credentials grant (cached for ~24h)
 *   2. Static api_key (legacy shpat_ token) → returned unchanged
 */
export async function getShopifyAccessToken(integration: ShopifyIntegrationRow): Promise<string> {
  const config = (integration.config || {}) as Record<string, unknown>;
  const clientId = config.client_id as string | undefined;
  const clientSecret = config.client_secret as string | undefined;

  if (!clientId || !clientSecret) {
    if (integration.api_key) return integration.api_key;
    throw new ShopifyAuthError(
      'Shopify is not fully configured. Reconnect the integration with your app Client ID and Client Secret.'
    );
  }

  if (hasUsableCachedToken(config)) {
    return config.access_token as string;
  }

  const shopDomain = normalizeShopDomain((config.shop_domain as string | undefined) || '');
  if (!shopDomain) {
    throw new ShopifyAuthError('Shop domain not configured for this Shopify integration.');
  }

  const minted = await mintShopifyAccessToken({ shopDomain, clientId, clientSecret });

  // Re-read the row before writing so we merge into the current config rather than the
  // possibly-stale copy the caller handed us — otherwise a concurrent settings change
  // (e.g. the attribution pixel) would be clobbered by this refresh.
  const { data: fresh } = await supabaseAdmin
    .from('platform_integrations')
    .select('config')
    .eq('user_id', integration.user_id)
    .eq('platform', 'shopify')
    .single();

  const currentConfig = ((fresh?.config || config) || {}) as Record<string, unknown>;

  await supabaseAdmin
    .from('platform_integrations')
    .update({
      config: {
        ...currentConfig,
        access_token: minted.accessToken,
        token_expires_at: minted.expiresAt,
        granted_scopes: minted.scope,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', integration.user_id)
    .eq('platform', 'shopify');

  return minted.accessToken;
}

/**
 * Config keys that must never be returned to the browser or accepted from it.
 * The status endpoint echoes config back to the UI, and its PUT handler writes
 * whatever it is given — without this both would leak and then wipe the secret.
 */
export const SHOPIFY_SECRET_CONFIG_KEYS = [
  'client_secret',
  'access_token',
  'token_expires_at',
] as const;

export function redactShopifyConfig(
  config: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const safe = { ...((config || {}) as Record<string, unknown>) };
  for (const key of SHOPIFY_SECRET_CONFIG_KEYS) delete safe[key];
  // Keep a boolean so the UI can tell "credentials stored" from "nothing configured".
  safe.has_client_credentials = Boolean(
    (config as Record<string, unknown> | undefined)?.client_id &&
      (config as Record<string, unknown> | undefined)?.client_secret
  );
  return safe;
}
