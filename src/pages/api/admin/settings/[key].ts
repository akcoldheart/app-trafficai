import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can access settings
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { key } = req.query;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Setting key is required' });
  }

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', key)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Setting not found' });
        }
        return res.status(500).json({ error: 'Failed to fetch setting' });
      }

      return res.status(200).json({ setting: data });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { value, description } = req.body;

      if (value === undefined) {
        return res.status(400).json({ error: 'Value is required' });
      }

      const updateData: { value: string; description?: string; updated_at: string } = {
        value,
        updated_at: new Date().toISOString(),
      };

      if (description !== undefined) {
        updateData.description = description;
      }

      const { data, error } = await supabase
        .from('app_settings')
        .update(updateData)
        .eq('key', key)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Setting not found' });
        }
        console.error('Error updating setting:', error);
        return res.status(500).json({ error: 'Failed to update setting' });
      }

      await logAuditAction(authResult.user.id, 'update_app_setting', req, res, 'app_setting', data.id, { key });
      return res.status(200).json({ setting: data });
    }

    if (req.method === 'DELETE') {
      // Prevent deletion of core settings
      if (['api_base_url', 'api_endpoints'].includes(key)) {
        return res.status(400).json({ error: 'Cannot delete core settings' });
      }

      const { data, error } = await supabase
        .from('app_settings')
        .delete()
        .eq('key', key)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Setting not found' });
        }
        console.error('Error deleting setting:', error);
        return res.status(500).json({ error: 'Failed to delete setting' });
      }

      await logAuditAction(authResult.user.id, 'delete_app_setting', req, res, 'app_setting', data.id, { key });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
