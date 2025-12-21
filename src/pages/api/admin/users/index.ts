import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Use service role to bypass RLS and see all users
const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can manage users
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user } = auth;

  try {
    if (req.method === 'GET') {
      // List all users with API key status (include role_id for dropdown)
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, email, role, role_id, company_website, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get all API keys to check which users have them
      const { data: apiKeys } = await supabaseAdmin
        .from('user_api_keys')
        .select('user_id');

      const usersWithApiKeyIds = new Set(apiKeys?.map(k => k.user_id) || []);

      // Add has_api_key flag to each user
      const usersWithStatus = users?.map(u => ({
        ...u,
        has_api_key: usersWithApiKeyIds.has(u.id),
      })) || [];

      await logAuditAction(user.id, 'list_users', req, res);
      return res.status(200).json({ users: usersWithStatus });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
