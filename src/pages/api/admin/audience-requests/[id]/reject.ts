import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can reject audience requests
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  const { admin_notes } = req.body;
  const supabase = createClient(req, res);

  try {
    // Get the audience request
    const { data: audienceRequest, error: fetchError } = await supabase
      .from('audience_requests')
      .select('status')
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

    // Update the request status
    const { data: updatedRequest, error: updateError } = await supabase
      .from('audience_requests')
      .update({
        status: 'rejected',
        admin_notes: admin_notes || null,
        reviewed_by: authResult.user.id,
        reviewed_at: new Date().toISOString(),
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
      'reject_audience_request',
      req,
      res,
      'audience_request',
      id,
      { admin_notes }
    );

    return res.status(200).json({
      success: true,
      request: updatedRequest,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
