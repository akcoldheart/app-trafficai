import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient } from '@/lib/supabase/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only admin can access role management
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Role ID is required' });
  }

  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    try {
      // Fetch role details
      const { data: role, error: roleError } = await supabase
        .from('roles')
        .select('*')
        .eq('id', id)
        .single();

      if (roleError || !role) {
        return res.status(404).json({ error: 'Role not found' });
      }

      // Fetch role permissions
      const { data: permissions } = await supabase
        .from('role_permissions')
        .select('menu_item_id')
        .eq('role_id', id);

      // Get user count for this role
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role_id', id);

      return res.status(200).json({
        role,
        permissions: permissions || [],
        user_count: userCount || 0,
      });
    } catch (error) {
      console.error('Error fetching role:', error);
      return res.status(500).json({ error: 'Failed to fetch role' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { name, description, permissions } = req.body;

      // Check if role exists and get its properties
      const { data: existing, error: fetchError } = await supabase
        .from('roles')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      // Prepare update data
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      // System roles can only update description, not name
      if (existing.is_system) {
        if (description !== undefined) {
          updateData.description = description;
        }
      } else {
        // Non-system roles can update name and description
        if (name && typeof name === 'string') {
          // Check if new name conflicts with existing role
          const { data: nameConflict } = await supabase
            .from('roles')
            .select('id')
            .eq('name', name.toLowerCase().trim())
            .neq('id', id)
            .single();

          if (nameConflict) {
            return res.status(400).json({ error: 'Role with this name already exists' });
          }
          updateData.name = name.toLowerCase().trim();
        }
        if (description !== undefined) {
          updateData.description = description;
        }
      }

      // Update role
      const { data: role, error: updateError } = await supabase
        .from('roles')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (updateError) throw updateError;

      // Update permissions if provided
      if (permissions !== undefined && Array.isArray(permissions)) {
        // Delete existing permissions
        await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', id);

        // Insert new permissions
        if (permissions.length > 0) {
          const permissionInserts = permissions.map((menuItemId: string) => ({
            role_id: id,
            menu_item_id: menuItemId,
          }));

          const { error: permError } = await supabase
            .from('role_permissions')
            .insert(permissionInserts);

          if (permError) {
            console.error('Error updating permissions:', permError);
          }
        }
      }

      // Log the action
      await logAuditAction(
        auth.user.id,
        'update_role',
        req,
        res,
        'role',
        id,
        { name: role.name, permissions_count: permissions?.length }
      );

      return res.status(200).json({ role });
    } catch (error) {
      console.error('Error updating role:', error);
      return res.status(500).json({ error: 'Failed to update role' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      // Check if role exists and is not a system role
      const { data: existing, error: fetchError } = await supabase
        .from('roles')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !existing) {
        return res.status(404).json({ error: 'Role not found' });
      }

      if (existing.is_system) {
        return res.status(400).json({ error: 'Cannot delete system roles' });
      }

      // Check if any users have this role
      const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('role_id', id);

      if (userCount && userCount > 0) {
        return res.status(400).json({
          error: `Cannot delete role with ${userCount} assigned user(s). Reassign users first.`,
        });
      }

      // Delete role permissions first
      await supabase
        .from('role_permissions')
        .delete()
        .eq('role_id', id);

      // Delete the role
      const { error: deleteError } = await supabase
        .from('roles')
        .delete()
        .eq('id', id);

      if (deleteError) throw deleteError;

      // Log the action
      await logAuditAction(
        auth.user.id,
        'delete_role',
        req,
        res,
        'role',
        id,
        { name: existing.name }
      );

      return res.status(204).end();
    } catch (error) {
      console.error('Error deleting role:', error);
      return res.status(500).json({ error: 'Failed to delete role' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
