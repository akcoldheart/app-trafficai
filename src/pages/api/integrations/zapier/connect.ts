/**
 * Not used for Zapier — triggers are configured individually via status PUT.
 * Redirect to status endpoint logic.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return res.status(405).json({ error: 'Use PUT /api/integrations/zapier/status to configure triggers' });
}
