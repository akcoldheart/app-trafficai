import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getZeroBounceApiKey, getZeroBounceCredits } from '@/lib/email-verification';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const apiKey = await getZeroBounceApiKey(user.id);
    if (!apiKey) {
      return res.status(400).json({ error: 'ZeroBounce not connected' });
    }

    const credits = await getZeroBounceCredits(apiKey);
    return res.status(200).json({ credits });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
}
