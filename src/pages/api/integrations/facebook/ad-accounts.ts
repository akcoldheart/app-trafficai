import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const integration = await getIntegration(user.id, 'facebook');

    if (!integration) {
      return res.status(401).json({ error: 'Facebook not connected' });
    }

    const fbResp = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${integration.api_key}`
    );
    const fbData = await fbResp.json();

    if (!fbResp.ok) {
      return res.status(400).json({ error: 'Failed to fetch ad accounts', details: fbData.error?.message });
    }

    const accounts = (fbData.data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      account_status: a.account_status,
    }));

    return res.status(200).json({ ad_accounts: accounts });
  } catch (error) {
    console.error('Error fetching Facebook ad accounts:', error);
    return res.status(500).json({ error: 'Failed to fetch ad accounts' });
  }
}
