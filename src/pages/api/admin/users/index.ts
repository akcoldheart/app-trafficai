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
      // List all users with API key status (include role_id and plan for dropdowns)
      const { data: users, error } = await supabaseAdmin
        .from('users')
        .select('id, email, role, role_id, plan, company_website, trial_ends_at, created_at, updated_at')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get all API keys to check which users have them
      const { data: apiKeys } = await supabaseAdmin
        .from('user_api_keys')
        .select('user_id');

      const usersWithApiKeyIds = new Set(apiKeys?.map(k => k.user_id) || []);

      // Get all team member user IDs to exclude them from the global list
      const { data: teamMembers } = await supabaseAdmin
        .from('team_members')
        .select('user_id, team_id');
      const teamMemberIds = new Set(teamMembers?.map(m => m.user_id) || []);

      // Get team info: owner -> member count
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id, owner_user_id');
      const teamByOwner = new Map((teams || []).map(t => [t.owner_user_id, t.id]));

      // Count members per team
      const memberCountByTeam = new Map<string, number>();
      for (const m of teamMembers || []) {
        memberCountByTeam.set(m.team_id, (memberCountByTeam.get(m.team_id) || 0) + 1);
      }

      // Add has_api_key flag and team_member_count, filter out team members (sub-accounts)
      const usersWithStatus = (users || [])
        .filter(u => !teamMemberIds.has(u.id))
        .map(u => {
          const teamId = teamByOwner.get(u.id);
          return {
            ...u,
            has_api_key: usersWithApiKeyIds.has(u.id),
            team_member_count: teamId ? (memberCountByTeam.get(teamId) || 0) : 0,
          };
        });

      await logAuditAction(user.id, 'list_users', req, res);
      return res.status(200).json({ users: usersWithStatus });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
