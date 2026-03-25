import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { getIntegration, getVisitorsForSync, getAudienceContactsForSync } from '@/lib/integrations';
import { logEvent } from '@/lib/webhook-logger';
import { sha256 } from '@/lib/hashing';
import { refreshGoogleTokenIfNeeded, uploadOfflineConversions } from '@/lib/google-ads';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { conversion_action_id, conversion_action_name, source_pixel_id, source_audience_id } = req.body;
  const ip = getClientIp(req);

  if (!conversion_action_id || !conversion_action_name) {
    return res.status(400).json({ error: 'conversion_action_id and conversion_action_name are required' });
  }

  if (!source_pixel_id && !source_audience_id) {
    return res.status(400).json({ error: 'Either source_pixel_id or source_audience_id is required' });
  }

  try {
    const integration = await getIntegration(user.id, 'google_ads');
    if (!integration) {
      return res.status(401).json({ error: 'Google Ads not connected' });
    }

    const integrationConfig = (integration.config || {}) as Record<string, unknown>;
    const customerId = integrationConfig.customer_id as string;
    const developerToken = integrationConfig.developer_token as string;

    if (!customerId || !developerToken) {
      return res.status(400).json({ error: 'Please select a Google Ads account first' });
    }

    const accessToken = await refreshGoogleTokenIfNeeded(user.id, integrationConfig);

    // Create upload record
    const { data: uploadRecord, error: insertError } = await supabaseAdmin
      .from('google_ads_conversion_uploads')
      .insert({
        user_id: user.id,
        conversion_action_id,
        conversion_action_name,
        source_pixel_id: source_pixel_id || null,
        source_audience_id: source_audience_id || null,
        status: 'processing',
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    // Fetch contacts
    let contacts: Record<string, any>[];
    if (source_pixel_id) {
      contacts = await getVisitorsForSync(user.id, source_pixel_id);
    } else {
      contacts = await getAudienceContactsForSync(source_audience_id);
    }

    // Build conversion events from contacts
    const conversions: { hashedEmail: string; conversionDateTime: string }[] = [];

    for (const contact of contacts) {
      const email = (contact.email || '').toLowerCase().trim();
      if (!email) continue;

      const hashedEmail = sha256(email);
      if (!hashedEmail) continue;

      // Use last_seen_at or first_seen_at as conversion time, or now
      const conversionTime = contact.last_seen_at || contact.first_seen_at || new Date().toISOString();
      // Google Ads requires format: yyyy-mm-dd hh:mm:ss+|-hh:mm
      const dt = new Date(conversionTime);
      const formatted = dt.toISOString().replace('T', ' ').replace('Z', '+00:00').replace(/\.\d{3}/, '');

      conversions.push({
        hashedEmail,
        conversionDateTime: formatted,
      });
    }

    if (conversions.length === 0) {
      await supabaseAdmin
        .from('google_ads_conversion_uploads')
        .update({ status: 'failed', error_message: 'No valid contacts with email found' })
        .eq('id', uploadRecord.id);

      return res.status(400).json({ error: 'No valid contacts found' });
    }

    // Upload conversions
    const { successCount, failedCount } = await uploadOfflineConversions(
      accessToken,
      developerToken,
      customerId,
      conversion_action_id,
      conversions
    );

    const finalStatus = failedCount === conversions.length ? 'failed' : 'completed';

    await supabaseAdmin
      .from('google_ads_conversion_uploads')
      .update({
        conversion_count: successCount,
        status: finalStatus,
        error_message: failedCount > 0 ? `${failedCount} conversions failed` : null,
      })
      .eq('id', uploadRecord.id);

    await logEvent({
      type: 'api',
      event_name: 'google_ads_upload_conversions',
      status: finalStatus === 'completed' ? 'success' : 'error',
      message: `Uploaded ${successCount} conversions to Google Ads`,
      user_id: user.id,
      ip_address: ip,
      response_data: { success_count: successCount, failed_count: failedCount },
    });

    return res.status(200).json({
      success: true,
      conversion_count: successCount,
      message: `Uploaded ${successCount} conversions to Google Ads`,
    });
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'google_ads_upload_conversions',
      status: 'error',
      message: `Google Ads conversion upload failed: ${(error as Error).message}`,
      user_id: user.id,
      ip_address: ip,
      error_details: (error as Error).message,
    });

    console.error('Error uploading Google Ads conversions:', error);
    return res.status(500).json({ error: 'Failed to upload conversions' });
  }
}
