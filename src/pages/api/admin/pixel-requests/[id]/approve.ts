import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';

function generatePixelCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = 'px_';
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can approve pixel requests
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  const { admin_notes } = req.body;
  const supabase = createClient(req, res);

  try {
    // Get the pixel request
    const { data: pixelRequest, error: fetchError } = await supabase
      .from('pixel_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({ error: 'Pixel request not found' });
      }
      return res.status(500).json({ error: 'Failed to fetch pixel request' });
    }

    if (pixelRequest.status !== 'pending') {
      return res.status(400).json({ error: 'Request has already been processed' });
    }

    // Create the pixel
    const pixelCode = generatePixelCode();
    const { data: pixel, error: pixelError } = await supabase
      .from('pixels')
      .insert({
        user_id: pixelRequest.user_id,
        name: pixelRequest.name,
        domain: pixelRequest.domain,
        pixel_code: pixelCode,
        status: 'pending',
        events_count: 0,
      })
      .select()
      .single();

    if (pixelError) {
      console.error('Error creating pixel:', pixelError);
      return res.status(500).json({ error: 'Failed to create pixel' });
    }

    // Update the request status
    const { data: updatedRequest, error: updateError } = await supabase
      .from('pixel_requests')
      .update({
        status: 'approved',
        admin_notes: admin_notes || null,
        reviewed_by: authResult.user.id,
        reviewed_at: new Date().toISOString(),
        pixel_id: pixel.id,
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating pixel request:', updateError);
      return res.status(500).json({ error: 'Failed to update pixel request' });
    }

    await logAuditAction(
      authResult.user.id,
      'approve_pixel_request',
      req,
      res,
      'pixel_request',
      id,
      { pixel_id: pixel.id }
    );

    return res.status(200).json({
      success: true,
      request: updatedRequest,
      pixel,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
