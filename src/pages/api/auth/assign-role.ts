import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/api';

// Service role client to bypass RLS
const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Get the authenticated user from the request
  const supabase = createClient(req, res);
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Get user's current data
    const { data: userData, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, role_id, full_name, phone, company, plan, trial_ends_at, created_at, onboarding_completed')
      .eq('id', user.id)
      .single();

    if (userError) {
      console.error('Error fetching user:', userError);
      return res.status(500).json({ error: 'Failed to fetch user data' });
    }

    // If user already has role_id, just return their data
    if (userData?.role_id) {
      // Fetch role details and menu items
      const { data: roleData } = await supabaseAdmin
        .from('roles')
        .select('*')
        .eq('id', userData.role_id)
        .single();

      const { data: permissionsData } = await supabaseAdmin
        .from('role_permissions')
        .select(`
          menu_item_id,
          menu_items (*)
        `)
        .eq('role_id', userData.role_id);

      const menuItems = (permissionsData || [])
        .map((p: any) => p.menu_items)
        .filter((m: any) => m !== null && m.is_active)
        .sort((a: any, b: any) => a.display_order - b.display_order);

      return res.status(200).json({
        profile: userData,
        role: roleData,
        menuItems,
      });
    }

    // User doesn't have role_id - assign based on role string or default to 'user'
    // Map 'partner' to 'user' since partner role was deprecated
    let roleName = userData?.role || 'user';
    if (roleName === 'partner') {
      roleName = 'user';
      // Also update the user's role string
      await supabaseAdmin
        .from('users')
        .update({ role: 'user' })
        .eq('id', user.id);
    }

    // Look up the role
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('*')
      .eq('name', roleName)
      .single();

    if (roleError || !roleData) {
      console.error('Role not found:', roleName, roleError);
      return res.status(500).json({ error: `Role '${roleName}' not found in database` });
    }

    // Update the user's role_id
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ role_id: roleData.id })
      .eq('id', user.id);

    if (updateError) {
      console.error('Error updating user role_id:', updateError);
      return res.status(500).json({ error: 'Failed to assign role' });
    }

    // Fetch menu items for this role
    const { data: permissionsData } = await supabaseAdmin
      .from('role_permissions')
      .select(`
        menu_item_id,
        menu_items (*)
      `)
      .eq('role_id', roleData.id);

    const menuItems = (permissionsData || [])
      .map((p: any) => p.menu_items)
      .filter((m: any) => m !== null && m.is_active)
      .sort((a: any, b: any) => a.display_order - b.display_order);

    return res.status(200).json({
      profile: { ...userData, role_id: roleData.id },
      role: roleData,
      menuItems,
    });
  } catch (error) {
    console.error('Assign role error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
