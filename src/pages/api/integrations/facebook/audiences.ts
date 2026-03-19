import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { ad_account_id } = req.query;
  if (!ad_account_id) {
    return res.status(400).json({ error: 'ad_account_id is required' });
  }

  try {
    const integration = await getIntegration(user.id, 'facebook');

    if (!integration) {
      return res.status(401).json({ error: 'Facebook not connected' });
    }

    const fbResp = await fetch(
      `https://graph.facebook.com/v19.0/${ad_account_id}/customaudiences?fields=id,name,approximate_count,delivery_status&access_token=${integration.api_key}`
    );
    const fbData = await fbResp.json();

    if (!fbResp.ok) {
      return res.status(400).json({ error: 'Failed to fetch audiences', details: fbData.error?.message });
    }

    const audiences = (fbData.data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      approximate_count: a.approximate_count,
      delivery_status: a.delivery_status,
    }));

    return res.status(200).json({ audiences });
  } catch (error) {
    console.error('Error fetching Facebook audiences:', error);
    return res.status(500).json({ error: 'Failed to fetch audiences' });
  }
}
