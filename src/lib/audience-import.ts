/**
 * Shared audience-import logic.
 *
 * Single source of truth for normalizing AudienceLab contacts and for the
 * resumable, server-driven import pipeline used by the cron worker
 * (`/api/cron/process-audience-imports`) and the enqueue endpoint
 * (`/api/admin/audiences/reimport`).
 *
 * Design notes:
 *  - Contacts are imported into a STAGING audience_id, then atomically swapped
 *    onto the live id via the `swap_audience_import_staging` RPC. The live
 *    audience keeps its old contacts until the new set is fully imported, so a
 *    failure mid-run never leaves an empty audience.
 *  - Each staging row carries its source page in `data._p`, so re-running a
 *    chunk (after a crash/resume) is idempotent: we delete the page range
 *    first, then insert. The `_p` marker is stripped during the swap.
 */
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getEffectiveUserId } from '@/lib/api-helpers';
import { logEvent } from '@/lib/webhook-logger';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Tuning -----------------------------------------------------------------
export const CHUNK_SIZE = 10;          // pages fetched per cursor advance
const PAGE_CONCURRENCY = 5;            // pages fetched in parallel within a chunk
const PAGE_MAX_RETRIES = 3;            // retries per page on transient errors
const PAGE_FETCH_TIMEOUT = 30_000;     // 30s per page request
const INSERT_BATCH_SIZE = 200;         // rows per DB insert
const INSERT_MAX_RETRIES = 3;

// ===========================================================================
// Normalization (moved verbatim from import-from-url.ts so both paths agree)
// ===========================================================================

/** Strip empty/null fields from a record (recursively for one level). */
export function cleanRecord(record: Record<string, unknown>): Record<string, unknown> {
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

/** Normalize an AudienceLab contact to standard field names. */
export function normalizeContact(contact: Record<string, unknown>): Record<string, unknown> {
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

  for (const key of Object.keys(normalized)) {
    if (normalized[key] === null) delete normalized[key];
  }

  for (const [key, value] of Object.entries(merged)) {
    const lowerKey = key.toLowerCase();
    if (value !== '' && value !== null && value !== undefined && !normalized[lowerKey]) {
      normalized[lowerKey] = value;
    }
  }

  return normalized;
}

const KNOWN_COLUMNS = [
  'email', 'full_name', 'first_name', 'last_name', 'company',
  'job_title', 'phone', 'city', 'state', 'country',
  'linkedin_url', 'seniority', 'department',
];

/** Convert a normalized contact into an audience_contacts row. */
export function contactToRow(audienceId: string, contact: Record<string, unknown>) {
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

/** Insert contacts into audience_contacts in batches with retry. Returns inserted count. */
export async function insertContactsBatch(
  audienceId: string,
  contacts: Record<string, unknown>[]
): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < contacts.length; i += INSERT_BATCH_SIZE) {
    const batch = contacts.slice(i, i + INSERT_BATCH_SIZE);
    const rows = batch.map(c => contactToRow(audienceId, c));

    let success = false;
    for (let attempt = 0; attempt < INSERT_MAX_RETRIES; attempt++) {
      const { error } = await supabaseAdmin.from('audience_contacts').insert(rows);
      if (!error) { inserted += batch.length; success = true; break; }
      console.error(`[audience-import] insert batch @${i} attempt ${attempt + 1}:`, error.message);
      if (attempt < INSERT_MAX_RETRIES - 1) await sleep(1000 * (attempt + 1));
    }
    if (!success) {
      console.error(`[audience-import] batch @${i} failed after ${INSERT_MAX_RETRIES} retries, skipping ${batch.length}`);
    }
  }
  return inserted;
}

// ===========================================================================
// API key + headers
// ===========================================================================

function sleep(ms: number) {
  return new Promise<void>(r => setTimeout(r, ms));
}

/**
 * Resolve the AudienceLab API key to use for an audience, preferring the
 * audience owner's key (team-aware via getEffectiveUserId) and only falling
 * back to any key in the table as a last resort. Fixes the prior
 * `limit(1).single()` behaviour that could pick a wrong-tenant / rate-limited key.
 */
export async function resolveApiKey(audienceId: string): Promise<string | null> {
  const { data: req } = await supabaseAdmin
    .from('audience_requests')
    .select('user_id')
    .eq('audience_id', audienceId)
    .maybeSingle();

  const candidateUserIds: string[] = [];
  if (req?.user_id) {
    try {
      const effective = await getEffectiveUserId(req.user_id);
      if (effective) candidateUserIds.push(effective);
    } catch { /* ignore — fall through to owner / any */ }
    if (!candidateUserIds.includes(req.user_id)) candidateUserIds.push(req.user_id);
  }

  for (const uid of candidateUserIds) {
    const { data: key } = await supabaseAdmin
      .from('user_api_keys')
      .select('api_key')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    if (key?.api_key) return key.api_key;
  }

  const { data: anyKey } = await supabaseAdmin
    .from('user_api_keys')
    .select('api_key')
    .limit(1)
    .maybeSingle();
  return anyKey?.api_key ?? null;
}

export function buildHeaders(url: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  try {
    if (new URL(url).hostname.includes('audiencelab.io')) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  } catch { /* invalid URL handled by caller */ }
  headers['X-API-Key'] = apiKey;
  return headers;
}

// ===========================================================================
// Page fetching
// ===========================================================================

interface PageFetchResult {
  records: Record<string, unknown>[];
  failure: { page: number; reason: string } | null;
}

/** Fetch a single page with retries. Respects the provided AbortSignal (deadline). */
async function fetchPage(
  url: string,
  page: number,
  headers: Record<string, string>,
  deadlineSignal: AbortSignal
): Promise<PageFetchResult> {
  let lastReason = 'unknown error';

  for (let attempt = 0; attempt <= PAGE_MAX_RETRIES; attempt++) {
    if (deadlineSignal.aborted) return { records: [], failure: { page, reason: 'deadline' } };
    let waitMs = 1500 * Math.pow(2, attempt); // 1.5s, 3s, 6s, 12s

    try {
      const pageUrl = new URL(url);
      pageUrl.searchParams.set('page', String(page));

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT);
      const onDeadline = () => controller.abort();
      deadlineSignal.addEventListener('abort', onDeadline, { once: true });

      try {
        const resp = await fetch(pageUrl.toString(), {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
        if (resp.ok) {
          const data = await resp.json();
          const records = (data.Data || data.data || data.records || data.contacts || []) as Record<string, unknown>[];
          return { records, failure: null };
        }
        lastReason = `HTTP ${resp.status} ${resp.statusText}`;

        if (resp.status === 429 || resp.status === 503) {
          const ra = resp.headers.get('retry-after');
          const secs = ra ? Number(ra) : NaN;
          if (!Number.isNaN(secs) && secs > 0) waitMs = Math.min(secs * 1000, 30_000);
        }
        // Non-retryable 4xx (other than 408/429) — give up on this page.
        if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
          return { records: [], failure: { page, reason: lastReason } };
        }
      } finally {
        clearTimeout(timer);
        deadlineSignal.removeEventListener('abort', onDeadline);
      }
    } catch (err) {
      if (deadlineSignal.aborted) return { records: [], failure: { page, reason: 'deadline' } };
      const msg = err instanceof Error ? err.message : String(err);
      lastReason = /abort/i.test(msg) ? `timeout after ${PAGE_FETCH_TIMEOUT / 1000}s` : msg;
    }

    if (attempt < PAGE_MAX_RETRIES) await sleep(waitMs);
  }
  return { records: [], failure: { page, reason: lastReason } };
}

export interface ChunkResult {
  /** Normalized contacts tagged with their source page. */
  tagged: { page: number; contact: Record<string, unknown> }[];
  failedPages: { page: number; reason: string }[];
  /** True if the deadline was hit before all pages were attempted — caller must NOT advance the cursor. */
  abortedByDeadline: boolean;
}

/**
 * Fetch pages [pageStart..pageEnd] with bounded concurrency. Aborts in-flight
 * work when `deadlineAt` is reached and reports abortedByDeadline so the worker
 * leaves the cursor untouched for a clean resume.
 */
export async function fetchChunk(
  url: string,
  headers: Record<string, string>,
  pageStart: number,
  pageEnd: number,
  deadlineAt: number
): Promise<ChunkResult> {
  const pages: number[] = [];
  for (let p = pageStart; p <= pageEnd; p++) pages.push(p);

  const tagged: { page: number; contact: Record<string, unknown> }[] = [];
  const failedPages: { page: number; reason: string }[] = [];
  let abortedByDeadline = false;

  for (let i = 0; i < pages.length; i += PAGE_CONCURRENCY) {
    if (Date.now() >= deadlineAt) { abortedByDeadline = true; break; }

    const remaining = deadlineAt - Date.now();
    const controller = new AbortController();
    const deadlineTimer = setTimeout(() => controller.abort(), remaining);

    const wave = pages.slice(i, i + PAGE_CONCURRENCY);
    const results = await Promise.all(
      wave.map(p => fetchPage(url, p, headers, controller.signal))
    );
    clearTimeout(deadlineTimer);

    for (const { records, failure } of results) {
      if (failure) {
        if (failure.reason === 'deadline') { abortedByDeadline = true; continue; }
        failedPages.push(failure);
      }
    }
    // Re-derive page->records mapping by zipping wave with results order.
    wave.forEach((p, idx) => {
      for (const record of results[idx].records) {
        tagged.push({ page: p, contact: normalizeContact(cleanRecord(record)) });
      }
    });

    if (abortedByDeadline) break;
    if (i + PAGE_CONCURRENCY < pages.length) await sleep(300); // gentle rate-limit pacing
  }

  return { tagged, failedPages, abortedByDeadline };
}

/**
 * Idempotently insert a chunk's contacts into the staging audience. Deletes any
 * existing staging rows for the page range first (so a re-run after a crash
 * doesn't duplicate), then inserts with the `_p` page marker. Returns inserted count.
 */
export async function insertStagingChunk(
  stagingAudienceId: string,
  pageStart: number,
  pageEnd: number,
  tagged: { page: number; contact: Record<string, unknown> }[]
): Promise<number> {
  // Idempotency: clear anything previously inserted for this page range. Match
  // on the exact set of page numbers (text equality) — a range compare on the
  // JSON text value would mis-order ("9" > "10"), so use an explicit IN list.
  const pageList: string[] = [];
  for (let p = pageStart; p <= pageEnd; p++) pageList.push(String(p));
  await supabaseAdmin
    .from('audience_contacts')
    .delete()
    .eq('audience_id', stagingAudienceId)
    .in('data->>_p', pageList);

  if (tagged.length === 0) return 0;

  let inserted = 0;
  for (let i = 0; i < tagged.length; i += INSERT_BATCH_SIZE) {
    const batch = tagged.slice(i, i + INSERT_BATCH_SIZE);
    const rows = batch.map(({ page, contact }) => {
      const row = contactToRow(stagingAudienceId, contact);
      (row.data as Record<string, unknown>)._p = page;
      return row;
    });

    let success = false;
    for (let attempt = 0; attempt < INSERT_MAX_RETRIES; attempt++) {
      const { error } = await supabaseAdmin.from('audience_contacts').insert(rows);
      if (!error) { inserted += batch.length; success = true; break; }
      console.error(`[audience-import] staging insert @${i} attempt ${attempt + 1}:`, error.message);
      if (attempt < INSERT_MAX_RETRIES - 1) await sleep(1000 * (attempt + 1));
    }
    if (!success) {
      throw new Error(`Staging insert failed after ${INSERT_MAX_RETRIES} retries (pages ${pageStart}-${pageEnd})`);
    }
  }
  return inserted;
}

// ===========================================================================
// Job processing
// ===========================================================================

export interface ImportJob {
  id: string;
  audience_id: string;
  staging_audience_id: string;
  request_id: string | null;
  source_url: string;
  audience_name: string | null;
  user_id: string | null;
  total_pages: number;
  next_page: number;
  pages_done: number;
  contacts_imported: number;
  failed_pages: { page: number; reason: string }[];
  attempts: number;
}

export type JobOutcome = 'done' | 'paused' | 'failed';

const MAX_JOB_ATTEMPTS = 12; // guard against a permanently-stuck job looping forever

/**
 * Process one claimed job until completion or until `deadlineAt` is reached.
 *  - Advances `next_page` only after a chunk is committed to staging.
 *  - On completion, atomically swaps staging onto the live audience and
 *    finalizes the audience_requests row.
 * Returns 'done' (finished), 'paused' (deadline hit — resume next run), or
 * 'failed' (terminal error).
 */
export async function processImportJob(job: ImportJob, deadlineAt: number): Promise<JobOutcome> {
  if (job.attempts > MAX_JOB_ATTEMPTS) {
    await failJob(job, `Exceeded ${MAX_JOB_ATTEMPTS} attempts without completing`);
    return 'failed';
  }

  const apiKey = await resolveApiKey(job.audience_id);
  if (!apiKey) {
    await failJob(job, 'No AudienceLab API key configured for this audience');
    return 'failed';
  }
  const headers = buildHeaders(job.source_url, apiKey);

  let nextPage = job.next_page;
  let pagesDone = job.pages_done;
  let contactsImported = job.contacts_imported;
  const failedPages = [...(job.failed_pages || [])];

  while (nextPage <= job.total_pages) {
    // Need enough headroom to fetch + insert a chunk; otherwise pause cleanly.
    if (Date.now() >= deadlineAt) {
      await pauseJob(job.id, { next_page: nextPage, pages_done: pagesDone, contacts_imported: contactsImported, failed_pages: failedPages });
      return 'paused';
    }

    const pageStart = nextPage;
    const pageEnd = Math.min(pageStart + CHUNK_SIZE - 1, job.total_pages);

    let chunk: ChunkResult;
    try {
      chunk = await fetchChunk(job.source_url, headers, pageStart, pageEnd, deadlineAt);
    } catch (err) {
      // Transient fetch infra error — pause and let the next run retry this chunk.
      await pauseJob(job.id, { next_page: nextPage, pages_done: pagesDone, contacts_imported: contactsImported, failed_pages: failedPages, last_error: (err as Error).message });
      return 'paused';
    }

    // Deadline hit before the chunk finished — do NOT advance the cursor.
    if (chunk.abortedByDeadline) {
      // Partial work (if any) will be re-cleared by the idempotent insert range
      // on resume, so pause without advancing.
      await pauseJob(job.id, { next_page: nextPage, pages_done: pagesDone, contacts_imported: contactsImported, failed_pages: failedPages });
      return 'paused';
    }

    let insertedThisChunk: number;
    try {
      insertedThisChunk = await insertStagingChunk(job.staging_audience_id, pageStart, pageEnd, chunk.tagged);
    } catch (err) {
      await pauseJob(job.id, { next_page: nextPage, pages_done: pagesDone, contacts_imported: contactsImported, failed_pages: failedPages, last_error: (err as Error).message });
      return 'paused';
    }

    // Chunk committed — advance the cursor.
    contactsImported += insertedThisChunk;
    pagesDone += (pageEnd - pageStart + 1);
    if (chunk.failedPages.length) failedPages.push(...chunk.failedPages);
    nextPage = pageEnd + 1;

    await heartbeat(job.id, {
      next_page: nextPage,
      pages_done: pagesDone,
      contacts_imported: contactsImported,
      failed_pages: failedPages,
    });

    // Update the audience_requests progress note (lightweight).
    if (job.request_id) {
      await supabaseAdmin
        .from('audience_requests')
        .update({ admin_notes: `Re-importing… ${pagesDone}/${job.total_pages} pages, ${contactsImported.toLocaleString()} contacts` })
        .eq('id', job.request_id);
    }
  }

  // All pages processed → atomic swap (clear-on-success).
  const { data: promoted, error: swapErr } = await supabaseAdmin.rpc('swap_audience_import_staging', {
    p_real_id: job.audience_id,
    p_staging_id: job.staging_audience_id,
  });

  if (swapErr) {
    await failJob({ ...job, contacts_imported: contactsImported }, `Swap failed: ${swapErr.message}`);
    return 'failed';
  }

  const finalCount = typeof promoted === 'number' ? promoted : contactsImported;
  await finalizeJob({ ...job, failed_pages: failedPages }, finalCount);
  return 'done';
}

type ProgressFields = Partial<{ next_page: number; pages_done: number; contacts_imported: number; failed_pages: unknown; last_error: string }>;

/** Persist progress + heartbeat for a job that is still actively processing. */
async function heartbeat(jobId: string, fields: ProgressFields) {
  await supabaseAdmin
    .from('audience_import_jobs')
    .update({ ...fields, status: 'running', heartbeat_at: new Date().toISOString() })
    .eq('id', jobId);
}

/**
 * Persist progress and hand the job back as `pending` so the very next cron tick
 * reclaims it immediately (rather than waiting out the stale-heartbeat window,
 * which is reserved for crash recovery). Used at every clean deadline-pause.
 */
async function pauseJob(jobId: string, fields: ProgressFields) {
  await supabaseAdmin
    .from('audience_import_jobs')
    .update({ ...fields, status: 'pending', heartbeat_at: new Date().toISOString() })
    .eq('id', jobId);
}

async function failJob(job: ImportJob, reason: string) {
  console.error(`[audience-import] job ${job.id} failed: ${reason}`);
  await supabaseAdmin
    .from('audience_import_jobs')
    .update({ status: 'failed', last_error: reason, finished_at: new Date().toISOString(), heartbeat_at: new Date().toISOString() })
    .eq('id', job.id);

  // Clean up staging rows so they don't accumulate.
  await supabaseAdmin.from('audience_contacts').delete().eq('audience_id', job.staging_audience_id);

  if (job.request_id) {
    await supabaseAdmin
      .from('audience_requests')
      .update({ admin_notes: `Re-import failed: ${reason}` })
      .eq('id', job.request_id);
  }

  await logEvent({
    type: 'audience',
    event_name: 'audience_reimport_failed',
    status: 'error',
    message: `Audience re-import failed: "${job.audience_name}" — ${reason}`,
    user_id: job.user_id || undefined,
    request_data: { audience_id: job.audience_id, job_id: job.id, source_url: job.source_url },
    error_details: reason,
  });
}

async function finalizeJob(job: ImportJob, finalCount: number) {
  await supabaseAdmin
    .from('audience_import_jobs')
    .update({
      status: 'done',
      contacts_imported: finalCount,
      pages_done: job.total_pages,
      next_page: job.total_pages + 1,
      finished_at: new Date().toISOString(),
      heartbeat_at: new Date().toISOString(),
    })
    .eq('id', job.id);

  // Update the live audience record's total_records + note.
  if (job.request_id) {
    const { data: reqRow } = await supabaseAdmin
      .from('audience_requests')
      .select('form_data')
      .eq('id', job.request_id)
      .maybeSingle();
    const formData = (reqRow?.form_data || {}) as Record<string, unknown>;
    const manualAudience = (formData.manual_audience || {}) as Record<string, unknown>;
    await supabaseAdmin
      .from('audience_requests')
      .update({
        admin_notes: `Manual audience re-imported from URL. ${finalCount.toLocaleString()} contacts.`,
        form_data: { ...formData, manual_audience: { ...manualAudience, total_records: finalCount } },
      })
      .eq('id', job.request_id);
  }

  const failedCount = (job.failed_pages || []).length;
  await logEvent({
    type: 'audience',
    event_name: 'audience_reimport_complete',
    status: failedCount > 0 ? 'warning' : 'success',
    message: `Audience re-import completed: "${job.audience_name}" — ${finalCount.toLocaleString()} contacts`
      + (failedCount > 0 ? ` (${failedCount} pages failed)` : ''),
    user_id: job.user_id || undefined,
    request_data: { audience_id: job.audience_id, job_id: job.id, source_url: job.source_url, total_pages: job.total_pages },
    response_data: {
      total_records: finalCount,
      failed_pages: failedCount,
      failed_page_numbers: (job.failed_pages || []).map(f => f.page),
    },
  });
}
