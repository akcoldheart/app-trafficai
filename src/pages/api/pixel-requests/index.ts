import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, getUserProfile, createAdminNotification, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // Get user's role to determine access level
      const profile = await getUserProfile(user.id, req, res);
      const isAdmin = profile.role === 'admin';

      // Build query - admins see all, users see only their own
      let query = supabase
        .from('pixel_requests')
        .select('*, user:users!pixel_requests_user_id_fkey(email)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      // Filter by status if provided
      const { status } = req.query;
      if (status && typeof status === 'string' && ['pending', 'approved', 'rejected'].includes(status)) {
        query = query.eq('status', status as 'pending' | 'approved' | 'rejected');
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching pixel requests:', error);
        return res.status(500).json({ error: 'Failed to fetch pixel requests' });
      }

      return res.status(200).json({ requests: data || [] });
    }

    if (req.method === 'POST') {
      // Submit new pixel request
      const { name, domain } = req.body;

      if (!name || !domain) {
        return res.status(400).json({ error: 'Name and domain are required' });
      }

      // Get user email for notification
      const profile = await getUserProfile(user.id, req, res);

      const { data, error } = await supabase
        .from('pixel_requests')
        .insert({
          user_id: user.id,
          name,
          domain,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating pixel request:', error);
        return res.status(500).json({ error: 'Failed to submit pixel request' });
      }

      // Create admin notification
      await createAdminNotification(
        req,
        res,
        'pixel_request',
        'New Pixel Request',
        `${profile.email} has submitted a pixel request for ${domain}`,
        data.id,
        'pixel_request'
      );

      await logAuditAction(user.id, 'submit_pixel_request', req, res, 'pixel_request', data.id, { name, domain });
      return res.status(201).json({ request: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
