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
      .from('platform_integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('platform', 'klaviyo')
      .eq('is_connected', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      return res.status(500).json({ error: 'Failed to fetch config' });
    }

    const config = (data?.config || {}) as Record<string, unknown>;
    return res.status(200).json({
      push_events_enabled: config.push_events_enabled || {},
      push_events_last_pushed: config.push_events_last_pushed || {},
      auto_push_events: config.auto_push_events || false,
    });
  }

  if (req.method === 'PUT') {
    const { push_events_enabled, auto_push_events } = req.body;

    const { data: existing } = await supabaseAdmin
      .from('platform_integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('platform', 'klaviyo')
      .eq('is_connected', true)
      .single();

    const existingConfig = (existing?.config || {}) as Record<string, unknown>;
    const updatedConfig = {
      ...existingConfig,
      push_events_enabled: push_events_enabled !== undefined ? push_events_enabled : existingConfig.push_events_enabled,
      auto_push_events: auto_push_events !== undefined ? auto_push_events : existingConfig.auto_push_events,
    };

    const { error } = await supabaseAdmin
      .from('platform_integrations')
      .update({ config: updatedConfig, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('platform', 'klaviyo');

    if (error) {
      return res.status(500).json({ error: 'Failed to update config' });
    }

    return res.status(200).json({
      push_events_enabled: updatedConfig.push_events_enabled || {},
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
