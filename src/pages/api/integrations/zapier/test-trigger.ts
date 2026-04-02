import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { fireTestTrigger, TRIGGER_ORDER } from '@/lib/zapier';
import type { ZapierTrigger, ZapierConfig } from '@/lib/zapier';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { trigger } = req.body as { trigger: ZapierTrigger };

  if (!trigger || !TRIGGER_ORDER.includes(trigger)) {
    return res.status(400).json({ error: 'Invalid trigger. Must be one of: ' + TRIGGER_ORDER.join(', ') });
  }

  try {
    const { data } = await supabaseAdmin
      .from('platform_integrations')
      .select('config')
      .eq('user_id', effectiveUserId)
      .eq('platform', 'zapier')
      .single();

    if (!data?.config) {
      return res.status(400).json({ error: 'No Zapier triggers configured' });
    }

    const config = data.config as ZapierConfig;
    const triggerConfig = config.triggers?.[trigger];

    if (!triggerConfig?.webhook_url) {
      return res.status(400).json({ error: `No webhook URL configured for trigger: ${trigger}` });
    }

    const result = await fireTestTrigger(triggerConfig.webhook_url, trigger);

    if (!result.ok) {
      return res.status(400).json({
        error: 'Webhook returned an error. Check the URL and try again.',
        status: result.status,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Test event sent successfully. Check your Zapier zap history.',
      trigger,
    });
  } catch (error) {
    console.error('Error sending Zapier test trigger:', error);
    return res.status(500).json({ error: 'Failed to send test event' });
  }
}
