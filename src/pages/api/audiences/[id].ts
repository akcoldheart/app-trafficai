import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getUserApiKey, logAuditAction } from '@/lib/api-helpers';

const TRAFFIC_AI_API_URL = process.env.TRAFFIC_AI_API_URL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid audience ID' });
  }

  // Get user's API key
  const apiKey = await getUserApiKey(user.id, req, res);
  if (!apiKey) {
    return res.status(403).json({ error: 'No API key assigned. Please contact admin.' });
  }

  try {
    if (req.method === 'GET') {
      // Get audience details
      const { page = 1, page_size = 50 } = req.query;

      const response = await fetch(
        `${TRAFFIC_AI_API_URL}/audiences/${id}?page=${page}&page_size=${page_size}`,
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

      await logAuditAction(user.id, 'view_audience', req, res, 'audience', id);
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      // Delete audience
      const response = await fetch(`${TRAFFIC_AI_API_URL}/audiences/${id}`, {
        method: 'DELETE',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      await logAuditAction(user.id, 'delete_audience', req, res, 'audience', id);
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
