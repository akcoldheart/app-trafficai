import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { getIntegration, getVisitorsForSync, getAudienceContactsForSync } from '@/lib/integrations';
import { logEvent } from '@/lib/webhook-logger';
import { normalizeContact } from '@/lib/hashing';
import { refreshGoogleTokenIfNeeded, createUserList, uploadUserData } from '@/lib/google-ads';

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

  const { list_name, source_pixel_id, source_audience_id } = req.body;
  const ip = getClientIp(req);

  if (!list_name) {
    return res.status(400).json({ error: 'list_name is required' });
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

    // Create import record
    const { data: importRecord, error: insertError } = await supabaseAdmin
      .from('google_ads_audience_imports')
      .insert({
        user_id: user.id,
        user_list_name: list_name,
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

    // Normalize and hash contacts using shared hashing module
    const hashedContacts: { hashedEmail?: string; hashedPhone?: string; hashedFirstName?: string; hashedLastName?: string; zipCode?: string; countryCode?: string }[] = [];
    let skippedNoEmail = 0;

    for (const contact of contacts) {
      const result = normalizeContact(contact);
      if (result.rows.length === 0) {
        skippedNoEmail++;
        continue;
      }

      // First row: [emailHash, phoneHash, fnHash, lnHash, ctHash, stHash, countryHash, zipHash, genHash]
      const row = result.rows[0];
      hashedContacts.push({
        hashedEmail: row[0] || undefined,
        hashedPhone: row[1] || undefined,
        hashedFirstName: row[2] || undefined,
        hashedLastName: row[3] || undefined,
      });
    }

    if (hashedContacts.length === 0) {
      await supabaseAdmin
        .from('google_ads_audience_imports')
        .update({ status: 'failed', error_message: 'No valid contacts found' })
        .eq('id', importRecord.id);

      return res.status(400).json({ error: 'No valid contacts found' });
    }

    // Create user list
    const userListResourceName = await createUserList(
      accessToken,
      developerToken,
      customerId,
      list_name,
      `Imported from Traffic AI - ${hashedContacts.length} contacts`
    );

    // Upload hashed data
    const { successCount, failedCount } = await uploadUserData(
      accessToken,
      developerToken,
      customerId,
      userListResourceName,
      hashedContacts
    );

    const finalStatus = failedCount === hashedContacts.length ? 'failed' : 'completed';
    const errorMessage = failedCount > 0 ? `${failedCount} contacts failed to upload` : null;

    await supabaseAdmin
      .from('google_ads_audience_imports')
      .update({
        user_list_id: userListResourceName,
        contact_count: successCount,
        status: finalStatus,
        error_message: errorMessage,
      })
      .eq('id', importRecord.id);

    await logEvent({
      type: 'api',
      event_name: 'google_ads_import_audience',
      status: finalStatus === 'completed' ? 'success' : 'error',
      message: `Imported ${successCount} contacts to Google Ads user list "${list_name}"`,
      user_id: user.id,
      ip_address: ip,
      response_data: {
        user_list: userListResourceName,
        success_count: successCount,
        failed_count: failedCount,
        skipped_no_email: skippedNoEmail,
      },
    });

    return res.status(200).json({
      success: true,
      user_list_id: userListResourceName,
      contact_count: successCount,
      message: `Imported ${successCount} contacts to Google Ads`,
    });
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'google_ads_import_audience',
      status: 'error',
      message: `Google Ads audience import failed: ${(error as Error).message}`,
      user_id: user.id,
      ip_address: ip,
      error_details: (error as Error).message,
    });

    console.error('Error importing Google Ads audience:', error);
    return res.status(500).json({ error: 'Failed to import audience' });
  }
}
