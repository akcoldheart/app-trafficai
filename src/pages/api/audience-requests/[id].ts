import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, getUserProfile, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  const supabase = createClient(req, res);
  const profile = await getUserProfile(user.id, req, res);
  const isAdmin = profile.role === 'admin';

  try {
    if (req.method === 'GET') {
      // Get single audience request
      const { data, error } = await supabase
        .from('audience_requests')
        .select('*, user:users!audience_requests_user_id_fkey(email)')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Audience request not found' });
        }
        console.error('Error fetching audience request:', error);
        return res.status(500).json({ error: 'Failed to fetch audience request' });
      }

      // Check access
      if (!isAdmin && data.user_id !== user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      return res.status(200).json({ request: data });
    }

    if (req.method === 'DELETE') {
      // Only allow deleting own pending requests (or admin can delete any)
      const { data: existing, error: fetchError } = await supabase
        .from('audience_requests')
        .select('user_id, status')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Audience request not found' });
        }
        return res.status(500).json({ error: 'Failed to fetch audience request' });
      }

      // Check permissions
      if (!isAdmin) {
        if (existing.user_id !== user.id) {
          return res.status(403).json({ error: 'Access denied' });
        }
        if (existing.status !== 'pending') {
          return res.status(400).json({ error: 'Can only delete pending requests' });
        }
      }

      const { error } = await supabase
        .from('audience_requests')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting audience request:', error);
        return res.status(500).json({ error: 'Failed to delete audience request' });
      }

      await logAuditAction(user.id, 'delete_audience_request', req, res, 'audience_request', id);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
