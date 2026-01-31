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
  const { id } = req.query;
  const supabase = createClient(req, res);

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Guide ID is required' });
  }

  try {
    if (req.method === 'GET') {
      // Anyone can read a specific guide
      const { data, error } = await supabase
        .from('installation_guides')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Guide not found' });
        }
        throw error;
      }

      return res.status(200).json({ guide: data });
    }

    // For PUT and DELETE, require admin
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (userData?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const serviceClient = getServiceClient();

    if (req.method === 'PUT') {
      const { platform, title, description, content, icon, display_order, is_active } = req.body;

      const updateData: Record<string, any> = {};
      if (platform !== undefined) updateData.platform = platform;
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (content !== undefined) updateData.content = content;
      if (icon !== undefined) updateData.icon = icon;
      if (display_order !== undefined) updateData.display_order = display_order;
      if (is_active !== undefined) updateData.is_active = is_active;

      const { data, error } = await serviceClient
        .from('installation_guides')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ guide: data });
    }

    if (req.method === 'DELETE') {
      const { error } = await serviceClient
        .from('installation_guides')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Installation guide API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
