import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import crypto from 'crypto';
import type { Json } from '@/lib/supabase/types';

export const config = {
  maxDuration: 300,
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};

// Service role client to bypass RLS
const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Clean empty/null fields from a record
function cleanRecord(record: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined && value !== '') {
      if (typeof value === 'object' && !Array.isArray(value)) {
        const nested: Record<string, unknown> = {};
        let hasValues = false;
        for (const [nk, nv] of Object.entries(value as Record<string, unknown>)) {
          if (nv !== null && nv !== undefined && nv !== '') {
            nested[nk] = nv;
            hasValues = true;
          }
        }
        if (hasValues) cleaned[key] = nested;
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
}

// Normalize a contact to standard field names
function normalizeContact(contact: Record<string, unknown>): Record<string, unknown> {
  const resolution = (contact.resolution || contact.Resolution || {}) as Record<string, unknown>;
  const merged = { ...contact, ...resolution };

  const getField = (...keys: string[]): unknown => {
    for (const key of keys) {
      const val = merged[key];
      if (val !== undefined && val !== null && val !== '') return val;
    }
    return null;
  };

  const firstName = getField('FIRST_NAME', 'first_name', 'firstName', 'FirstName');
  const lastName = getField('LAST_NAME', 'last_name', 'lastName', 'LastName');

  const normalized: Record<string, unknown> = {
    email: getField('PERSONAL_VERIFIED_EMAILS', 'BUSINESS_VERIFIED_EMAILS', 'BUSINESS_EMAIL', 'email', 'EMAIL', 'Email', 'PERSONAL_EMAILS'),
    business_email: getField('BUSINESS_EMAIL', 'business_email'),
    verified_email: getField('PERSONAL_VERIFIED_EMAILS', 'BUSINESS_VERIFIED_EMAILS'),
    first_name: firstName,
    last_name: lastName,
    full_name: [firstName, lastName].filter(Boolean).join(' ') || null,
    company: getField('COMPANY_NAME', 'company', 'COMPANY', 'Company', 'company_name'),
    company_domain: getField('COMPANY_DOMAIN', 'company_domain', 'website'),
    company_description: getField('COMPANY_DESCRIPTION', 'company_description'),
    company_revenue: getField('COMPANY_REVENUE', 'company_revenue', 'revenue'),
    company_phone: getField('COMPANY_PHONE', 'company_phone'),
    job_title: getField('JOB_TITLE', 'title', 'job_title', 'jobTitle', 'JobTitle'),
    seniority: getField('SENIORITY_LEVEL', 'seniority', 'seniority_level'),
    department: getField('DEPARTMENT', 'department', 'Department'),
    phone: getField('MOBILE_PHONE', 'DIRECT_NUMBER', 'phone', 'PHONE', 'mobile_phone', 'PERSONAL_PHONE'),
    mobile_phone: getField('MOBILE_PHONE', 'mobile_phone'),
    direct_number: getField('DIRECT_NUMBER', 'direct_number'),
    linkedin_url: getField('LINKEDIN_URL', 'COMPANY_LINKEDIN_URL', 'linkedin_url', 'linkedinUrl'),
    city: getField('CITY', 'PERSONAL_CITY', 'city', 'City', 'personal_city'),
    state: getField('STATE', 'PERSONAL_STATE', 'state', 'State', 'personal_state'),
    country: getField('COUNTRY', 'country', 'Country'),
    gender: getField('GENDER', 'gender', 'Gender'),
    age_range: getField('AGE_RANGE', 'age_range', 'AgeRange'),
    income_range: getField('INCOME_RANGE', 'income_range', 'IncomeRange'),
    url: getField('URL', 'url', 'page_url'),
    ip_address: getField('IP_ADDRESS', 'ip_address'),
    event_type: getField('EVENT_TYPE', 'event_type'),
    referrer_url: getField('REFERRER_URL', 'referrer_url'),
  };

  // Strip null values from normalized fields
  for (const key of Object.keys(normalized)) {
    if (normalized[key] === null) delete normalized[key];
  }

  // Add remaining original fields not already normalized
  for (const [key, value] of Object.entries(merged)) {
    const lowerKey = key.toLowerCase();
    if (value !== '' && value !== null && value !== undefined && !normalized[lowerKey]) {
      normalized[lowerKey] = value;
    }
  }

  return normalized;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const supabase = createClient(req, res);
  const { url, name, request_id } = req.body;

  if (!url || !name) {
    return res.status(400).json({ error: 'URL and audience name are required' });
  }

  // Validate URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Get API key (same logic as proxy/fetch-url)
  const { data: anyApiKey } = await supabaseAdmin
    .from('user_api_keys')
    .select('api_key')
    .limit(1)
    .single();

  const apiKey = anyApiKey?.api_key;
  if (!apiKey) {
    return res.status(400).json({ error: 'No API key configured. Please add an API key in Settings first.' });
  }

  const fetchHeaders: Record<string, string> = { 'Accept': 'application/json' };
  if (parsedUrl.hostname.includes('audiencelab.io')) {
    fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
  }
  fetchHeaders['X-API-Key'] = apiKey;

  try {
    // Step 1: Fetch page 1 to get pagination info
    console.log(`[Import] Starting import from: ${url}`);
    const firstPageResponse = await fetch(url, { method: 'GET', headers: fetchHeaders });
    if (!firstPageResponse.ok) {
      return res.status(firstPageResponse.status).json({
        error: `Failed to fetch: ${firstPageResponse.status} ${firstPageResponse.statusText}`
      });
    }

    let firstPageData: Record<string, unknown>;
    const contentType = firstPageResponse.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      firstPageData = await firstPageResponse.json();
    } else {
      const text = await firstPageResponse.text();
      try {
        firstPageData = JSON.parse(text);
      } catch {
        return res.status(400).json({ error: 'Response is not valid JSON' });
      }
    }

    const totalPages = Number(firstPageData.total_pages || firstPageData.TotalPages || firstPageData.totalPages || 1);
    const firstPageRecords = (firstPageData.Data || firstPageData.data || firstPageData.records || firstPageData.contacts || []) as Record<string, unknown>[];

    console.log(`[Import] Page 1 fetched: ${firstPageRecords.length} records, ${totalPages} total pages`);

    // Step 2: Process page 1 records and accumulate in memory
    const allContacts: Record<string, unknown>[] = firstPageRecords.map(r => normalizeContact(cleanRecord(r)));

    // Step 3: Fetch remaining pages in parallel batches of 10
    if (totalPages > 1) {
      const PARALLEL_BATCH = 10;
      for (let batchStart = 2; batchStart <= totalPages; batchStart += PARALLEL_BATCH) {
        const batchEnd = Math.min(batchStart + PARALLEL_BATCH - 1, totalPages);
        const pagePromises = [];

        for (let page = batchStart; page <= batchEnd; page++) {
          const nextPageUrl = new URL(url);
          nextPageUrl.searchParams.set('page', String(page));

          pagePromises.push(
            fetch(nextPageUrl.toString(), { method: 'GET', headers: fetchHeaders })
              .then(async (pageResponse) => {
                if (pageResponse.ok) {
                  const pageData = await pageResponse.json();
                  return (pageData.Data || pageData.data || pageData.records || pageData.contacts || []) as Record<string, unknown>[];
                }
                console.error(`[Import] Page ${page} returned ${pageResponse.status}`);
                return [];
              })
              .catch((err) => {
                console.error(`[Import] Error fetching page ${page}:`, err);
                return [];
              })
          );
        }

        const batchResults = await Promise.all(pagePromises);
        for (const records of batchResults) {
          for (const record of records) {
            allContacts.push(normalizeContact(cleanRecord(record)));
          }
        }

        console.log(`[Import] Fetched pages ${batchStart}-${batchEnd}/${totalPages}, total contacts: ${allContacts.length}`);
      }
    }

    console.log(`[Import] All pages fetched. Total contacts: ${allContacts.length}. Saving to DB...`);

    // Step 4: Save everything in a single DB write
    const audienceId = `manual_${crypto.randomUUID()}`;

    // If linked to a request, update the existing request
    if (request_id) {
      const { data: existingRequest, error: fetchError } = await supabase
        .from('audience_requests')
        .select('form_data')
        .eq('id', request_id)
        .single();

      if (fetchError) {
        console.error('Error fetching request:', fetchError);
        return res.status(404).json({ error: 'Request not found' });
      }

      const { error: updateError } = await supabase
        .from('audience_requests')
        .update({
          status: 'approved',
          audience_id: audienceId,
          reviewed_by: authResult.user.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: `Manual audience imported from URL. ${allContacts.length} contacts.`,
          form_data: {
            ...(existingRequest.form_data as Record<string, unknown> || {}),
            manual_audience: {
              id: audienceId,
              name: name.trim(),
              total_records: allContacts.length,
              contacts: allContacts as Json[],
              uploaded_at: new Date().toISOString(),
              uploaded_by: authResult.user.id,
              source_url: url,
            },
          } as Json,
        })
        .eq('id', request_id);

      if (updateError) {
        console.error('Error updating request:', updateError);
        return res.status(500).json({ error: 'Failed to save audience data' });
      }
    } else {
      // Create a new audience request record
      const { error: createError } = await supabase
        .from('audience_requests')
        .insert({
          user_id: authResult.user.id,
          request_type: 'standard',
          name: name.trim(),
          status: 'approved',
          audience_id: audienceId,
          reviewed_by: authResult.user.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: `Manual audience imported from URL. ${allContacts.length} contacts.`,
          form_data: {
            manual_audience: {
              id: audienceId,
              name: name.trim(),
              total_records: allContacts.length,
              contacts: allContacts as Json[],
              uploaded_at: new Date().toISOString(),
              uploaded_by: authResult.user.id,
              source_url: url,
            },
          } as Json,
        });

      if (createError) {
        console.error('Error creating audience record:', createError);
        return res.status(500).json({ error: 'Failed to create audience record' });
      }
    }

    console.log(`[Import] Saved audience ${audienceId} with ${allContacts.length} contacts`);

    // Log audit
    await logAuditAction(
      authResult.user.id,
      'create_manual_audience',
      req,
      res,
      'audience',
      audienceId,
      { contacts_count: allContacts.length, source_url: url, total_pages: totalPages, request_id }
    );

    return res.status(200).json({
      success: true,
      audience: {
        id: audienceId,
        name: name.trim(),
        total_records: allContacts.length,
        total_pages: totalPages,
      },
    });
  } catch (error) {
    console.error('[Import] Error:', error);
    return res.status(500).json({ error: 'Failed to import audience data' });
  }
}
