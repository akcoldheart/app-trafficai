import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/api-helpers';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    // Check if user owns a team
    const { data: ownedTeam, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('*')
      .eq('owner_user_id', user.id)
      .maybeSingle();

    if (teamError) {
      console.error('Error fetching team:', teamError);
      return res.status(500).json({ error: 'Failed to fetch team: ' + teamError.message });
    }

    if (ownedTeam) {
      // Fetch members
      const { data: members } = await supabaseAdmin
        .from('team_members')
        .select('id, user_id, role, joined_at')
        .eq('team_id', ownedTeam.id);

      // Fetch member profiles
      const memberProfiles = [];
      for (const member of members || []) {
        const { data: profile } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name')
          .eq('id', member.user_id)
          .single();
        if (profile) {
          memberProfiles.push({
            ...member,
            email: profile.email,
            full_name: profile.full_name,
          });
        }
      }

      // Get owner profile
      const { data: ownerProfile } = await supabaseAdmin
        .from('users')
        .select('email, full_name')
        .eq('id', user.id)
        .single();

      return res.status(200).json({
        team: ownedTeam,
        role: 'owner',
        members: memberProfiles || [],
        owner: {
          id: user.id,
          email: ownerProfile?.email,
          full_name: ownerProfile?.full_name,
        },
        seatUsage: {
          used: (memberProfiles?.length || 0) + 1, // +1 for owner
          max: ownedTeam.max_seats,
        },
      });
    }

    // Check if user is a member of a team
    const { data: membership } = await supabaseAdmin
      .from('team_members')
      .select('id, team_id, role, joined_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (membership) {
      const { data: team } = await supabaseAdmin
        .from('teams')
        .select('*')
        .eq('id', membership.team_id)
        .single();

      if (team) {
        // Fetch owner profile
        const { data: ownerProfile } = await supabaseAdmin
          .from('users')
          .select('id, email, full_name')
          .eq('id', team.owner_user_id)
          .single();

        // Fetch other members
        const { data: members } = await supabaseAdmin
          .from('team_members')
          .select('id, user_id, role, joined_at')
          .eq('team_id', team.id);

        const memberProfiles = [];
        for (const member of members || []) {
          const { data: profile } = await supabaseAdmin
            .from('users')
            .select('id, email, full_name')
            .eq('id', member.user_id)
            .single();
          if (profile) {
            memberProfiles.push({
              ...member,
              email: profile.email,
              full_name: profile.full_name,
            });
          }
        }

        return res.status(200).json({
          team,
          role: membership.role,
          members: memberProfiles || [],
          owner: ownerProfile,
          seatUsage: {
            used: (memberProfiles?.length || 0) + 1,
            max: team.max_seats,
          },
        });
      }
    }

    // No team
    return res.status(200).json({ team: null });
  } catch (error) {
    console.error('Error fetching team:', error);
    return res.status(500).json({ error: 'Failed to fetch team data' });
  }
}
