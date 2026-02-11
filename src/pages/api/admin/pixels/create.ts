import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can create pixels directly
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { name, domain, user_id, pixel_id, custom_installation_code, visitors_api_url } = req.body;

  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Pixel name is required' });
  }

  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ error: 'Domain is required' });
  }

  if (!user_id || typeof user_id !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  if (!pixel_id || typeof pixel_id !== 'string') {
    return res.status(400).json({ error: 'Pixel ID is required' });
  }

  if (!custom_installation_code || typeof custom_installation_code !== 'string') {
    return res.status(400).json({ error: 'Custom installation code is required' });
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

    // Create the pixel with custom pixel ID and installation code
    const insertData = {
      user_id: user_id as string,
      name: (name as string).trim(),
      domain: (domain as string).trim().toLowerCase(),
      pixel_code: (pixel_id as string).trim(),
      status: 'active' as const,
      events_count: 0,
      custom_installation_code: (custom_installation_code as string).trim(),
      ...(visitors_api_url && typeof visitors_api_url === 'string' && visitors_api_url.trim()
        ? { visitors_api_url: visitors_api_url.trim() }
        : {}),
    };

    const { data: pixel, error: pixelError } = await supabase
      .from('pixels')
      .insert(insertData)
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
