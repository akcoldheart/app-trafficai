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
// US state name → 2-letter code mapping
const US_STATE_MAP: Record<string, string> = {
  'alabama': 'al', 'alaska': 'ak', 'arizona': 'az', 'arkansas': 'ar',
  'california': 'ca', 'colorado': 'co', 'connecticut': 'ct', 'delaware': 'de',
  'florida': 'fl', 'georgia': 'ga', 'hawaii': 'hi', 'idaho': 'id',
  'illinois': 'il', 'indiana': 'in', 'iowa': 'ia', 'kansas': 'ks',
  'kentucky': 'ky', 'louisiana': 'la', 'maine': 'me', 'maryland': 'md',
  'massachusetts': 'ma', 'michigan': 'mi', 'minnesota': 'mn', 'mississippi': 'ms',
  'missouri': 'mo', 'montana': 'mt', 'nebraska': 'ne', 'nevada': 'nv',
  'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny',
  'north carolina': 'nc', 'north dakota': 'nd', 'ohio': 'oh', 'oklahoma': 'ok',
  'oregon': 'or', 'pennsylvania': 'pa', 'rhode island': 'ri', 'south carolina': 'sc',
  'south dakota': 'sd', 'tennessee': 'tn', 'texas': 'tx', 'utah': 'ut',
  'vermont': 'vt', 'virginia': 'va', 'washington': 'wa', 'west virginia': 'wv',
  'wisconsin': 'wi', 'wyoming': 'wy', 'district of columbia': 'dc',
};

// Country name → 2-letter ISO code mapping
const COUNTRY_MAP: Record<string, string> = {
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

/**
 * Extract pre-computed SHA256 email hashes from enrichment_data.
 * The API provides SHA256_PERSONAL_EMAIL and SHA256_BUSINESS_EMAIL as
 * comma-separated lists of hashes that directly match Meta social profiles.
 */
function getPreComputedEmailHashes(contact: Record<string, any>): string[] {
  const enrichment = contact.enrichment_data as Record<string, any> | null;
  const extraData = contact.data as Record<string, any> | null;

  const hashes = new Set<string>();

  // Check enrichment_data (visitors — UPPERCASE keys) and data JSONB (audience_contacts — lowercase keys)
  for (const source of [enrichment, extraData]) {
    if (!source) continue;
    // Check both UPPERCASE (raw API / enrichment_data) and lowercase (normalized audience_contacts data)
    for (const key of [
      'SHA256_PERSONAL_EMAIL', 'sha256_personal_email',
      'SHA256_BUSINESS_EMAIL', 'sha256_business_email',
      'HEM_SHA256', 'hem_sha256',
    ]) {
      const val = source[key];
      if (typeof val === 'string' && val.trim()) {
        // Can be comma-separated: "hash1, hash2"
        for (const h of val.split(',')) {
          const trimmed = h.trim().toLowerCase();
          // Validate it looks like a SHA256 hex string (64 chars)
          if (trimmed.length === 64 && /^[0-9a-f]+$/.test(trimmed)) {
            hashes.add(trimmed);
          }
        }
      }
    }
  }

  return Array.from(hashes);
}

/**
 * Build the non-email portion of a Facebook row (PHONE, FN, LN, CT, ST, COUNTRY, ZIP, GEN).
 * These are hashed by us since there are no pre-computed hashes for these fields.
 */
function buildNonEmailFields(contact: Record<string, any>): string[] {
  const enrichment = contact.enrichment_data as Record<string, any> | null;
  const meta = contact.metadata as Record<string, any> | null;
  const extraData = contact.data as Record<string, any> | null;

  // PHONE — digits only, must include country code
  let rawPhone = contact.phone
    || meta?.phone
    || enrichment?.MOBILE_PHONE
    || enrichment?.DIRECT_NUMBER
    || enrichment?.PERSONAL_PHONE
    || enrichment?.ALL_MOBILES?.split(',')[0]
    || '';
  if (typeof rawPhone === 'string') {
    rawPhone = rawPhone.replace(/[\s\-\(\)\.\+]/g, '');
    if (rawPhone.length === 10 && /^\d+$/.test(rawPhone)) {
      rawPhone = '1' + rawPhone;
    }
    if (!/^\d{7,15}$/.test(rawPhone)) rawPhone = '';
  } else {
    rawPhone = '';
  }
  const phone = sha256(rawPhone);

  // FN — first name
  let fn = '';
  if (contact.first_name) {
    fn = contact.first_name.toLowerCase().trim();
  } else if (enrichment?.FIRST_NAME) {
    fn = enrichment.FIRST_NAME.toLowerCase().trim();
  } else if (contact.full_name) {
    fn = contact.full_name.split(/\s+/)[0]?.toLowerCase().trim() || '';
  }
  const fnHash = sha256(fn);

  // LN — last name
  let ln = '';
  if (contact.last_name) {
    ln = contact.last_name.toLowerCase().trim();
  } else if (enrichment?.LAST_NAME) {
    ln = enrichment.LAST_NAME.toLowerCase().trim();
  } else if (contact.full_name) {
    const parts = contact.full_name.trim().split(/\s+/);
    if (parts.length > 1) {
      ln = parts.slice(1).join(' ').toLowerCase().trim();
    }
  }
  const lnHash = sha256(ln);

  // CT — city
  const rawCity = (contact.city || enrichment?.PERSONAL_CITY || enrichment?.CITY || '')
    .toLowerCase().trim().replace(/[^a-z\s]/g, '').replace(/\s+/g, '');
  const ct = sha256(rawCity);

  // ST — state as 2-letter code
  const rawStateInput = (contact.state || enrichment?.PERSONAL_STATE || enrichment?.STATE || '').toLowerCase().trim();
  const rawState = rawStateInput.length > 2
    ? (US_STATE_MAP[rawStateInput] || rawStateInput.substring(0, 2))
    : rawStateInput;
  const st = sha256(rawState);

  // COUNTRY — 2-letter ISO code
  let rawCountry = (contact.country || enrichment?.COUNTRY || '').toLowerCase().trim();
  if (rawCountry.length > 2) {
    rawCountry = COUNTRY_MAP[rawCountry] || rawCountry.substring(0, 2);
  }
  const country = sha256(rawCountry);

  // ZIP
  let rawZip = '';
  const metaZip = enrichment?.PERSONAL_ZIP
    || enrichment?.COMPANY_ZIP
    || meta?.zip || meta?.postal_code
    || extraData?.zip || extraData?.postal_code
    || contact.zip || contact.postal_code || '';
  if (typeof metaZip === 'string' && metaZip.trim()) {
    rawZip = metaZip.toLowerCase().trim();
    if (rawCountry === 'us' && rawZip.length > 5) {
      rawZip = rawZip.substring(0, 5);
    }
  }
  const zip = sha256(rawZip);

  // GEN — gender: m or f
  let rawGender = (meta?.gender || enrichment?.GENDER || extraData?.gender || '').toLowerCase().trim();
  if (rawGender === 'male') rawGender = 'm';
  else if (rawGender === 'female') rawGender = 'f';
  else if (rawGender !== 'm' && rawGender !== 'f') rawGender = '';
  const gen = sha256(rawGender);

  return [phone, fnHash, lnHash, ct, st, country, zip, gen];
}

/**
 * Convert a contact into one or more Facebook upload rows.
 * Uses pre-computed SHA256_PERSONAL_EMAIL / SHA256_BUSINESS_EMAIL hashes from the
 * enrichment API when available — these match Meta profiles directly.
 * Falls back to hashing the stored email if no pre-computed hashes exist.
 * Returns multiple rows when a contact has multiple email hashes.
 */
function normalizeContact(contact: Record<string, any>): { rows: string[][]; usedPrecomputed: boolean } {
  const nonEmailFields = buildNonEmailFields(contact);

  // Prefer pre-computed SHA256 hashes from the API — these match Meta profiles
  const precomputed = getPreComputedEmailHashes(contact);
  if (precomputed.length > 0) {
    // Create one row per pre-computed email hash for maximum matching
    const rows = precomputed.map(hash => [hash, ...nonEmailFields]);
    return { rows, usedPrecomputed: true };
  }

  // Fallback: hash the stored email ourselves
  const rawEmail = (contact.email || '').toLowerCase().trim();
  const emailHash = EMAIL_REGEX.test(rawEmail) ? sha256(rawEmail) : '';
  if (!emailHash) {
    return { rows: [], usedPrecomputed: false };
  }

  return { rows: [[emailHash, ...nonEmailFields]], usedPrecomputed: false };
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
