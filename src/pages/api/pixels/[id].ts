import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid pixel ID' });
  }

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // Get single pixel
      const { data, error } = await supabase
        .from('pixels')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Pixel not found' });
      }

      return res.status(200).json({ pixel: data });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      // Update pixel
      const { name, domain, status } = req.body;
      const updates: Record<string, unknown> = {};

      if (name !== undefined) updates.name = name;
      if (domain !== undefined) updates.domain = domain;
      if (status !== undefined) updates.status = status;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const { data, error } = await supabase
        .from('pixels')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating pixel:', error);
        return res.status(500).json({ error: 'Failed to update pixel' });
      }

      if (!data) {
        return res.status(404).json({ error: 'Pixel not found' });
      }

      await logAuditAction(user.id, 'update_pixel', req, res, 'pixel', id, updates);
      return res.status(200).json({ pixel: data });
    }

    if (req.method === 'DELETE') {
      // Delete pixel
      const { error } = await supabase
        .from('pixels')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

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
