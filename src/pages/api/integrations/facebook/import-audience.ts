import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { getIntegration, getVisitorsForSync, getAudienceContactsForSync } from '@/lib/integrations';
import { logEvent } from '@/lib/webhook-logger';
import { normalizeContact } from '@/lib/hashing';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

function isTokenExpired(config: Record<string, unknown>): boolean {
  const expiresAt = config.token_expires_at as string | undefined;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { ad_account_id, audience_name, source_pixel_id, source_audience_id } = req.body;
  const ip = getClientIp(req);

  if (!ad_account_id || !audience_name) {
    return res.status(400).json({ error: 'ad_account_id and audience_name are required' });
  }

  if (!source_pixel_id && !source_audience_id) {
    return res.status(400).json({ error: 'Either source_pixel_id or source_audience_id is required' });
  }

  try {
    const integration = await getIntegration(effectiveUserId, 'facebook');

    if (!integration) {
      return res.status(401).json({ error: 'Facebook not connected' });
    }

    // Check token expiry
    const integrationConfig = (integration.config || {}) as Record<string, unknown>;
    if (isTokenExpired(integrationConfig)) {
      await logEvent({
        type: 'api',
        event_name: 'facebook_import_audience',
        status: 'error',
        message: 'Facebook import failed - access token has expired',
        user_id: user.id,
        ip_address: ip,
        request_data: { ad_account_id, audience_name, source_pixel_id, source_audience_id },
      });
      return res.status(401).json({
        error: 'Facebook access token has expired. Please reconnect your Facebook account.',
        token_expired: true,
      });
    }

    const accessToken = integration.api_key;

    // Create import record
    const { data: importRecord, error: insertError } = await supabaseAdmin
      .from('facebook_audience_imports')
      .insert({
        user_id: effectiveUserId,
        audience_name,
        source_pixel_id: source_pixel_id || null,
        source_audience_id: source_audience_id || null,
        status: 'processing',
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    // Fetch contacts with all available fields
    let contacts: Record<string, any>[];
    if (source_pixel_id) {
      contacts = await getVisitorsForSync(effectiveUserId, source_pixel_id);
    } else {
      contacts = await getAudienceContactsForSync(source_audience_id);
    }

    // Multi-key schema for Facebook Custom Audiences
    // See: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences#hash
    const schema = ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'ST', 'COUNTRY', 'ZIP', 'GEN'];

    // Normalize and hash all contacts — filter out those with no valid email
    const rows: string[][] = [];
    let skippedNoEmail = 0;
    let contactsWithPhone = 0;
    let contactsWithName = 0;
    let contactsWithLocation = 0;
    let contactsWithZip = 0;
    let precomputedHashCount = 0;
    let fallbackHashCount = 0;
    let uniqueContacts = 0;

    for (const contact of contacts) {
      const result = normalizeContact(contact);
      if (result.rows.length === 0) {
        skippedNoEmail++;
        continue;
      }

      uniqueContacts++;
      if (result.usedPrecomputed) {
        precomputedHashCount += result.rows.length;
      } else {
        fallbackHashCount += result.rows.length;
      }

      // Stats based on first row (same non-email fields for all rows of same contact)
      const firstRow = result.rows[0];
      if (firstRow[1]) contactsWithPhone++;     // PHONE
      if (firstRow[2] || firstRow[3]) contactsWithName++;  // FN or LN
      if (firstRow[4] || firstRow[5] || firstRow[6]) contactsWithLocation++; // CT, ST, or COUNTRY
      if (firstRow[7]) contactsWithZip++;       // ZIP

      rows.push(...result.rows);
    }

    if (rows.length === 0) {
      await supabaseAdmin
        .from('facebook_audience_imports')
        .update({ status: 'failed', error_message: 'No valid email addresses found' })
        .eq('id', importRecord.id);

      await logEvent({
        type: 'api',
        event_name: 'facebook_import_audience',
        status: 'error',
        message: `Facebook audience import failed - no valid emails found (${skippedNoEmail} contacts skipped)`,
        user_id: user.id,
        ip_address: ip,
        request_data: { ad_account_id, audience_name, source_pixel_id, source_audience_id },
      });

      return res.status(400).json({ error: 'No valid email addresses found' });
    }

    // Create Custom Audience
    const createResp = await fetch(
      `https://graph.facebook.com/v19.0/${ad_account_id}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: audience_name,
          subtype: 'CUSTOM',
          description: `Imported from Traffic AI - ${uniqueContacts} contacts`,
          customer_file_source: 'USER_PROVIDED_ONLY',
          access_token: accessToken,
        }),
      }
    );
    const createData = await createResp.json();

    if (!createResp.ok || !createData.id) {
      const errorMsg = createData.error?.message || 'Failed to create audience';
      await supabaseAdmin
        .from('facebook_audience_imports')
        .update({ status: 'failed', error_message: errorMsg })
        .eq('id', importRecord.id);

      await logEvent({
        type: 'api',
        event_name: 'facebook_import_audience',
        status: 'error',
        message: `Failed to create Facebook Custom Audience "${audience_name}"`,
        user_id: user.id,
        ip_address: ip,
        request_data: { ad_account_id, audience_name },
        error_details: errorMsg,
      });

      return res.status(400).json({ error: 'Failed to create Facebook audience', details: errorMsg });
    }

    const fbAudienceId = createData.id;

    // Upload hashed users in batches of 5000, track failures
    const batchSize = 5000;
    let successfulUploads = 0;
    let failedBatches = 0;
    const batchErrors: string[] = [];

    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;

      try {
        const uploadResp = await fetch(
          `https://graph.facebook.com/v19.0/${fbAudienceId}/users`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payload: {
                schema,
                data: batch,
              },
              access_token: accessToken,
            }),
          }
        );

        if (!uploadResp.ok) {
          const uploadData = await uploadResp.json();
          failedBatches++;
          batchErrors.push(`Batch ${batchNumber}: ${uploadData.error?.message || 'Upload failed'}`);
        } else {
          successfulUploads += batch.length;
        }
      } catch (batchErr) {
        failedBatches++;
        batchErrors.push(`Batch ${batchNumber}: ${(batchErr as Error).message}`);
      }
    }

    // Determine final status based on batch results
    const totalBatches = Math.ceil(rows.length / batchSize);
    let finalStatus: string;
    let finalMessage: string;
    let errorMessage: string | null = null;

    if (failedBatches === 0) {
      finalStatus = 'completed';
      finalMessage = `Imported ${uniqueContacts} contacts (${rows.length} rows) to Facebook audience "${audience_name}" — ${precomputedHashCount} pre-hashed, ${fallbackHashCount} fallback hashed`;
    } else if (failedBatches === totalBatches) {
      finalStatus = 'failed';
      errorMessage = `All ${totalBatches} upload batches failed: ${batchErrors.join('; ')}`;
      finalMessage = `Facebook audience "${audience_name}" was created but all contact uploads failed`;
    } else {
      finalStatus = 'completed';
      errorMessage = `${failedBatches}/${totalBatches} batches failed: ${batchErrors.join('; ')}`;
      finalMessage = `Imported ${successfulUploads}/${rows.length} contacts to Facebook Custom Audience "${audience_name}" (${failedBatches} batches failed)`;
    }

    // Update import record
    await supabaseAdmin
      .from('facebook_audience_imports')
      .update({
        audience_id: fbAudienceId,
        contact_count: successfulUploads || rows.length,
        status: finalStatus,
        error_message: errorMessage,
      })
      .eq('id', importRecord.id);

    await logEvent({
      type: 'api',
      event_name: 'facebook_import_audience',
      status: failedBatches === totalBatches ? 'error' : failedBatches > 0 ? 'warning' : 'success',
      message: finalMessage,
      user_id: user.id,
      ip_address: ip,
      request_data: { ad_account_id, audience_name, source_pixel_id, source_audience_id },
      response_data: {
        audience_id: fbAudienceId,
        unique_contacts: uniqueContacts,
        total_rows: rows.length,
        precomputed_hashes: precomputedHashCount,
        fallback_hashes: fallbackHashCount,
        successful_uploads: successfulUploads,
        failed_batches: failedBatches,
        total_batches: totalBatches,
        skipped_no_email: skippedNoEmail,
        contacts_with_phone: contactsWithPhone,
        contacts_with_name: contactsWithName,
        contacts_with_location: contactsWithLocation,
        contacts_with_zip: contactsWithZip,
        schema_keys: schema,
      },
      error_details: batchErrors.length > 0 ? batchErrors.join('; ') : undefined,
    });

    if (failedBatches === totalBatches) {
      return res.status(500).json({
        error: finalMessage,
        audience_id: fbAudienceId,
      });
    }

    return res.status(200).json({
      success: true,
      audience_id: fbAudienceId,
      contact_count: successfulUploads || rows.length,
      message: finalMessage,
      warnings: failedBatches > 0 ? batchErrors : undefined,
    });
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'facebook_import_audience',
      status: 'error',
      message: `Facebook audience import failed: ${(error as Error).message}`,
      user_id: user.id,
      ip_address: ip,
      request_data: { ad_account_id, audience_name, source_pixel_id, source_audience_id },
      error_details: (error as Error).message,
    });

    console.error('Error importing Facebook audience:', error);
    return res.status(500).json({ error: 'Failed to import audience' });
  }
}
