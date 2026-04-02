import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import type { ZapierConfig, ZapierTrigger } from '@/lib/zapier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('platform_integrations')
        .select('id, platform, is_connected, config, last_synced_at, created_at, updated_at')
        .eq('user_id', effectiveUserId)
        .eq('platform', 'zapier')
        .single();

      if (error && error.code !== 'PGRST116') {
        return res.status(500).json({ error: 'Failed to fetch status' });
      }

      return res.status(200).json({ integration: data || null });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { config } = req.body as { config: ZapierConfig };
      if (!config || !config.triggers) {
        return res.status(400).json({ error: 'config.triggers is required' });
      }

      // Determine if "connected" = any trigger has a non-empty webhook_url
      const hasAnyWebhook = Object.values(config.triggers).some(
        (t) => t?.webhook_url && t.webhook_url.trim()
      );

      const { data, error } = await supabaseAdmin
        .from('platform_integrations')
        .upsert(
          {
            user_id: effectiveUserId,
            platform: 'zapier',
            is_connected: hasAnyWebhook,
            config,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,platform' }
        )
        .select('id, platform, is_connected, config, last_synced_at, created_at, updated_at')
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to save config' });
      }

      return res.status(200).json({ integration: data });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update integration settings' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await supabaseAdmin
        .from('platform_integrations')
        .delete()
        .eq('user_id', effectiveUserId)
        .eq('platform', 'zapier');

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to disconnect Zapier' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
