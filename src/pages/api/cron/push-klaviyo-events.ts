import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { pushEventsForUser } from '@/pages/api/integrations/klaviyo/push-events';
import { logEvent } from '@/lib/webhook-logger';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Find all connected Klaviyo integrations that have push events enabled
    const { data: integrations, error } = await supabaseAdmin
      .from('platform_integrations')
      .select('user_id, api_key, config')
      .eq('platform', 'klaviyo')
      .eq('is_connected', true);

    if (error) throw error;
    if (!integrations || integrations.length === 0) {
      return res.status(200).json({ message: 'No connected Klaviyo integrations', processed: 0 });
    }

    const results: Array<{ user_id: string; total_pushed: number; error?: string }> = [];

    for (const integration of integrations) {
      const config = (integration.config || {}) as Record<string, unknown>;
      const pushEventsEnabled = (config.push_events_enabled || {}) as Record<string, boolean>;
      const autoPushEnabled = config.auto_push_events === true;

      // Only process users who have auto-push enabled AND have at least one event type enabled
      if (!autoPushEnabled) continue;

      const enabledTypes = Object.entries(pushEventsEnabled)
        .filter(([, enabled]) => enabled)
        .map(([type]) => type);

      if (enabledTypes.length === 0) continue;

      try {
        const result = await pushEventsForUser(
          integration.user_id,
          enabledTypes,
          { api_key: integration.api_key, config }
        );
        results.push({ user_id: integration.user_id, total_pushed: result.total_pushed });

        if (result.total_pushed > 0) {
          await logEvent({
            type: 'api',
            event_name: 'klaviyo_auto_push_events',
            status: 'success',
            message: `Auto-pushed ${result.total_pushed} events to Klaviyo (${enabledTypes.join(', ')})`,
            user_id: integration.user_id,
            response_data: result.results as Record<string, unknown>,
          });
        }
      } catch (err) {
        console.error(`Cron push events error for user ${integration.user_id}:`, err);
        results.push({ user_id: integration.user_id, total_pushed: 0, error: (err as Error).message });

        await logEvent({
          type: 'api',
          event_name: 'klaviyo_auto_push_events',
          status: 'error',
          message: 'Auto-push events to Klaviyo failed',
          user_id: integration.user_id,
          error_details: (err as Error).message,
        });
      }
    }

    return res.status(200).json({
      message: `Processed ${results.length} integrations`,
      results,
    });
  } catch (error) {
    console.error('Cron push-klaviyo-events error:', error);
    return res.status(500).json({ error: 'Cron job failed' });
  }
}
