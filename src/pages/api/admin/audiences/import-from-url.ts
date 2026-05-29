import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { logEvent } from '@/lib/webhook-logger';
import { cleanRecord, normalizeContact, insertContactsBatch } from '@/lib/audience-import';
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
  const { url, name, request_id, audience_id, page_start, page_end, finalize, reimport, verify_only } = req.body;

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
    return await handleReimportInit(supabase, res, url, name, audience_id, verify_only);
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

  // Fetch page 1 (with retries — AudienceLab /segments/UUID can be intermittently slow)
  console.log(`[Import] Init: fetching page 1 from ${url}`);
  let firstPageResponse: Response | null = null;
  const PAGE1_RETRIES = 3;
  const PAGE1_TIMEOUT = 45000;
  let lastErr = '';
  for (let attempt = 0; attempt < PAGE1_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PAGE1_TIMEOUT);
    try {
      const resp = await fetch(url, { method: 'GET', headers: fetchHeaders, signal: ctrl.signal });
      clearTimeout(t);
      if (resp.ok) { firstPageResponse = resp; break; }
      lastErr = `HTTP ${resp.status} ${resp.statusText}`;
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
        return res.status(resp.status).json({ error: `Failed to fetch: ${lastErr}` });
      }
    } catch (err) {
      clearTimeout(t);
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = msg.includes('abort') ? `timeout after ${PAGE1_TIMEOUT / 1000}s` : msg;
      console.error(`[Import] Init page 1 attempt ${attempt + 1}/${PAGE1_RETRIES} failed: ${lastErr}`);
    }
    if (attempt < PAGE1_RETRIES - 1) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  if (!firstPageResponse) {
    return res.status(504).json({ error: `AudienceLab API unreachable after ${PAGE1_RETRIES} attempts — last error: ${lastErr}` });
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

  console.log(`[Import] Init: response keys=${Object.keys(firstPageData).join(',')} total_pages=${firstPageData.total_pages ?? firstPageData.TotalPages ?? firstPageData.totalPages}`);
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

  await logEvent({
    type: 'audience',
    event_name: 'audience_import_start',
    status: 'info',
    message: `Audience import started: "${name.trim()}" — page 1/${totalPages}, ${contacts.length} contacts`,
    user_id: authResult.user.id,
    request_data: { audience_id: audienceId, source_url: url, total_pages: totalPages },
    response_data: { page_1_records: contacts.length, inserted },
  });

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
  verifyOnly?: boolean,
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
  let firstPageResponse: Response | null = null;
  const PAGE1_RETRIES = 3;
  const PAGE1_TIMEOUT = 45000;
  let lastErr = '';
  for (let attempt = 0; attempt < PAGE1_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), PAGE1_TIMEOUT);
    try {
      const resp = await fetch(url, { method: 'GET', headers: fetchHeaders, signal: ctrl.signal });
      clearTimeout(t);
      if (resp.ok) { firstPageResponse = resp; break; }
      lastErr = `HTTP ${resp.status} ${resp.statusText}`;
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
        return res.status(resp.status).json({ error: `Failed to fetch: ${lastErr}` });
      }
    } catch (err) {
      clearTimeout(t);
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = msg.includes('abort') ? `timeout after ${PAGE1_TIMEOUT / 1000}s` : msg;
      console.error(`[Import] Re-import page 1 attempt ${attempt + 1}/${PAGE1_RETRIES} failed: ${lastErr}`);
    }
    if (attempt < PAGE1_RETRIES - 1) {
      await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  if (!firstPageResponse) {
    return res.status(504).json({ error: `AudienceLab API unreachable after ${PAGE1_RETRIES} attempts — last error: ${lastErr}` });
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

  // Diagnostic log — helps identify response format mismatches
  console.log(`[Import] Re-import init: response keys=${Object.keys(firstPageData).join(',')} total_pages=${firstPageData.total_pages ?? firstPageData.TotalPages ?? firstPageData.totalPages}`);

  const totalPages = Number(firstPageData.total_pages || firstPageData.TotalPages || firstPageData.totalPages || 1);
  const firstPageRecords = (firstPageData.Data || firstPageData.data || firstPageData.records || firstPageData.contacts || []) as Record<string, unknown>[];

  const contacts = firstPageRecords.map(r => normalizeContact(cleanRecord(r)));
  console.log(`[Import] Re-import init: page 1 has ${contacts.length} records, ${totalPages} total pages`);

  // If verify_only, return success without inserting — confirms URL is accessible
  if (verifyOnly) {
    return res.status(200).json({
      success: true,
      step: 'verify',
      audience_id: audienceId,
      total_pages: totalPages,
      records_fetched: 0,
    });
  }

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

  await logEvent({
    type: 'audience',
    event_name: 'audience_reimport_start',
    status: 'info',
    message: `Audience re-import started: "${name}" — page 1/${totalPages}, ${contacts.length} contacts`,
    request_data: { audience_id: audienceId, source_url: url, total_pages: totalPages },
    response_data: { page_1_records: contacts.length, inserted },
  });

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

  // Fetch pages with limited concurrency (3 at a time) to avoid rate limiting
  const CONCURRENCY = 3;
  const MAX_RETRIES = 5;
  const FETCH_TIMEOUT = 60000; // 60s per page — deep pages can be slow
  console.log(`[Import] Chunk: fetching pages ${pageStart}-${pageEnd} (concurrency=${CONCURRENCY})`);

  const allPages = [];
  for (let p = pageStart; p <= pageEnd; p++) allPages.push(p);

  const newContacts: Record<string, unknown>[] = [];
  const failures: { page: number; reason: string }[] = [];

  // Process pages in batches of CONCURRENCY
  for (let i = 0; i < allPages.length; i += CONCURRENCY) {
    const batch = allPages.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (page): Promise<{ records: Record<string, unknown>[]; failure: { page: number; reason: string } | null }> => {
        let lastReason = 'unknown error';

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          let waitMs = 1500 * Math.pow(2, attempt); // exponential: 1.5s, 3s, 6s, 12s, 24s, 48s

          try {
            const pageUrl = new URL(url);
            pageUrl.searchParams.set('page', String(page));

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

            const pageResponse = await fetch(pageUrl.toString(), {
              method: 'GET',
              headers: fetchHeaders,
              signal: controller.signal,
            });

            clearTimeout(timeout);

            if (pageResponse.ok) {
              const pageData = await pageResponse.json();
              return {
                records: (pageData.Data || pageData.data || pageData.records || pageData.contacts || []) as Record<string, unknown>[],
                failure: null,
              };
            }

            lastReason = `HTTP ${pageResponse.status} ${pageResponse.statusText}`;
            console.error(`[Import] Page ${page} returned ${pageResponse.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`);

            // Honor Retry-After on 429/503
            if (pageResponse.status === 429 || pageResponse.status === 503) {
              const retryAfter = pageResponse.headers.get('retry-after');
              if (retryAfter) {
                const retrySeconds = Number(retryAfter);
                if (!Number.isNaN(retrySeconds) && retrySeconds > 0) {
                  waitMs = Math.min(retrySeconds * 1000, 60000);
                }
              }
            }

            // Don't retry on 4xx other than 408/429 — they won't recover
            if (pageResponse.status >= 400 && pageResponse.status < 500 && pageResponse.status !== 408 && pageResponse.status !== 429) {
              break;
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : String(err);
            lastReason = errMsg.includes('aborted') || errMsg.includes('AbortError')
              ? `timeout after ${FETCH_TIMEOUT / 1000}s`
              : errMsg;
            console.error(`[Import] Error fetching page ${page} (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${errMsg}`);
          }

          if (attempt < MAX_RETRIES) {
            await new Promise(r => setTimeout(r, waitMs));
          }
        }

        return { records: [], failure: { page, reason: lastReason } };
      })
    );

    for (const { records, failure } of batchResults) {
      if (failure) failures.push(failure);
      for (const record of records) {
        newContacts.push(normalizeContact(cleanRecord(record)));
      }
    }

    // Small delay between concurrency batches to reduce rate-limiting
    if (i + CONCURRENCY < allPages.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  const failedPages = failures.length;
  if (failedPages > 0) {
    console.warn(`[Import] Chunk: ${failedPages} pages failed after retries:`, failures);
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

  // Log failed pages as warnings — include per-page reasons so the cause is visible
  if (failedPages > 0) {
    const failedPageNumbers = failures.map(f => f.page);
    const failureSummary = failures
      .map(f => `page ${f.page}: ${f.reason}`)
      .join('; ');

    await logEvent({
      type: 'api',
      event_name: 'audience_import_chunk',
      status: 'warning',
      message: `Audience chunk pages ${pageStart}-${pageEnd}: ${failedPages} pages failed after retries — ${failureSummary}`,
      request_data: { audience_id: audienceId, page_start: pageStart, page_end: pageEnd },
      response_data: {
        chunk_records: newContacts.length,
        inserted,
        failed_pages: failedPages,
        failed_page_numbers: failedPageNumbers,
        failure_reasons: failures,
      },
    });
  }

  return res.status(200).json({
    success: true,
    step: 'chunk',
    pages_fetched: `${pageStart}-${pageEnd}`,
    chunk_records: newContacts.length,
    total_inserted: inserted,
    failed_pages: failedPages,
    failed_page_numbers: failures.map(f => f.page),
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

  await logEvent({
    type: 'audience',
    event_name: 'audience_import_complete',
    status: totalRecords > 0 ? 'success' : 'warning',
    message: `Audience import completed: "${manualAudience.name}" — ${totalRecords.toLocaleString()} contacts saved`,
    user_id: authResult.user.id,
    request_data: { audience_id: audienceId, source_url: url },
    response_data: { total_records: totalRecords, audience_name: manualAudience.name },
  });

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
