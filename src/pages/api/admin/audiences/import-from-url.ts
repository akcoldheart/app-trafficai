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
      sizeLimit: '50mb',
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

  // Strip null values
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

// Known columns in the audience_contacts table
const KNOWN_COLUMNS = [
  'email', 'full_name', 'first_name', 'last_name', 'company',
  'job_title', 'phone', 'city', 'state', 'country',
  'linkedin_url', 'seniority', 'department',
];

// Convert a normalized contact into a row for the audience_contacts table
function contactToRow(audienceId: string, contact: Record<string, unknown>) {
  const row: Record<string, unknown> = { audience_id: audienceId };
  const extraData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(contact)) {
    if (KNOWN_COLUMNS.includes(key)) {
      row[key] = typeof value === 'string' ? value : String(value);
    } else {
      extraData[key] = value;
    }
  }

  row.data = extraData;
  return row;
}

// Insert contacts into audience_contacts in batches of 200
async function insertContactsBatch(audienceId: string, contacts: Record<string, unknown>[]) {
  const BATCH_SIZE = 200;
  let inserted = 0;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const rows = batch.map(c => contactToRow(audienceId, c));

    const { error } = await supabaseAdmin
      .from('audience_contacts')
      .insert(rows);

    if (error) {
      console.error(`[Import] Error inserting batch at offset ${i}:`, error);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
}

/**
 * Chunked audience import from URL.
 *
 * Step 1 (init): POST { url, name, request_id }
 *   - Fetches page 1, creates audience record, inserts contacts into audience_contacts table
 *
 * Step 2 (chunk): POST { url, audience_id, page_start, page_end }
 *   - Fetches pages, normalizes, inserts directly into audience_contacts (no read-modify-write)
 *
 * Step 3 (finalize): POST { audience_id, finalize: true }
 *   - Counts rows in audience_contacts, updates audience_requests with final count
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const supabase = createClient(req, res);
  const { url, name, request_id, audience_id, page_start, page_end, finalize, reimport } = req.body;

  // --- Step 3: Finalize ---
  if (finalize && audience_id) {
    return await handleFinalize(supabase, authResult, req, res, audience_id, url, request_id);
  }

  // --- Step 2: Fetch chunk of pages ---
  if (audience_id && page_start && page_end && url) {
    return await handleChunk(res, url, audience_id, page_start, page_end);
  }

  // --- Step 1a: Re-import into existing audience ---
  if (reimport && audience_id && url && name) {
    return await handleReimportInit(supabase, res, url, name, audience_id);
  }

  // --- Step 1: Init ---
  if (!url || !name) {
    return res.status(400).json({ error: 'URL and audience name are required' });
  }

  return await handleInit(supabase, authResult, res, url, name, request_id);
}

// Step 1: Create audience record and return pagination info
async function handleInit(
  supabase: ReturnType<typeof createClient>,
  authResult: { user: { id: string } },
  res: NextApiResponse,
  url: string,
  name: string,
  request_id?: string,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Get API key
  const { data: anyApiKey } = await supabaseAdmin
    .from('user_api_keys')
    .select('api_key')
    .limit(1)
    .single();

  const apiKey = anyApiKey?.api_key;
  if (!apiKey) {
    return res.status(400).json({ error: 'No API key configured.' });
  }

  const fetchHeaders: Record<string, string> = { 'Accept': 'application/json' };
  if (parsedUrl.hostname.includes('audiencelab.io')) {
    fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
  }
  fetchHeaders['X-API-Key'] = apiKey;

  // Fetch page 1
  console.log(`[Import] Init: fetching page 1 from ${url}`);
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
    try { firstPageData = JSON.parse(text); } catch {
      return res.status(400).json({ error: 'Response is not valid JSON' });
    }
  }

  const totalPages = Number(firstPageData.total_pages || firstPageData.TotalPages || firstPageData.totalPages || 1);
  const firstPageRecords = (firstPageData.Data || firstPageData.data || firstPageData.records || firstPageData.contacts || []) as Record<string, unknown>[];

  // Process page 1
  const contacts = firstPageRecords.map(r => normalizeContact(cleanRecord(r)));
  console.log(`[Import] Init: page 1 has ${contacts.length} records, ${totalPages} total pages`);

  // Create audience record
  const audienceId = `manual_${crypto.randomUUID()}`;

  if (request_id) {
    const { data: existingRequest } = await supabase
      .from('audience_requests')
      .select('form_data')
      .eq('id', request_id)
      .single();

    await supabase
      .from('audience_requests')
      .update({
        status: 'approved',
        audience_id: audienceId,
        reviewed_by: authResult.user.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: `Importing from URL... (page 1/${totalPages})`,
        form_data: {
          ...(existingRequest?.form_data as Record<string, unknown> || {}),
          manual_audience: {
            id: audienceId,
            name: name.trim(),
            total_records: contacts.length,
            uploaded_at: new Date().toISOString(),
            uploaded_by: authResult.user.id,
            source_url: url,
          },
        } as Json,
      })
      .eq('id', request_id);
  } else {
    await supabase
      .from('audience_requests')
      .insert({
        user_id: authResult.user.id,
        request_type: 'standard',
        name: name.trim(),
        status: 'approved',
        audience_id: audienceId,
        reviewed_by: authResult.user.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: `Importing from URL... (page 1/${totalPages})`,
        form_data: {
          manual_audience: {
            id: audienceId,
            name: name.trim(),
            total_records: contacts.length,
            uploaded_at: new Date().toISOString(),
            uploaded_by: authResult.user.id,
            source_url: url,
          },
        } as Json,
      });
  }

  // Insert page 1 contacts into audience_contacts table
  const inserted = await insertContactsBatch(audienceId, contacts);
  console.log(`[Import] Init: inserted ${inserted} contacts into audience_contacts`);

  return res.status(200).json({
    success: true,
    step: 'init',
    audience_id: audienceId,
    total_pages: totalPages,
    records_fetched: contacts.length,
  });
}

// Step 1a: Re-import into existing audience (contacts already cleared by clear-contacts endpoint)
async function handleReimportInit(
  supabase: ReturnType<typeof createClient>,
  res: NextApiResponse,
  url: string,
  name: string,
  audienceId: string,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  const { data: anyApiKey } = await supabaseAdmin
    .from('user_api_keys')
    .select('api_key')
    .limit(1)
    .single();

  const apiKey = anyApiKey?.api_key;
  if (!apiKey) {
    return res.status(400).json({ error: 'No API key configured.' });
  }

  const fetchHeaders: Record<string, string> = { 'Accept': 'application/json' };
  if (parsedUrl.hostname.includes('audiencelab.io')) {
    fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
  }
  fetchHeaders['X-API-Key'] = apiKey;

  console.log(`[Import] Re-import init: fetching page 1 from ${url}`);
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
    try { firstPageData = JSON.parse(text); } catch {
      return res.status(400).json({ error: 'Response is not valid JSON' });
    }
  }

  const totalPages = Number(firstPageData.total_pages || firstPageData.TotalPages || firstPageData.totalPages || 1);
  const firstPageRecords = (firstPageData.Data || firstPageData.data || firstPageData.records || firstPageData.contacts || []) as Record<string, unknown>[];

  const contacts = firstPageRecords.map(r => normalizeContact(cleanRecord(r)));
  console.log(`[Import] Re-import init: page 1 has ${contacts.length} records, ${totalPages} total pages`);

  // Update the existing audience_requests row with progress
  await supabaseAdmin
    .from('audience_requests')
    .update({
      admin_notes: `Re-importing from URL... (page 1/${totalPages})`,
    })
    .eq('audience_id', audienceId);

  // Insert page 1 contacts
  const inserted = await insertContactsBatch(audienceId, contacts);
  console.log(`[Import] Re-import init: inserted ${inserted} contacts`);

  return res.status(200).json({
    success: true,
    step: 'init',
    audience_id: audienceId,
    total_pages: totalPages,
    records_fetched: contacts.length,
  });
}

// Step 2: Fetch a chunk of pages and insert into audience_contacts
async function handleChunk(
  res: NextApiResponse,
  url: string,
  audienceId: string,
  pageStart: number,
  pageEnd: number,
) {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  // Get API key
  const { data: anyApiKey } = await supabaseAdmin
    .from('user_api_keys')
    .select('api_key')
    .limit(1)
    .single();

  const apiKey = anyApiKey?.api_key;
  if (!apiKey) {
    return res.status(400).json({ error: 'No API key configured.' });
  }

  const fetchHeaders: Record<string, string> = { 'Accept': 'application/json' };
  if (parsedUrl.hostname.includes('audiencelab.io')) {
    fetchHeaders['Authorization'] = `Bearer ${apiKey}`;
  }
  fetchHeaders['X-API-Key'] = apiKey;

  // Fetch all pages in this chunk in parallel
  console.log(`[Import] Chunk: fetching pages ${pageStart}-${pageEnd}`);
  const pagePromises = [];
  for (let page = pageStart; page <= pageEnd; page++) {
    const pageUrl = new URL(url);
    pageUrl.searchParams.set('page', String(page));

    pagePromises.push(
      fetch(pageUrl.toString(), { method: 'GET', headers: fetchHeaders })
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
  const newContacts: Record<string, unknown>[] = [];
  for (const records of batchResults) {
    for (const record of records) {
      newContacts.push(normalizeContact(cleanRecord(record)));
    }
  }

  console.log(`[Import] Chunk: processed ${newContacts.length} contacts from pages ${pageStart}-${pageEnd}`);

  // Insert directly into audience_contacts — no read-modify-write
  const inserted = await insertContactsBatch(audienceId, newContacts);
  console.log(`[Import] Chunk: inserted ${inserted} contacts`);

  // Update progress note (lightweight — no contacts payload)
  await supabaseAdmin
    .from('audience_requests')
    .update({
      admin_notes: `Importing from URL... (pages ${pageStart}-${pageEnd} done)`,
    })
    .eq('audience_id', audienceId);

  return res.status(200).json({
    success: true,
    step: 'chunk',
    pages_fetched: `${pageStart}-${pageEnd}`,
    chunk_records: newContacts.length,
    total_inserted: inserted,
  });
}

// Step 3: Finalize the import
async function handleFinalize(
  supabase: ReturnType<typeof createClient>,
  authResult: { user: { id: string } },
  req: NextApiRequest,
  res: NextApiResponse,
  audienceId: string,
  url?: string,
  request_id?: string,
) {
  // Count actual rows in audience_contacts
  const { count, error: countError } = await supabaseAdmin
    .from('audience_contacts')
    .select('id', { count: 'exact', head: true })
    .eq('audience_id', audienceId);

  if (countError) {
    console.error('[Import] Error counting contacts:', countError);
  }

  const totalRecords = count || 0;

  const { data: finalReq } = await supabase
    .from('audience_requests')
    .select('id, form_data')
    .eq('audience_id', audienceId)
    .single();

  if (!finalReq) {
    return res.status(404).json({ error: 'Audience not found' });
  }

  const formData = finalReq.form_data as Record<string, unknown> || {};
  const manualAudience = (formData.manual_audience || {}) as Record<string, unknown>;

  await supabase
    .from('audience_requests')
    .update({
      admin_notes: `Manual audience imported from URL. ${totalRecords} contacts.`,
      form_data: {
        ...formData,
        manual_audience: {
          ...manualAudience,
          total_records: totalRecords,
        },
      } as Json,
    })
    .eq('id', finalReq.id);

  await logAuditAction(
    authResult.user.id,
    'create_manual_audience',
    req,
    res,
    'audience',
    audienceId,
    { contacts_count: totalRecords, source_url: url, request_id }
  );

  return res.status(200).json({
    success: true,
    step: 'finalize',
    audience: {
      id: audienceId,
      name: manualAudience.name,
      total_records: totalRecords,
    },
  });
}
