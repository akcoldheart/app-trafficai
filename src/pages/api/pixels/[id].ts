import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, getUserProfile, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid pixel ID' });
  }

  const supabase = createClient(req, res);

  // Get user profile to check role
  const profile = await getUserProfile(user.id, req, res);
  const isAdmin = profile.role === 'admin';

  try {
    if (req.method === 'GET') {
      // Get single pixel - admin can get any, user can only get their own
      let query = supabase.from('pixels').select('*').eq('id', id);
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query.single();

      if (error || !data) {
        return res.status(404).json({ error: 'Pixel not found' });
      }

      return res.status(200).json({ pixel: data });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      // Update pixel - admin can update any, including custom_installation_code
      const { name, domain, status, custom_installation_code } = req.body;
      const updates: Record<string, unknown> = {};

      if (name !== undefined) updates.name = name;
      if (domain !== undefined) updates.domain = domain;
      if (status !== undefined) updates.status = status;

      // Only admins can update custom_installation_code
      if (isAdmin && custom_installation_code !== undefined) {
        updates.custom_installation_code = custom_installation_code;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.updated_at = new Date().toISOString();

      let query = supabase.from('pixels').update(updates).eq('id', id);
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query.select().single();

      if (error) {
        console.error('Error updating pixel:', error);
        return res.status(500).json({ error: 'Failed to update pixel' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Pixel not found' });
      }

      await logAuditAction(user.id, 'update_pixel', req, res, 'pixel', id, { updated_fields: Object.keys(updates) });
      return res.status(200).json({ pixel: data });
    }

    if (req.method === 'DELETE') {
      // Delete pixel - admin can delete any, user can only delete their own

      // First, check if the pixel exists and user has permission
      let checkQuery = supabase.from('pixels').select('id').eq('id', id);
      if (!isAdmin) {
        checkQuery = checkQuery.eq('user_id', user.id);
      }
      const { data: pixelCheck } = await checkQuery.single();

      if (!pixelCheck) {
        return res.status(404).json({ error: 'Pixel not found or access denied' });
      }

      // Clear any references in pixel_requests table
      await supabase
        .from('pixel_requests')
        .update({ pixel_id: null })
        .eq('pixel_id', id);

      // Now delete the pixel
      let query = supabase.from('pixels').delete().eq('id', id);
      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { error } = await query;

      if (error) {
        console.error('Error deleting pixel:', error);
        return res.status(500).json({ error: 'Failed to delete pixel' });
      }

      await logAuditAction(user.id, 'delete_pixel', req, res, 'pixel', id);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
