import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const integration = await getIntegration(user.id, 'activecampaign');
  if (!integration) {
    return res.status(400).json({ error: 'ActiveCampaign not connected. Please connect your ActiveCampaign account first.' });
  }

  const apiUrl = (integration.config as Record<string, string>).api_url;
  const apiToken = integration.api_key!;

  if (req.method === 'GET') {
    try {
      const response = await fetch(`${apiUrl}/api/3/lists`, {
        headers: {
          'Api-Token': apiToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch ActiveCampaign lists' });
      }

      const data = await response.json();
      const lists = (data.lists || []).map((l: { id: string; name: string }) => ({
        id: l.id,
        name: l.name,
      }));

      return res.status(200).json({ lists });
    } catch (error) {
      console.error('Error fetching ActiveCampaign lists:', error);
      return res.status(500).json({ error: 'Failed to fetch ActiveCampaign lists' });
    }
  }

  if (req.method === 'POST') {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'List name is required' });
    }

    try {
      const response = await fetch(`${apiUrl}/api/3/lists`, {
        method: 'POST',
        headers: {
          'Api-Token': apiToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          list: {
            name,
            stringid: name.toLowerCase().replace(/\s+/g, '-'),
            sender_url: apiUrl,
            sender_reminder: 'You signed up via Traffic AI',
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        return res.status(response.status).json({
          error: errorData?.message || 'Failed to create ActiveCampaign list',
        });
      }

      const data = await response.json();
      return res.status(201).json({
        list: {
          id: data.list.id,
          name: data.list.name,
        },
      });
    } catch (error) {
      console.error('Error creating ActiveCampaign list:', error);
      return res.status(500).json({ error: 'Failed to create ActiveCampaign list' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
