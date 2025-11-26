import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient } from '@/lib/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can manage users
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user } = auth;
  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // List all users
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      await logAuditAction(user.id, 'list_users', req, res);
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
