import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { UserRole } from '@/lib/supabase/types';

// Use service role to bypass RLS
const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can change roles
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user } = auth;
  const { id } = req.query;
  const { role, role_id } = req.body as { role?: UserRole; role_id?: string };

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const supabase = supabaseAdmin;

  try {
    // Prepare update data
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    // If role_id is provided (database-driven), use it
    if (role_id) {
      // Verify role exists
      const { data: roleData, error: roleError } = await supabase
        .from('roles')
        .select('id, name')
        .eq('id', role_id)
        .single();

      if (roleError || !roleData) {
        return res.status(400).json({ error: 'Invalid role ID' });
      }

      updateData.role_id = role_id;
      // Also update string role for backward compatibility
      updateData.role = roleData.name;
    }
    // If role string is provided (backward compatibility)
    else if (role) {
      if (!['admin', 'team', 'user'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }

      updateData.role = role;

      // Try to find matching role_id
      const { data: roleData } = await supabase
        .from('roles')
        .select('id')
        .eq('name', role)
        .single();

      if (roleData) {
        updateData.role_id = roleData.id;
      }
    } else {
      return res.status(400).json({ error: 'Role or role_id is required' });
    }

    const { data, error } = await supabase
      .from('users')
      // @ts-ignore - Supabase type inference issue
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    await logAuditAction(user.id, 'update_user_role', req, res, 'user', id, updateData);
    return res.status(200).json(data);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
