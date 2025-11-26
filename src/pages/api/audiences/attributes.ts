import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getUserApiKey } from '@/lib/api-helpers';

const TRAFFIC_AI_API_URL = process.env.TRAFFIC_AI_API_URL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { attribute } = req.query;

  if (!attribute || typeof attribute !== 'string') {
    return res.status(400).json({ error: 'Invalid attribute' });
  }

  // Get user's API key
  const apiKey = await getUserApiKey(user.id, req, res);
  if (!apiKey) {
    return res.status(403).json({ error: 'No API key assigned. Please contact admin.' });
  }

  try {
    const response = await fetch(
      `${TRAFFIC_AI_API_URL}/audiences/attributes/${attribute}`,
      {
        headers: {
          'X-API-Key': apiKey,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
