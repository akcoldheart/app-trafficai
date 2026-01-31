import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(supabaseUrl, supabaseServiceKey);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // Anyone can read active guides
      const { platform } = req.query;

      let query = supabase
        .from('installation_guides')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (platform) {
        const platformStr = Array.isArray(platform) ? platform[0] : platform;
        query = query.eq('platform', platformStr);
      }

      const { data, error } = await query;

      if (error) throw error;

      return res.status(200).json({ guides: data });
    }

    if (req.method === 'POST') {
      // Only admins can create guides
      const user = await getAuthenticatedUser(req, res);
      if (!user) return;

      // Check if admin
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      if (userData?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { platform, title, description, content, icon, display_order, is_active } = req.body;

      if (!platform || !title || !content) {
        return res.status(400).json({ error: 'Platform, title, and content are required' });
      }

      const serviceClient = getServiceClient();
      const { data, error } = await serviceClient
        .from('installation_guides')
        .insert({
          platform,
          title,
          description,
          content,
          icon,
          display_order: display_order || 0,
          is_active: is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({ guide: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Installation guides API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
