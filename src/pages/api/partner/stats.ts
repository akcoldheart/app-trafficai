import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Ensure user is authenticated
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      // TODO: Implement actual partner stats fetching from database
      // For now, return placeholder data
      const stats = {
        referrals: 0,
        earnings: 0,
        clicks: 0,
        conversionRate: 0,
      };

      return res.status(200).json(stats);
    } catch (error) {
      console.error('Error fetching partner stats:', error);
      return res.status(500).json({ error: 'Failed to fetch partner stats' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
