import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, getUserApiKey, logAuditAction } from '@/lib/api-helpers';

const TRAFFIC_AI_API_URL = process.env.TRAFFIC_AI_API_URL;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can create audiences directly
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { user_id, request_type, name, form_data } = req.body;

  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (!request_type || !['standard', 'custom'].includes(request_type)) {
    return res.status(400).json({ error: 'Valid request type (standard/custom) is required' });
  }

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Audience name is required' });
  }

  const supabase = createClient(req, res);

  try {
    // Verify the user exists
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', user_id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the user's API key
    const apiKey = await getUserApiKey(user_id, req, res);
    if (!apiKey) {
      return res.status(400).json({ error: 'User does not have an API key assigned' });
    }

    let audienceId: string | null = null;

    if (request_type === 'standard') {
      // Standard audience creation
      const audiencePayload = {
        name: name.trim(),
        filters: form_data?.filters || {},
        days_back: form_data?.days_back || 7,
        ...(form_data?.segment ? { segment: form_data.segment } : {}),
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
        topic: form_data?.topic || name.trim(),
        description: form_data?.description || '',
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

    // Log the action
    await logAuditAction(
      authResult.user.id,
      'admin_create_audience',
      req,
      res,
      'audience',
      audienceId || 'unknown',
      { user_id, user_email: user.email, request_type }
    );

    return res.status(201).json({
      success: true,
      audience_id: audienceId,
      user_email: user.email,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
