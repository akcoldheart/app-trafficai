import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient } from '@/lib/supabase/api';
import type { Role, RoleWithUserCount } from '@/lib/supabase/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only admin can access role management
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    try {
      // Fetch all roles with user count
      const { data: roles, error } = await supabase
        .from('roles')
        .select('*')
        .order('name');

      if (error) throw error;

      // Get user count for each role
      const rolesWithCount: RoleWithUserCount[] = await Promise.all(
        (roles || []).map(async (role: Role) => {
          const { count } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true })
            .eq('role_id', role.id);

          return {
            ...role,
            user_count: count || 0,
          };
        })
      );

      return res.status(200).json({ roles: rolesWithCount });
    } catch (error) {
      console.error('Error fetching roles:', error);
      return res.status(500).json({ error: 'Failed to fetch roles' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { name, description, permissions } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ error: 'Role name is required' });
      }

      // Check if role name already exists
      const { data: existing } = await supabase
        .from('roles')
        .select('id')
        .eq('name', name.toLowerCase().trim())
        .single();

      if (existing) {
        return res.status(400).json({ error: 'Role with this name already exists' });
      }

      // Create the role
      const { data: role, error } = await supabase
        .from('roles')
        .insert({
          name: name.toLowerCase().trim(),
          description: description || null,
          is_system: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Assign permissions if provided
      if (permissions && Array.isArray(permissions) && permissions.length > 0) {
        const permissionInserts = permissions.map((menuItemId: string) => ({
          role_id: role.id,
          menu_item_id: menuItemId,
        }));

        const { error: permError } = await supabase
          .from('role_permissions')
          .insert(permissionInserts);

        if (permError) {
          console.error('Error assigning permissions:', permError);
        }
      }

      // Log the action
      await logAuditAction(
        auth.user.id,
        'create_role',
        req,
        res,
        'role',
        role.id,
        { name: role.name, permissions_count: permissions?.length || 0 }
      );

      return res.status(201).json({ role });
    } catch (error) {
      console.error('Error creating role:', error);
      return res.status(500).json({ error: 'Failed to create role' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
