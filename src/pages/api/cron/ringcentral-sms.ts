import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import {
  refreshRCTokenIfNeeded,
  sendSms,
  substituteTemplateVars,
  extractVisitorPhone,
  isWithinTimeWindow,
} from '@/lib/ringcentral';

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

  const results: { userId: string; sent: number; skipped: number; errors: number }[] = [];

  try {
    // 1. Get all users with active RingCentral integration
    const { data: integrations } = await supabaseAdmin
      .from('platform_integrations')
      .select('user_id, config')
      .eq('platform', 'ringcentral')
      .eq('is_connected', true);

    if (!integrations || integrations.length === 0) {
      return res.status(200).json({ message: 'No active RingCentral integrations', results: [] });
    }

    for (const integration of integrations) {
      const userId = integration.user_id;
      const integConfig = (integration.config || {}) as Record<string, unknown>;
      const fromNumber = integConfig.rc_from_number as string | undefined;

      if (!fromNumber) {
        results.push({ userId, sent: 0, skipped: 0, errors: 0 });
        continue;
      }

      let sent = 0;
      let skipped = 0;
      let errors = 0;

      try {
        // Refresh token if needed
        const accessToken = await refreshRCTokenIfNeeded(userId, integConfig);

        // 2. Get active templates for this user
        const { data: templates } = await supabaseAdmin
          .from('ringcentral_sms_templates')
          .select('*')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (!templates || templates.length === 0) {
          results.push({ userId, sent: 0, skipped: 0, errors: 0 });
          continue;
        }

        for (const template of templates) {
          const filters = (template.filters || {}) as Record<string, any>;

          // Check time window
          if (!isWithinTimeWindow(filters)) {
            continue;
          }

          const pixelId = template.pixel_id;

          // 3. Find qualifying visitors
          // Look back 30 minutes for new visitors with phone numbers
          const lookbackMinutes = 30;
          const cutoff = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString();

          let query = supabaseAdmin
            .from('visitors')
            .select('id, visitor_id, email, first_name, last_name, full_name, company, job_title, city, state, country, lead_score, metadata, enrichment_data, first_seen_at, phone')
            .eq('pixel_id', pixelId)
            .gte('first_seen_at', cutoff);

          // Apply new_visitors_only filter (default true)
          // New visitors = first_seen_at within lookback window (already filtered above)
          if (filters.new_visitors_only !== false) {
            // Already filtered by first_seen_at >= cutoff
          }

          // Apply min_lead_score filter
          const minScore = filters.min_lead_score || 0;
          if (minScore > 0) {
            query = query.gte('lead_score', minScore);
          }

          const { data: visitors } = await query.limit(100); // Process max 100 per template per run

          if (!visitors || visitors.length === 0) continue;

          for (const visitor of visitors) {
            // Extract phone number
            const phone = extractVisitorPhone(visitor);
            if (!phone) {
              skipped++;
              continue;
            }

            // Check dedup: has this visitor already been texted for this pixel today?
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const { data: existingLog } = await supabaseAdmin
              .from('ringcentral_sms_log')
              .select('id')
              .eq('pixel_id', pixelId)
              .eq('visitor_id', visitor.visitor_id || visitor.id)
              .eq('sent_date', today)
              .limit(1);

            if (existingLog && existingLog.length > 0) {
              skipped++;
              continue;
            }

            // Check frequency cap
            if (filters.frequency_cap_hours && filters.frequency_cap_hours > 0) {
              const capCutoff = new Date(Date.now() - filters.frequency_cap_hours * 60 * 60 * 1000).toISOString();
              const { data: recentLog } = await supabaseAdmin
                .from('ringcentral_sms_log')
                .select('id')
                .eq('pixel_id', pixelId)
                .eq('visitor_id', visitor.visitor_id || visitor.id)
                .gte('created_at', capCutoff)
                .limit(1);

              if (recentLog && recentLog.length > 0) {
                skipped++;
                continue;
              }
            }

            // Substitute template variables
            const messageText = substituteTemplateVars(template.message_template, visitor);

            // Send SMS
            try {
              const { messageId } = await sendSms(accessToken, fromNumber, phone, messageText);

              // Log success
              await supabaseAdmin
                .from('ringcentral_sms_log')
                .insert({
                  user_id: userId,
                  pixel_id: pixelId,
                  visitor_id: visitor.visitor_id || visitor.id,
                  phone_number: phone,
                  from_number: fromNumber,
                  message_text: messageText,
                  status: 'sent',
                  ringcentral_message_id: messageId,
                  sent_at: new Date().toISOString(),
                });

              sent++;
            } catch (smsError) {
              // Log failure
              await supabaseAdmin
                .from('ringcentral_sms_log')
                .insert({
                  user_id: userId,
                  pixel_id: pixelId,
                  visitor_id: visitor.visitor_id || visitor.id,
                  phone_number: phone,
                  from_number: fromNumber,
                  message_text: messageText,
                  status: 'failed',
                  error_message: (smsError as Error).message,
                });

              errors++;
            }

            // Rate limiting: small delay between sends (RingCentral ~50 SMS/min)
            await new Promise(resolve => setTimeout(resolve, 1200));
          }
        }
      } catch (userError) {
        console.error(`RingCentral cron error for user ${userId}:`, userError);
        errors++;
      }

      // Update last_synced_at
      await supabaseAdmin
        .from('platform_integrations')
        .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('platform', 'ringcentral');

      results.push({ userId, sent, skipped, errors });
    }

    const totalSent = results.reduce((sum, r) => sum + r.sent, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors, 0);

    return res.status(200).json({
      message: `Processed ${integrations.length} user(s): ${totalSent} SMS sent, ${totalErrors} errors`,
      results,
    });
  } catch (error) {
    console.error('RingCentral cron error:', error);
    return res.status(500).json({ error: 'Cron job failed', details: (error as Error).message });
  }
}
