import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getIntegrationByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('user_id, config, is_connected')
    .eq('platform', 'linkedin')
    .eq('is_connected', true);

  if (!data) return null;
  for (const row of data) {
    const config = (row.config || {}) as Record<string, unknown>;
    if (config.extension_token === token) return { user_id: row.user_id, config };
  }
  return null;
}

function isWithinOperatingHours(startTime: string, endTime: string, timezone: string): boolean {
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
    return currentMinutes >= startH * 60 + startM && currentMinutes < endH * 60 + endM;
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Extension token required' });

  const integration = await getIntegrationByToken(token);
  if (!integration) return res.status(401).json({ error: 'Invalid extension token' });

  try {
    const { data: campaigns } = await supabaseAdmin
      .from('linkedin_campaigns')
      .select('*')
      .eq('user_id', integration.user_id)
      .eq('status', 'active');

    if (!campaigns || campaigns.length === 0) {
      return res.status(200).json({ contacts: [], message: 'No active campaigns' });
    }

    for (const campaign of campaigns) {
      if (!isWithinOperatingHours(campaign.operating_hours_start, campaign.operating_hours_end, campaign.operating_timezone)) {
        continue;
      }

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: sentToday } = await supabaseAdmin
        .from('linkedin_campaign_contacts')
        .select('*', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .eq('status', 'sent')
        .gte('sent_at', todayStart.toISOString());

      const remaining = campaign.daily_limit - (sentToday || 0);
      if (remaining <= 0) continue;

      const toSend = Math.min(remaining, Math.floor(Math.random() * 3) + 1);

      const { data: contacts } = await supabaseAdmin
        .from('linkedin_campaign_contacts')
        .select('id, campaign_id, contact_email, linkedin_url, full_name, status')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(toSend);

      if (!contacts || contacts.length === 0) {
        await supabaseAdmin
          .from('linkedin_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        continue;
      }

      return res.status(200).json({
        contacts,
        campaign: {
          id: campaign.id,
          name: campaign.name,
          connection_message: campaign.connection_message || null,
          daily_limit: campaign.daily_limit,
          sent_today: sentToday || 0,
          remaining,
        },
      });
    }

    return res.status(200).json({ contacts: [], message: 'No campaigns ready (outside operating hours or daily limit reached)' });
  } catch (error) {
    console.error('Extension pending error:', error);
    return res.status(500).json({ error: 'Failed to fetch pending contacts' });
  }
}
