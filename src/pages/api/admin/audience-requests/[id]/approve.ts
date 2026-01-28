import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, getUserApiKey, logAuditAction } from '@/lib/api-helpers';

const TRAFFIC_AI_API_URL = process.env.TRAFFIC_AI_API_URL;

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

  const { admin_notes, edited_name, edited_form_data } = req.body;
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

    // Get the requesting user's API key
    const apiKey = await getUserApiKey(audienceRequest.user_id, req, res);
    if (!apiKey) {
      return res.status(400).json({ error: 'User does not have an API key assigned' });
    }

    // Use edited data if provided, otherwise use original request data
    const finalName = edited_name || audienceRequest.name;
    const formData = (edited_form_data || audienceRequest.form_data) as Record<string, unknown>;
    let audienceId: string | null = null;

    if (audienceRequest.request_type === 'standard') {
      // Standard audience creation
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
      // Custom audience creation
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

    // Update the request status
    const { data: updatedRequest, error: updateError } = await supabase
      .from('audience_requests')
      .update({
        status: 'approved',
        admin_notes: admin_notes || null,
        reviewed_by: authResult.user.id,
        reviewed_at: new Date().toISOString(),
        audience_id: audienceId,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating audience request:', updateError);
      return res.status(500).json({ error: 'Failed to update audience request' });
    }

    await logAuditAction(
      authResult.user.id,
      'approve_audience_request',
      req,
      res,
      'audience_request',
      id,
      { audience_id: audienceId }
    );

    return res.status(200).json({
      success: true,
      request: updatedRequest,
      audience_id: audienceId,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
