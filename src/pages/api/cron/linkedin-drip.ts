import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function isWithinOperatingHours(
  startTime: string,
  endTime: string,
  timezone: string
): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
    const currentMinutes = hour * 60 + minute;

    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } catch {
    return false;
  }
}

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
    // Fetch all active campaigns
    const { data: campaigns, error } = await supabaseAdmin
      .from('linkedin_campaigns')
      .select('*')
      .eq('status', 'active');

    if (error) throw error;
    if (!campaigns || campaigns.length === 0) {
      return res.status(200).json({ success: true, message: 'No active campaigns', processed: 0 });
    }

    const results: Array<{ campaign_id: string; campaign_name: string; action: string }> = [];

    for (const campaign of campaigns) {
      // Look up the user's LinkedIn integration
      const { data: integration } = await supabaseAdmin
        .from('platform_integrations')
        .select('config, is_connected')
        .eq('user_id', campaign.user_id)
        .eq('platform', 'linkedin')
        .eq('is_connected', true)
        .single();

      if (!integration?.is_connected) {
        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: 'skipped_inactive_account' });
        continue;
      }

      // Check operating hours
      if (!isWithinOperatingHours(campaign.operating_hours_start, campaign.operating_hours_end, campaign.operating_timezone)) {
        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: 'outside_operating_hours' });
        continue;
      }

      // Count requests sent today
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabaseAdmin
        .from('linkedin_campaign_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'sent')
        .gte('sent_at', todayStart.toISOString());

      if ((sentToday || 0) >= campaign.daily_limit) {
        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: 'daily_limit_reached' });
        continue;
      }

      // LinkedIn connection request sending is not yet implemented.
      // The cron monitors campaigns and enforces operating hours / daily limits,
      // but actual sending requires a browser extension or LinkedIn automation service.
      results.push({
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        action: 'ready_to_send_awaiting_integration',
      });
    }

    return res.status(200).json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('LinkedIn drip cron error:', error);
    return res.status(500).json({ error: 'Cron job failed' });
  }
}
