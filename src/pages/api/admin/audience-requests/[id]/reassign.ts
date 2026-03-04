import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { id } = req.query; // audience_request id
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  const { audience_id, user_ids } = req.body;
  if (!audience_id || typeof audience_id !== 'string') {
    return res.status(400).json({ error: 'audience_id is required' });
  }
  if (!Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ error: 'user_ids array is required' });
  }

  try {
    // Remove all existing assignments for this audience
    await supabaseAdmin
      .from('audience_assignments')
      .delete()
      .eq('audience_id', audience_id);

    // Insert new assignments
    const rows = user_ids.map((uid: string) => ({
      audience_id,
      user_id: uid,
      assigned_by: authResult.user.id,
    }));

    const { error: insertError } = await supabaseAdmin
      .from('audience_assignments')
      .insert(rows);

    if (insertError) {
      console.error('Error inserting assignments:', insertError);
      return res.status(500).json({ error: 'Failed to assign users' });
    }

    await logAuditAction(
      authResult.user.id,
      'assign_audience_users',
      req,
      res,
      'audience_request',
      id,
      { audience_id, user_ids }
    );

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
