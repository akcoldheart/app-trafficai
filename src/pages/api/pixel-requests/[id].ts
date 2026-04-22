import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getUserProfile, logAuditAction, checkIsAdmin, getEffectiveUserId } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  const profile = await getUserProfile(user.id, req, res);
  const isAdmin = await checkIsAdmin(profile);
  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('pixel_requests')
        .select('*, user:users!pixel_requests_user_id_fkey(email)')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Pixel request not found' });
        }
        console.error('Error fetching pixel request:', error);
        return res.status(500).json({ error: 'Failed to fetch pixel request' });
      }

      if (!isAdmin && data.user_id !== effectiveUserId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      return res.status(200).json({ request: data });
    }

    if (req.method === 'DELETE') {
      const { data: existing, error: fetchError } = await supabaseAdmin
        .from('pixel_requests')
        .select('user_id, status')
        .eq('id', id)
        .single();

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Pixel request not found' });
        }
        return res.status(500).json({ error: 'Failed to fetch pixel request' });
      }

      if (!isAdmin) {
        if (existing.user_id !== effectiveUserId) {
          return res.status(403).json({ error: 'Access denied' });
        }
        if (existing.status !== 'pending') {
          return res.status(400).json({ error: 'Can only delete pending requests' });
        }
      }

      const { error } = await supabaseAdmin
        .from('pixel_requests')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('Error deleting pixel request:', error);
        return res.status(500).json({ error: 'Failed to delete pixel request' });
      }

      await logAuditAction(user.id, 'delete_pixel_request', req, res, 'pixel_request', id);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
