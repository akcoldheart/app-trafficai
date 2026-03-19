import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function decrypt(encryptedText: string): string {
  const key = process.env.ENCRYPTION_KEY!;
  const [ivHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'hex'), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

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

      // Skip if integration is not connected
      if (!integration?.is_connected) {
        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: 'skipped_inactive_account' });
        continue;
      }

      // Check operating hours
      if (!isWithinOperatingHours(campaign.operating_hours_start, campaign.operating_hours_end, campaign.operating_timezone)) {
        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: 'outside_operating_hours' });
        continue;
      }

      // Count requests sent today in campaign timezone
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

      const remaining = campaign.daily_limit - (sentToday || 0);
      // Send 1-3 requests per cron run for organic pacing
      const toSend = Math.min(remaining, Math.floor(Math.random() * 3) + 1);

      // Get next pending contacts
      const { data: pendingContacts } = await supabaseAdmin
        .from('linkedin_campaign_contacts')
        .select('*')
        .eq('campaign_id', campaign.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(toSend);

      if (!pendingContacts || pendingContacts.length === 0) {
        // No more pending contacts — mark campaign as completed
        await supabaseAdmin
          .from('linkedin_campaigns')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', campaign.id);
        results.push({ campaign_id: campaign.id, campaign_name: campaign.name, action: 'completed_no_pending' });
        continue;
      }

      for (const contact of pendingContacts) {
        // Add random jitter (0-60 seconds) between requests
        if (pendingContacts.indexOf(contact) > 0) {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 60000));
        }

        try {
          // TODO: Implement actual LinkedIn connection request via their internal API
          // For now, mark as sent (actual LinkedIn API integration requires reverse-engineered endpoints or a service like Dripify)
          // The actual implementation would:
          // 1. Decrypt credentials: decrypt(integration.config.credentials.email), decrypt(integration.config.credentials.password)
          // 2. Use a LinkedIn automation library/service to send the connection request
          // 3. Handle rate limiting and session management

          await supabaseAdmin
            .from('linkedin_campaign_contacts')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
            .eq('id', contact.id);

          // Update campaign total_sent
          await supabaseAdmin
            .from('linkedin_campaigns')
            .update({
              total_sent: (campaign.total_sent || 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', campaign.id);

          results.push({
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            action: `sent_to_${contact.linkedin_url}`,
          });
        } catch (sendError) {
          console.error(`Error sending LinkedIn request for contact ${contact.id}:`, sendError);
          await supabaseAdmin
            .from('linkedin_campaign_contacts')
            .update({
              status: 'error',
              error_message: (sendError as Error).message,
            })
            .eq('id', contact.id);
        }
      }
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
