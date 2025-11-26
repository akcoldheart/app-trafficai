import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, getUserApiKey, logAuditAction } from '@/lib/api-helpers';

const TRAFFIC_AI_API_URL = process.env.TRAFFIC_AI_API_URL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can add credits
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user, profile } = auth;

  // Get user's API key
  const apiKey = await getUserApiKey(user.id, req, res);
  if (!apiKey) {
    return res.status(403).json({ error: 'No API key assigned. Please contact admin.' });
  }

  try {
    const response = await fetch(`${TRAFFIC_AI_API_URL}/credits/add`, {
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

    await logAuditAction(user.id, 'add_credits', req, res, null, null, {
      amount: req.body.amount,
    });
    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
