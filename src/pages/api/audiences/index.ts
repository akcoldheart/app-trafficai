import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getUserApiKey, logAuditAction } from '@/lib/api-helpers';

const TRAFFIC_AI_API_URL = process.env.TRAFFIC_AI_API_URL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  // Get user's API key
  const apiKey = await getUserApiKey(user.id, req, res);
  if (!apiKey) {
    return res.status(403).json({ error: 'No API key assigned. Please contact admin.' });
  }

  try {
    if (req.method === 'GET') {
      // List audiences
      const { page = 1, page_size = 20 } = req.query;

      const response = await fetch(
        `${TRAFFIC_AI_API_URL}/audiences?page=${page}&page_size=${page_size}`,
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

      await logAuditAction(user.id, 'list_audiences', req, res);
      return res.status(200).json(data);
    }

    if (req.method === 'POST') {
      // Create audience
      const response = await fetch(`${TRAFFIC_AI_API_URL}/audiences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify(req.body),
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      await logAuditAction(user.id, 'create_audience', req, res, 'audience', data.id);
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
