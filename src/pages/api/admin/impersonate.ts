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

  // Only admins can impersonate
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user } = auth;
  const { userId, email } = req.body;

  if (!userId || !email) {
    return res.status(400).json({ error: 'userId and email are required' });
  }

  // Prevent impersonating yourself
  if (userId === user.id) {
    return res.status(400).json({ error: 'Cannot impersonate yourself' });
  }

  // Prevent impersonating other admins
  const { data: targetUser } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single();

  if (targetUser?.role === 'admin') {
    return res.status(400).json({ error: 'Cannot impersonate admin users' });
  }

  try {
    // Generate a magic link for the target user
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });

    if (error) {
      console.error('Failed to generate impersonation link:', error);
      return res.status(500).json({ error: 'Failed to generate impersonation link' });
    }

    // Log the impersonation action
    await logAuditAction(user.id, 'impersonate_user', req, res, 'user', userId, {
      target_email: email,
      admin_email: user.email,
    });

    return res.status(200).json({
      token_hash: data.properties?.hashed_token,
    });
  } catch (error) {
    console.error('Impersonation error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
