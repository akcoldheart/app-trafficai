import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getUserProfile, createAdminNotification, logAuditAction, getEffectiveUserId } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);
  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    if (req.method === 'GET') {
      // Get user's role to determine access level
      const profile = await getUserProfile(user.id, req, res);
      const isAdmin = profile.role === 'admin';

      // Build query - admins see all, users see only their own
      // Use admin client to bypass RLS (team members need to see owner's data)
      let query = supabaseAdmin
        .from('audience_requests')
        .select('*, user:users!audience_requests_user_id_fkey(email)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('user_id', effectiveUserId);
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

      let results = data || [];

      // For non-admin users, also include audiences assigned via audience_assignments
      if (!isAdmin) {
        const { data: assignments } = await supabaseAdmin
          .from('audience_assignments')
          .select('audience_id')
          .eq('user_id', effectiveUserId);

        if (assignments && assignments.length > 0) {
          const assignedIds = assignments.map(a => a.audience_id);
          const ownAudienceIds = new Set(results.map(r => r.audience_id).filter(Boolean));
          const extraIds = assignedIds.filter(id => !ownAudienceIds.has(id));

          if (extraIds.length > 0) {
            let assignedQuery = supabaseAdmin
              .from('audience_requests')
              .select('*, user:users!audience_requests_user_id_fkey(email)')
              .in('audience_id', extraIds)
              .order('created_at', { ascending: false });

            if (status && typeof status === 'string' && ['pending', 'approved', 'rejected'].includes(status)) {
              assignedQuery = assignedQuery.eq('status', status);
            }
            if (has_manual === 'true') {
              assignedQuery = assignedQuery.not('form_data->manual_audience', 'is', null);
            }

            const { data: assignedData } = await assignedQuery;
            if (assignedData) {
              results = [...results, ...assignedData];
            }
          }
        }
      }

      return res.status(200).json({ requests: results });
    }

    if (req.method === 'POST') {
      // Submit new audience request
      const { request_type, name, form_data, data_points } = req.body;

      if (!request_type || !name || !form_data) {
        return res.status(400).json({ error: 'Request type, name, and form data are required' });
      }

      if (!['standard', 'custom', 'delete'].includes(request_type)) {
        return res.status(400).json({ error: 'Invalid request type' });
      }

      // For delete requests, require audience_id in form_data
      if (request_type === 'delete') {
        const audienceId = (form_data as Record<string, unknown>)?.audience_id;
        if (!audienceId) {
          return res.status(400).json({ error: 'audience_id is required for delete requests' });
        }
      }

      // Get user email for notification
      const profile = await getUserProfile(user.id, req, res);

      const { data, error } = await supabaseAdmin
        .from('audience_requests')
        .insert({
          user_id: effectiveUserId,
          request_type,
          name,
          form_data,
          data_points: Array.isArray(data_points) ? data_points : [],
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating audience request:', error);
        return res.status(500).json({ error: 'Failed to submit audience request' });
      }

      // Create admin notification
      const notifTitle = request_type === 'delete' ? 'Audience Removal Request' : 'New Audience Request';
      const notifMsg = request_type === 'delete'
        ? `${profile.email} has requested to remove audience: ${name}`
        : `${profile.email} has submitted a ${request_type} audience request: ${name}`;

      await createAdminNotification(
        req,
        res,
        'audience_request',
        notifTitle,
        notifMsg,
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
