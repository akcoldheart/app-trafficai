import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('klaviyo_integrations')
      .select('id, is_connected, default_list_id, default_list_name, auto_sync_visitors, auto_sync_pixel_id, last_synced_at, created_at, updated_at')
      .eq('user_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }

    return res.status(200).json({ integration: data || null });
  }

  if (req.method === 'PUT') {
    const { default_list_id, default_list_name, auto_sync_visitors, auto_sync_pixel_id } = req.body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (default_list_id !== undefined) updates.default_list_id = default_list_id;
    if (default_list_name !== undefined) updates.default_list_name = default_list_name;
    if (auto_sync_visitors !== undefined) updates.auto_sync_visitors = auto_sync_visitors;
    if (auto_sync_pixel_id !== undefined) updates.auto_sync_pixel_id = auto_sync_pixel_id;

    const { data, error } = await supabaseAdmin
      .from('klaviyo_integrations')
      .update(updates)
      .eq('user_id', user.id)
      .select('id, is_connected, default_list_id, default_list_name, auto_sync_visitors, auto_sync_pixel_id, last_synced_at')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update integration settings' });
    }

    return res.status(200).json({ integration: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('klaviyo_integrations')
      .delete()
      .eq('user_id', user.id);

    if (error) {
      return res.status(500).json({ error: 'Failed to disconnect Klaviyo' });
    }

    return res.status(200).json({ success: true, message: 'Klaviyo disconnected' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
