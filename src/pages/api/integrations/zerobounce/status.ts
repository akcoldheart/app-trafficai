import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { getZeroBounceCredits } from '@/lib/email-verification';
import { logEvent } from '@/lib/webhook-logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('platform_integrations')
      .select('id, platform, is_connected, config, last_synced_at, created_at, updated_at, api_key')
      .eq('user_id', user.id)
      .eq('platform', 'zerobounce')
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: error.message });
    }

    let credits = 0;
    if (data?.api_key) {
      try {
        credits = await getZeroBounceCredits(data.api_key);
      } catch { /* ignore credit check errors */ }
    }

    return res.status(200).json({
      integration: data ? {
        id: data.id,
        is_connected: data.is_connected,
        config: data.config,
        last_synced_at: data.last_synced_at,
        created_at: data.created_at,
      } : null,
      credits,
    });
  }

  if (req.method === 'PUT') {
    const { config } = req.body;

    const { data: existing } = await supabaseAdmin
      .from('platform_integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('platform', 'zerobounce')
      .single();

    if (!existing) {
      return res.status(404).json({ error: 'ZeroBounce integration not found' });
    }

    const mergedConfig = { ...((existing.config || {}) as Record<string, unknown>), ...config };

    const { data, error } = await supabaseAdmin
      .from('platform_integrations')
      .update({ config: mergedConfig, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('platform', 'zerobounce')
      .select('id, platform, is_connected, config, last_synced_at')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    await logEvent({
      type: 'api',
      event_name: 'zerobounce_config_update',
      status: 'success',
      message: 'ZeroBounce settings updated',
      user_id: user.id,
      request_data: config,
    });

    return res.status(200).json({ success: true, integration: data });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('platform_integrations')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', 'zerobounce');

    if (error) return res.status(500).json({ error: error.message });

    await logEvent({
      type: 'api',
      event_name: 'zerobounce_disconnect',
      status: 'info',
      message: 'ZeroBounce disconnected',
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
    });

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
