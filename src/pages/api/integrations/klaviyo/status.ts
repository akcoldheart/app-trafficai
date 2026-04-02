import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('platform_integrations')
      .select('id, is_connected, config, last_synced_at, created_at, updated_at')
      .eq('user_id', effectiveUserId)
      .eq('platform', 'klaviyo')
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }

    if (!data) {
      return res.status(200).json({ integration: null });
    }

    const config = (data.config || {}) as Record<string, unknown>;
    return res.status(200).json({
      integration: {
        id: data.id,
        is_connected: data.is_connected,
        default_list_id: config.default_list_id || null,
        default_list_name: config.default_list_name || null,
        auto_sync_visitors: config.auto_sync_visitors || false,
        auto_sync_pixel_id: config.auto_sync_pixel_id || null,
        last_synced_at: data.last_synced_at,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
    });
  }

  if (req.method === 'PUT') {
    const { default_list_id, default_list_name, auto_sync_visitors, auto_sync_pixel_id } = req.body;

    // First fetch the existing config
    const { data: existing } = await supabaseAdmin
      .from('platform_integrations')
      .select('config')
      .eq('user_id', effectiveUserId)
      .eq('platform', 'klaviyo')
      .single();

    const existingConfig = (existing?.config || {}) as Record<string, unknown>;
    const configUpdates: Record<string, unknown> = { ...existingConfig };
    if (default_list_id !== undefined) configUpdates.default_list_id = default_list_id;
    if (default_list_name !== undefined) configUpdates.default_list_name = default_list_name;
    if (auto_sync_visitors !== undefined) configUpdates.auto_sync_visitors = auto_sync_visitors;
    if (auto_sync_pixel_id !== undefined) configUpdates.auto_sync_pixel_id = auto_sync_pixel_id;

    const { data, error } = await supabaseAdmin
      .from('platform_integrations')
      .update({ config: configUpdates, updated_at: new Date().toISOString() })
      .eq('user_id', effectiveUserId)
      .eq('platform', 'klaviyo')
      .select('id, is_connected, config, last_synced_at')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update integration settings' });
    }

    const config = (data.config || {}) as Record<string, unknown>;
    return res.status(200).json({
      integration: {
        id: data.id,
        is_connected: data.is_connected,
        default_list_id: config.default_list_id || null,
        default_list_name: config.default_list_name || null,
        auto_sync_visitors: config.auto_sync_visitors || false,
        auto_sync_pixel_id: config.auto_sync_pixel_id || null,
        last_synced_at: data.last_synced_at,
      },
    });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('platform_integrations')
      .delete()
      .eq('user_id', effectiveUserId)
      .eq('platform', 'klaviyo');

    if (error) {
      return res.status(500).json({ error: 'Failed to disconnect Klaviyo' });
    }

    return res.status(200).json({ success: true, message: 'Klaviyo disconnected' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
