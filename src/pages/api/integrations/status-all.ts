import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { getAllIntegrationStatuses } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    const integrations = await getAllIntegrationStatuses(effectiveUserId);
    return res.status(200).json({ integrations });
  } catch (error) {
    console.error('Error fetching integration statuses:', error);
    return res.status(500).json({ error: 'Failed to fetch integration statuses' });
  }
}
