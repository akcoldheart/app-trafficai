import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, clearTeamContextCache } from '@/lib/api-helpers';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
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

    // Allow: team owner removing a member, OR member removing themselves (leaving)
    const isOwner = team.owner_user_id === user.id;
    const isSelf = membership.user_id === user.id;

    if (!isOwner && !isSelf) {
      return res.status(403).json({ error: 'Only the team owner can remove members' });
    }

    // Remove the member
    const { error } = await supabaseAdmin
      .from('team_members')
      .delete()
      .eq('id', memberId);

    if (error) {
      console.error('Error removing team member:', error);
      return res.status(500).json({ error: 'Failed to remove member' });
    }

    // Clear team context cache for the removed user
    clearTeamContextCache(membership.user_id);

    return res.status(200).json({
      success: true,
      message: isSelf ? 'You have left the team' : 'Member removed from team',
    });
  } catch (error) {
    console.error('Error removing team member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
