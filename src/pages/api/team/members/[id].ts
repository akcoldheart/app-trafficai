import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, clearTeamContextCache } from '@/lib/api-helpers';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE' && req.method !== 'PATCH') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const memberId = req.query.id as string;

  try {
    // Get the membership record
    const { data: membership } = await supabaseAdmin
      .from('team_members')
      .select('id, team_id, user_id')
      .eq('id', memberId)
      .single();

    if (!membership) {
      return res.status(404).json({ error: 'Member not found' });
    }

    // Get the team
    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('owner_user_id')
      .eq('id', membership.team_id)
      .single();

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const isOwner = team.owner_user_id === user.id;
    const isSelf = membership.user_id === user.id;

    if (req.method === 'PATCH') {
      if (!isOwner) {
        return res.status(403).json({ error: 'Only the team owner can change member roles' });
      }

      const { role } = (req.body ?? {}) as { role?: string };
      if (role !== 'admin' && role !== 'member') {
        return res.status(400).json({ error: 'Role must be "admin" or "member"' });
      }

      const { data: updated, error } = await supabaseAdmin
        .from('team_members')
        .update({ role })
        .eq('id', memberId)
        .select('id, role')
        .single();

      if (error) {
        console.error('Error updating team member role:', error);
        return res.status(500).json({ error: 'Failed to update member role' });
      }

      clearTeamContextCache(membership.user_id);

      return res.status(200).json({
        success: true,
        member: updated,
        message: 'Member role updated',
      });
    }

    // DELETE: allow team owner removing a member, OR member removing themselves (leaving)
    if (!isOwner && !isSelf) {
      return res.status(403).json({ error: 'Only the team owner can remove members' });
    }

    const { error } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      console.error('Error removing team member:', error);
      return res.status(500).json({ error: 'Failed to remove member' });
    }

    clearTeamContextCache(membership.user_id);

    return res.status(200).json({
      success: true,
      message: isSelf ? 'You have left the team' : 'Member removed from team',
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
