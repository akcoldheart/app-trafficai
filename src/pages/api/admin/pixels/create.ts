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

  // Only admins can create pixels directly
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { name, domain, user_id, custom_installation_code } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Pixel name is required' });
  }

  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'Domain is required' });
  }

  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
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

    // Generate pixel code
    const pixelCode = generatePixelCode();

    // Create the pixel with optional custom installation code
    const { data: pixel, error: pixelError } = await supabase
      .from('pixels')
      .insert({
        user_id: user_id,
        name: name.trim(),
        domain: domain.trim().toLowerCase(),
        pixel_code: pixelCode,
        status: 'active',
        events_count: 0,
        custom_installation_code: custom_installation_code || null,
      })
      .select()
      .single();

    if (pixelError) {
      console.error('Error creating pixel:', pixelError);
      return res.status(500).json({ error: 'Failed to create pixel' });
    }

    // Log the action
    await logAuditAction(
      authResult.user.id,
      'admin_create_pixel',
      req,
      res,
      'pixel',
      pixel.id,
      { user_id, user_email: user.email }
    );

    return res.status(201).json({
      success: true,
      pixel,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
