import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, clearTeamContextCache } from '@/lib/api-helpers';

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

  const { email, password, fullName, role = 'member' } = req.body;

  if (!email || typeof email !== 'string') {
    return res.status(400).json({ error: 'Email is required' });
  }
  if (!password || typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!['admin', 'member'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  try {
    // Verify user owns a team
    const { data: team } = await supabaseAdmin
      .from('teams')
      .select('id, name, max_seats')
      .eq('owner_user_id', user.id)
      .single();

    if (!team) {
      return res.status(403).json({ error: 'You do not own a team' });
    }

    // Dynamically resolve max seats from admin settings based on owner's current plan
    const { data: ownerProfile } = await supabaseAdmin
      .from('users')
      .select('plan, trial_ends_at')
      .eq('id', user.id)
      .single();

    const planKey = `team_seats_${ownerProfile?.plan || 'starter'}`;
    const { data: seatSetting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', planKey)
      .single();

    const maxSeats = seatSetting ? parseInt(seatSetting.value, 10) : team.max_seats;

    // Check seat limit
    const { count: memberCount } = await supabaseAdmin
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('team_id', team.id);

    const totalUsed = (memberCount || 0) + 1; // +1 for owner
    if (totalUsed >= maxSeats) {
      return res.status(400).json({
        error: `Team seat limit reached (${maxSeats}). Upgrade your plan to add more members.`,
      });
    }

    // Check if a user with this email already exists
    const { data: existingUsers } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .limit(1);

    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    // Create the user account via Supabase Auth admin
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: fullName || null,
      },
    });

    if (authError) {
      console.error('Error creating user:', authError);
      return res.status(400).json({ error: authError.message });
    }

    if (!authData.user) {
      return res.status(500).json({ error: 'Failed to create user account' });
    }

    const newUserId = authData.user.id;

    // Wait briefly for the auth trigger to create the users row
    await new Promise(resolve => setTimeout(resolve, 500));

    // Sync plan + trial_ends_at from the team owner so the member inherits
    // the owner's subscription. The handle_new_user() trigger seeded them with
    // plan='trial' + 7-day trial_ends_at; without this overwrite the member
    // would appear trial-expired a week later (migration 065).
    const memberUpdates: Record<string, unknown> = {
      plan: ownerProfile?.plan ?? 'trial',
      trial_ends_at: ownerProfile?.trial_ends_at ?? null,
    };
    if (fullName) {
      memberUpdates.full_name = fullName;
    }
    await supabaseAdmin
      .from('users')
      .update(memberUpdates)
      .eq('id', newUserId);

    // Add as team member
    const { error: memberError } = await supabaseAdmin
      .from('team_members')
      .insert({
        team_id: team.id,
        user_id: newUserId,
        role,
      });

    if (memberError) {
      console.error('Error adding team member:', memberError);
      // Clean up: delete the auth user if team membership fails
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      return res.status(500).json({ error: 'Failed to add member to team' });
    }

    clearTeamContextCache(newUserId);

    return res.status(201).json({
      success: true,
      member: {
        id: newUserId,
        email: email.toLowerCase(),
        full_name: fullName || null,
        role,
      },
    });
  } catch (error) {
    console.error('Error adding team member:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
