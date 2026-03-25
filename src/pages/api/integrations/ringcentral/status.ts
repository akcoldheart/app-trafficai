import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegrationStatus, disconnectIntegration } from '@/lib/integrations';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'ringcentral';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const [integration, templatesResult, smsLogResult] = await Promise.all([
        getIntegrationStatus(user.id, PLATFORM),
        supabaseAdmin
          .from('ringcentral_sms_templates')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
        supabaseAdmin
          .from('ringcentral_sms_log')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      const config = (integration?.config || {}) as Record<string, unknown>;

      // Stats: count sent today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabaseAdmin
        .from('ringcentral_sms_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString());

      const { count: deliveredToday } = await supabaseAdmin
        .from('ringcentral_sms_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'sent')
        .gte('created_at', today.toISOString());

      const { count: failedToday } = await supabaseAdmin
        .from('ringcentral_sms_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'failed')
        .gte('created_at', today.toISOString());

      return res.status(200).json({
        integration: integration || null,
        phone_numbers: config.rc_phone_numbers || [],
        from_number: config.rc_from_number || null,
        templates: templatesResult.data || [],
        sms_log: smsLogResult.data || [],
        stats: {
          sent_today: sentToday || 0,
          delivered_today: deliveredToday || 0,
          failed_today: failedToday || 0,
        },
      });
    } catch (error) {
      console.error('Error fetching RingCentral status:', error);
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      // Also delete templates
      await supabaseAdmin
        .from('ringcentral_sms_templates')
        .delete()
        .eq('user_id', user.id);

      await disconnectIntegration(user.id, PLATFORM);

      await logEvent({
        type: 'api',
        event_name: 'ringcentral_disconnect',
        status: 'success',
        message: 'RingCentral integration disconnected',
        user_id: user.id,
        ip_address: getClientIp(req),
      });

      return res.status(200).json({ success: true, message: 'RingCentral disconnected' });
    } catch (error) {
      console.error('Error disconnecting RingCentral:', error);
      return res.status(500).json({ error: 'Failed to disconnect RingCentral' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
