import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, logAuditAction } from '@/lib/api-helpers';

function generatePixelCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = 'px_';
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // List user's pixels
      const { data, error } = await supabase
        .from('pixels')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching pixels:', error);
        return res.status(500).json({ error: 'Failed to fetch pixels' });
      }

      return res.status(200).json({ pixels: data || [] });
    }

    if (req.method === 'POST') {
      // Create new pixel
      const { name, domain } = req.body;

      if (!name || !domain) {
        return res.status(400).json({ error: 'Name and domain are required' });
      }

      const pixelCode = generatePixelCode();

      const { data, error } = await supabase
        .from('pixels')
        .insert({
          user_id: user.id,
          name,
          domain,
          pixel_code: pixelCode,
          status: 'pending',
          events_count: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating pixel:', error);
        return res.status(500).json({ error: 'Failed to create pixel' });
      }

      await logAuditAction(user.id, 'create_pixel', req, res, 'pixel', data.id, { name, domain });
      return res.status(201).json({ pixel: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
