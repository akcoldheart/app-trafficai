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
      // List all users with API key status
      const { data: users, error } = await supabase
        .from('users')
        .select('id, email, role, company_website, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get all API keys to check which users have them
      const { data: apiKeys } = await supabase
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
