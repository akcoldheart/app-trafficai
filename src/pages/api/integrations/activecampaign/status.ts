import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegrationStatus, updateIntegrationConfig, disconnectIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const data = await getIntegrationStatus(user.id, 'activecampaign');
      return res.status(200).json({ integration: data || null });
    } catch (error) {
      console.error('Error fetching ActiveCampaign status:', error);
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  if (req.method === 'PUT') {
    const { config } = req.body;

    try {
      const integration = await updateIntegrationConfig(user.id, 'activecampaign', config);
      return res.status(200).json({ integration });
    } catch (error) {
      console.error('Error updating ActiveCampaign config:', error);
      return res.status(500).json({ error: 'Failed to update integration settings' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await disconnectIntegration(user.id, 'activecampaign');
      return res.status(200).json({ success: true, message: 'ActiveCampaign disconnected' });
    } catch (error) {
      console.error('Error disconnecting ActiveCampaign:', error);
      return res.status(500).json({ error: 'Failed to disconnect ActiveCampaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
