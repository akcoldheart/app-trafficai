import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { getIntegration, getVisitorsForSync, getAudienceContactsForSync } from '@/lib/integrations';
import { logEvent } from '@/lib/webhook-logger';
import crypto from 'crypto';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

function isTokenExpired(config: Record<string, unknown>): boolean {
  const expiresAt = config.token_expires_at as string | undefined;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

/** SHA256 hash a normalized string. Returns empty string if input is empty/null. */
function sha256(value: string | null | undefined): string {
  if (!value || !value.trim()) return '';
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * Normalize and hash contact data for Facebook Custom Audiences multi-key matching.
 * Facebook requires: lowercase, trimmed, no extra spaces, then SHA256 hashed.
 * See: https://developers.facebook.com/docs/marketing-api/audiences/guides/custom-audiences#hash
 */
function normalizeContact(contact: Record<string, any>): string[] {
  // EMAIL — lowercase, trim, validate
  const rawEmail = (contact.email || '').toLowerCase().trim();
  const email = EMAIL_REGEX.test(rawEmail) ? sha256(rawEmail) : '';

  // PHONE — digits only, must include country code, no symbols
  // Visitors store phone in metadata, audience_contacts have it directly
  let rawPhone = contact.phone || (contact.metadata as Record<string, any>)?.phone || '';
  if (typeof rawPhone === 'string') {
    rawPhone = rawPhone.replace(/[\s\-\(\)\.\+]/g, '');
    // Ensure it starts with country code (prepend 1 for US if 10 digits)
    if (rawPhone.length === 10 && /^\d+$/.test(rawPhone)) {
      rawPhone = '1' + rawPhone;
    }
    // Only keep if it looks like a valid phone number
    if (!/^\d{7,15}$/.test(rawPhone)) rawPhone = '';
  } else {
    rawPhone = '';
  }
  const phone = sha256(rawPhone);

  // FN — first name, lowercase, trim, remove non-alpha characters
  let fn = '';
  if (contact.first_name) {
    fn = contact.first_name.toLowerCase().trim();
  } else if (contact.full_name) {
    // Extract first name from full name
    fn = contact.full_name.split(/\s+/)[0]?.toLowerCase().trim() || '';
  }
  const fnHash = sha256(fn);

  // LN — last name, lowercase, trim
  let ln = '';
  if (contact.last_name) {
    ln = contact.last_name.toLowerCase().trim();
  } else if (contact.full_name) {
    const parts = contact.full_name.trim().split(/\s+/);
    if (parts.length > 1) {
      ln = parts.slice(1).join(' ').toLowerCase().trim();
    }
  }
  const lnHash = sha256(ln);

  // CT — city, lowercase, no punctuation, a-z only
  const rawCity = (contact.city || '').toLowerCase().trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, '');
  const ct = sha256(rawCity);

  // ST — state, lowercase 2-letter code
  const rawState = (contact.state || '').toLowerCase().trim();
  // Facebook expects 2-letter state code; if longer, try abbreviation
  const st = sha256(rawState.length <= 2 ? rawState : rawState.substring(0, 2));

  // COUNTRY — 2-letter ISO country code, lowercase
  let rawCountry = (contact.country || '').toLowerCase().trim();
  // Common full-name to ISO mapping
  const countryMap: Record<string, string> = {
    'united states': 'us', 'united states of america': 'us', 'usa': 'us',
    'canada': 'ca', 'united kingdom': 'uk', 'great britain': 'gb',
    'australia': 'au', 'germany': 'de', 'france': 'fr', 'india': 'in',
    'brazil': 'br', 'mexico': 'mx', 'spain': 'es', 'italy': 'it',
    'netherlands': 'nl', 'japan': 'jp', 'south korea': 'kr',
    'new zealand': 'nz', 'ireland': 'ie', 'sweden': 'se',
    'norway': 'no', 'denmark': 'dk', 'finland': 'fi',
    'switzerland': 'ch', 'austria': 'at', 'belgium': 'be',
    'portugal': 'pt', 'poland': 'pl', 'singapore': 'sg',
    'israel': 'il', 'south africa': 'za', 'argentina': 'ar',
    'chile': 'cl', 'colombia': 'co', 'philippines': 'ph',
    'indonesia': 'id', 'malaysia': 'my', 'thailand': 'th',
    'vietnam': 'vn', 'turkey': 'tr', 'egypt': 'eg',
    'nigeria': 'ng', 'kenya': 'ke', 'uae': 'ae',
    'united arab emirates': 'ae', 'saudi arabia': 'sa',
  };
  if (rawCountry.length > 2) {
    rawCountry = countryMap[rawCountry] || rawCountry.substring(0, 2);
  }
  const country = sha256(rawCountry);

  // ZIP — first 5 digits for US, keep as-is for others, lowercase
  let rawZip = '';
  const metaZip = (contact.metadata as Record<string, any>)?.zip ||
    (contact.metadata as Record<string, any>)?.postal_code ||
    (contact.metadata as Record<string, any>)?.zipcode ||
    (contact.data as Record<string, any>)?.zip ||
    (contact.data as Record<string, any>)?.postal_code ||
    contact.zip || contact.postal_code || '';
  if (typeof metaZip === 'string') {
    rawZip = metaZip.toLowerCase().trim();
    // US zip: first 5 chars
    if (rawCountry === 'us' && rawZip.length > 5) {
      rawZip = rawZip.substring(0, 5);
    }
  }
  const zip = sha256(rawZip);

  // Return array matching schema order:
  // [EMAIL, PHONE, FN, LN, CT, ST, COUNTRY, ZIP]
  return [email, phone, fnHash, lnHash, ct, st, country, zip];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { ad_account_id, audience_name, source_pixel_id, source_audience_id } = req.body;
  const ip = getClientIp(req);

  if (!ad_account_id || !audience_name) {
    return res.status(400).json({ error: 'ad_account_id and audience_name are required' });
  }

  if (!source_pixel_id && !source_audience_id) {
    return res.status(400).json({ error: 'Either source_pixel_id or source_audience_id is required' });
  }

  try {
    const integration = await getIntegration(user.id, 'facebook');

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
        user_id: user.id,
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
      contacts = await getVisitorsForSync(user.id, source_pixel_id);
    } else {
      contacts = await getAudienceContactsForSync(source_audience_id);
    }

    // Multi-key schema for Facebook Custom Audiences
    const schema = ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'ST', 'COUNTRY', 'ZIP'];

    // Normalize and hash all contacts — filter out those with no valid email
    const rows: string[][] = [];
    let skippedNoEmail = 0;
    let contactsWithPhone = 0;
    let contactsWithName = 0;

    for (const contact of contacts) {
      const row = normalizeContact(contact);
      // row[0] is hashed email — skip if empty (no valid email)
      if (!row[0]) {
        skippedNoEmail++;
        continue;
      }
      if (row[1]) contactsWithPhone++;
      if (row[2] || row[3]) contactsWithName++;
      rows.push(row);
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
          description: `Imported from Traffic AI - ${rows.length} contacts`,
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
      finalMessage = `Successfully imported ${rows.length} contacts to Facebook Custom Audience "${audience_name}" (multi-key: ${contactsWithName} with name, ${contactsWithPhone} with phone)`;
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
        total_contacts: rows.length,
        successful_uploads: successfulUploads,
        failed_batches: failedBatches,
        total_batches: totalBatches,
        skipped_no_email: skippedNoEmail,
        contacts_with_phone: contactsWithPhone,
        contacts_with_name: contactsWithName,
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
