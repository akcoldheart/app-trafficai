import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  const { new_user_id } = req.body;
  if (!new_user_id || typeof new_user_id !== 'string') {
    return res.status(400).json({ error: 'new_user_id is required' });
  }

  const supabase = createClient(req, res);

  try {
    const { data, error } = await supabase
      .from('audience_requests')
      .update({ user_id: new_user_id })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ error: 'Audience request not found' });
      }
      return res.status(500).json({ error: 'Failed to reassign audience' });
    }

    await logAuditAction(
      authResult.user.id,
      'reassign_audience_request',
      req,
      res,
      'audience_request',
      id,
      { new_user_id }
    );

    return res.status(200).json({ success: true, request: data });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
