import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/api-helpers';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    // Check if user already owns a team
    const { data: existingTeam } = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('owner_user_id', user.id)
      .single();

    if (existingTeam) {
      return res.status(200).json({ team: existingTeam, message: 'Team already exists' });
    }

    // Check if user is a member of another team
    const { data: existingMembership } = await supabaseAdmin
      .from('team_members')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (existingMembership) {
      return res.status(400).json({ error: 'You are already a member of another team. Leave that team first.' });
    }

    // Get user's plan to determine seat limit
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('plan, full_name, company, email')
      .eq('id', user.id)
      .single();

    // Get seat limit from app_settings
    const planKey = `team_seats_${userProfile?.plan || 'starter'}`;
    const { data: seatSetting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', planKey)
      .single();

    const maxSeats = parseInt(seatSetting?.value || '2', 10);
    const teamName = userProfile?.company || `${userProfile?.full_name || userProfile?.email}'s Team`;

    const { data: team, error } = await supabaseAdmin
      .from('teams')
      .insert({
        owner_user_id: user.id,
        name: teamName,
        max_seats: maxSeats,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating team:', error);
      return res.status(500).json({ error: 'Failed to create team' });
    }

    return res.status(201).json({ team });
  } catch (error) {
    console.error('Error creating team:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
