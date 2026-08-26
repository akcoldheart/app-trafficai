import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { getIntegrationStatus, updateIntegrationConfig, disconnectIntegration } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';
import { redactShopifyConfig, SHOPIFY_SECRET_CONFIG_KEYS } from '@/lib/shopify-auth';

const PLATFORM: PlatformType = 'shopify';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  if (req.method === 'GET') {
    try {
      const data = await getIntegrationStatus(effectiveUserId, PLATFORM);
      if (!data) return res.status(200).json({ integration: null });

      // config now holds the app Client Secret and live access token — never send them
      // to the browser.
      return res.status(200).json({
        integration: { ...data, config: redactShopifyConfig(data.config as Record<string, unknown>) },
      });
    } catch (error) {
      console.error('Error fetching Shopify status:', error);
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { config: incoming } = req.body ?? {};
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return res.status(400).json({ error: 'config object is required' });
      }

      // The client only ever sees a redacted config, so a naive write-through would drop
      // the credentials. Merge onto what is stored and refuse to take secret keys from
      // the request body.
      const existing = await getIntegrationStatus(effectiveUserId, PLATFORM);
      if (!existing) {
        return res.status(404).json({ error: 'Shopify is not connected' });
      }

      const sanitizedIncoming = { ...(incoming as Record<string, unknown>) };
      for (const key of SHOPIFY_SECRET_CONFIG_KEYS) delete sanitizedIncoming[key];
      delete sanitizedIncoming.client_id;
      delete sanitizedIncoming.has_client_credentials;

      const existingConfig = (existing.config || {}) as Record<string, unknown>;
      const merged = { ...existingConfig, ...sanitizedIncoming };

      const data = await updateIntegrationConfig(effectiveUserId, PLATFORM, merged);
      return res.status(200).json({
        integration: { ...data, config: redactShopifyConfig(data?.config as Record<string, unknown>) },
      });
    } catch (error) {
      console.error('Error updating Shopify config:', error);
      return res.status(500).json({ error: 'Failed to update integration settings' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await disconnectIntegration(effectiveUserId, PLATFORM);
      return res.status(200).json({ success: true, message: 'Shopify disconnected' });
    } catch (error) {
      console.error('Error disconnecting Shopify:', error);
      return res.status(500).json({ error: 'Failed to disconnect Shopify' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
