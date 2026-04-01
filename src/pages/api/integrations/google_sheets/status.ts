import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegrationStatus, updateIntegrationConfig, disconnectIntegration } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'google_sheets';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const data = await getIntegrationStatus(user.id, PLATFORM);
      return res.status(200).json({ integration: data || null });
    } catch (error) {
      console.error('Error fetching Google Sheets status:', error);
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { config } = req.body;
      const data = await updateIntegrationConfig(user.id, PLATFORM, config);
      return res.status(200).json({ integration: data });
    } catch (error) {
      console.error('Error updating Google Sheets config:', error);
      return res.status(500).json({ error: 'Failed to update integration settings' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await disconnectIntegration(user.id, PLATFORM);
      return res.status(200).json({ success: true, message: 'Google Sheets disconnected' });
    } catch (error) {
      console.error('Error disconnecting Google Sheets:', error);
      return res.status(500).json({ error: 'Failed to disconnect Google Sheets' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
