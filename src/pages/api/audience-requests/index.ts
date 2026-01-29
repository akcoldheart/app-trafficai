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
        .from('audience_requests')
        .select('*, user:users!audience_requests_user_id_fkey(email)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      // Filter by status if provided
      const { status, has_manual } = req.query;
      if (status && typeof status === 'string' && ['pending', 'approved', 'rejected'].includes(status)) {
        query = query.eq('status', status as 'pending' | 'approved' | 'rejected');
      }

      // Filter for manual audiences only (has form_data.manual_audience)
      if (has_manual === 'true') {
        query = query.not('form_data->manual_audience', 'is', null);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching audience requests:', error);
        return res.status(500).json({ error: 'Failed to fetch audience requests' });
      }

      return res.status(200).json({ requests: data || [] });
    }

    if (req.method === 'POST') {
      // Submit new audience request
      const { request_type, name, form_data } = req.body;

      if (!request_type || !name || !form_data) {
        return res.status(400).json({ error: 'Request type, name, and form data are required' });
      }

      if (!['standard', 'custom'].includes(request_type)) {
        return res.status(400).json({ error: 'Invalid request type' });
      }

      // Get user email for notification
      const profile = await getUserProfile(user.id, req, res);

      const { data, error } = await supabase
        .from('audience_requests')
        .insert({
          user_id: user.id,
          request_type,
          name,
          form_data,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating audience request:', error);
        return res.status(500).json({ error: 'Failed to submit audience request' });
      }

      // Create admin notification
      await createAdminNotification(
        req,
        res,
        'audience_request',
        'New Audience Request',
        `${profile.email} has submitted a ${request_type} audience request: ${name}`,
        data.id,
        'audience_request'
      );

      await logAuditAction(user.id, 'submit_audience_request', req, res, 'audience_request', data.id, { request_type, name });
      return res.status(201).json({ request: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
