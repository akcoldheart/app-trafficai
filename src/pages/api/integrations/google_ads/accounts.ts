import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateIntegrationConfig } from '@/lib/integrations';
import { refreshGoogleTokenIfNeeded, listAccessibleCustomers } from '@/lib/google-ads';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    try {
      const integration = await getIntegration(user.id, 'google_ads');
      if (!integration) {
        return res.status(401).json({ error: 'Google Ads not connected' });
      }

      const config = (integration.config || {}) as Record<string, unknown>;
      const developerToken = config.developer_token as string;
      if (!developerToken) {
        return res.status(400).json({ error: 'Developer token not configured' });
      }

      const accessToken = await refreshGoogleTokenIfNeeded(user.id, config);
      const customers = await listAccessibleCustomers(accessToken, developerToken);

      return res.status(200).json({ accounts: customers });
    } catch (error) {
      console.error('Error fetching Google Ads accounts:', error);
      return res.status(500).json({ error: (error as Error).message });
    }
  }

  if (req.method === 'POST') {
    // Save selected customer ID
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const { customer_id, customer_name } = req.body;
    if (!customer_id) {
      return res.status(400).json({ error: 'customer_id is required' });
    }

    try {
      const integration = await getIntegration(user.id, 'google_ads');
      if (!integration) {
        return res.status(401).json({ error: 'Google Ads not connected' });
      }

      const config = (integration.config || {}) as Record<string, unknown>;
      await updateIntegrationConfig(user.id, 'google_ads', {
        ...config,
        customer_id,
        customer_name: customer_name || customer_id,
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('Error saving Google Ads account:', error);
      return res.status(500).json({ error: 'Failed to save account selection' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
