import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can manage notifications
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Notification ID is required' });
  }

  const supabase = createClient(req, res);

  try {
    if (req.method === 'PUT') {
      // Mark notification as read/unread
      const { is_read } = req.body;

      if (typeof is_read !== 'boolean') {
        return res.status(400).json({ error: 'is_read must be a boolean' });
      }

      const { data, error } = await supabase
        .from('admin_notifications')
        .update({ is_read })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Notification not found' });
        }
        console.error('Error updating notification:', error);
        return res.status(500).json({ error: 'Failed to update notification' });
      }

      return res.status(200).json({ notification: data });
    }

    if (req.method === 'DELETE') {
      const { error } = await supabase
        .from('admin_notifications')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting notification:', error);
        return res.status(500).json({ error: 'Failed to delete notification' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
