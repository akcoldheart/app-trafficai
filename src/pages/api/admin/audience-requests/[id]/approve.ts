import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole, getUserApiKey, logAuditAction } from '@/lib/api-helpers';

const TRAFFIC_AI_API_URL = process.env.TRAFFIC_AI_API_URL;

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can approve audience requests
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  const { admin_notes, edited_name, edited_form_data, assigned_user_id } = req.body;
  const supabase = createClient(req, res);

  try {
    // Get the audience request
    const { data: audienceRequest, error: fetchError } = await supabase
      .from('audience_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Audience request not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch audience request' });
    }

    if (audienceRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    const formData = (edited_form_data || audienceRequest.form_data) as Record<string, unknown>;
    let audienceId: string | null = null;

    if (audienceRequest.request_type === 'delete') {
      // Handle delete request approval — unassign the user from the audience
      const targetAudienceId = formData.audience_id as string;
      const requestingUserId = audienceRequest.user_id;

      if (!targetAudienceId) {
        return res.status(400).json({ error: 'No audience_id found in delete request' });
      }

      // Remove this user's assignment from audience_assignments table
      await supabaseAdmin
        .from('audience_assignments')
        .delete()
        .eq('audience_id', targetAudienceId)
        .eq('user_id', requestingUserId);

      // Also remove ownership from the original audience_request if this user is the owner.
      // Reassign to the approving admin so the audience stays visible in admin view.
      const { data: originalRequest } = await supabaseAdmin
        .from('audience_requests')
        .select('id, user_id')
        .eq('audience_id', targetAudienceId)
        .eq('user_id', requestingUserId)
        .neq('request_type', 'delete')
        .single();

      if (originalRequest) {
        await supabaseAdmin
          .from('audience_requests')
          .update({ user_id: authResult.user.id })
          .eq('id', originalRequest.id);
      }

      audienceId = targetAudienceId;
    } else {
      // Handle standard/custom audience creation
      const effectiveUserId = assigned_user_id || audienceRequest.user_id;

      const apiKey = await getUserApiKey(effectiveUserId, req, res);
      if (!apiKey) {
        return res.status(400).json({ error: 'Assigned user does not have an API key assigned' });
      }

      const finalName = edited_name || audienceRequest.name;

      if (audienceRequest.request_type === 'standard') {
        const audiencePayload = {
          name: finalName,
          filters: formData.filters || {},
          days_back: formData.days_back || 7,
          ...(formData.segment ? { segment: formData.segment } : {}),
        };

        const response = await fetch(`${TRAFFIC_AI_API_URL}/audiences`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify(audiencePayload),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error('Traffic AI API error:', data);
          return res.status(response.status).json({
            error: data.error || 'Failed to create audience via Traffic AI'
          });
        }

        audienceId = data.id || data.audienceId;
      } else {
        const customPayload = {
          topic: formData.topic || audienceRequest.name,
          description: formData.description || '',
        };

        const response = await fetch(`${TRAFFIC_AI_API_URL}/audiences/custom`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          body: JSON.stringify(customPayload),
        });

        const data = await response.json();

        if (!response.ok) {
          console.error('Traffic AI API error:', data);
          return res.status(response.status).json({
            error: data.error || 'Failed to create custom audience via Traffic AI'
          });
        }

        audienceId = data.id || data.audienceId;
      }
    }

    // Update the request status (and reassign user_id if changed)
    const updatePayload: Record<string, unknown> = {
      status: 'approved',
      admin_notes: admin_notes || null,
      reviewed_by: authResult.user.id,
      reviewed_at: new Date().toISOString(),
      audience_id: audienceId,
    };
    if (assigned_user_id && assigned_user_id !== audienceRequest.user_id) {
      updatePayload.user_id = assigned_user_id;
    }

    // For delete requests, mark as approved (user was unassigned)
    // For create requests, mark as approved with the new audience_id
    const { error: updateError } = await supabaseAdmin
      .from('audience_requests')
      .update(updatePayload)
      .eq('id', id);

    if (updateError) {
      console.error('Error updating audience request:', updateError);
      return res.status(500).json({ error: 'Failed to update audience request' });
    }

    await logAuditAction(
      authResult.user.id,
      audienceRequest.request_type === 'delete' ? 'approve_audience_unassign_request' : 'approve_audience_request',
      req,
      res,
      'audience_request',
      id as string,
      { audience_id: audienceId }
    );

    // Delete associated notification
    await supabase
      .from('admin_notifications')
      .delete()
      .eq('reference_id', id)
      .eq('reference_type', 'audience_request');

    return res.status(200).json({
      success: true,
      audience_id: audienceId,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
