import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient } from '@/lib/supabase/api';
import type { UserRole } from '@/lib/supabase/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can change roles
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user } = auth;
  const { id } = req.query;
  const { role } = req.body as { role: UserRole };

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  if (!role || !['admin', 'team', 'partner'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const supabase = createClient(req, res);

  try {
    const { data, error } = await supabase
      .from('users')
      // @ts-ignore - Supabase type inference issue
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAuditAction(user.id, 'update_user_role', req, res, 'user', id, { role });
    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
