import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/api-helpers';
import { logEvent } from '@/lib/webhook-logger';
import { resolveApiKey, buildHeaders } from '@/lib/audience-import';
import crypto from 'crypto';

export const config = { maxDuration: 60 };

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Enqueue a resumable audience re-import.
 *
 * Verifies the source URL works (fetches page 1 to read total_pages) BEFORE
 * creating a job, then enqueues an `audience_import_jobs` row for the cron
 * worker to process. Does NOT clear existing contacts — the worker imports into
 * a staging id and swaps on success, so the live audience is never emptied.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { audience_id, url, name } = req.body || {};
  if (!audience_id || !url || !name) {
    return res.status(400).json({ error: 'audience_id, url and name are required' });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' });
  }
  void parsedUrl;

  // If an active job already exists for this audience, return it (idempotent enqueue).
  const { data: existing } = await supabaseAdmin
    .from('audience_import_jobs')
    .select('id, status, total_pages')
    .eq('audience_id', audience_id)
    .in('status', ['pending', 'running'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return res.status(200).json({
      success: true,
      job_id: existing.id,
      total_pages: existing.total_pages,
      status: existing.status,
      already_running: true,
    });
  }

  // Resolve the audience owner's API key and verify page 1.
  const apiKey = await resolveApiKey(audience_id);
  if (!apiKey) {
    return res.status(400).json({ error: 'No AudienceLab API key configured for this audience.' });
  }
  const headers = buildHeaders(url, apiKey);

  let totalPages = 1;
  const VERIFY_TIMEOUT = 45_000;
  const VERIFY_RETRIES = 3;
  let lastErr = '';
  let ok = false;
  for (let attempt = 0; attempt < VERIFY_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT);
    try {
      const resp = await fetch(url, { method: 'GET', headers, signal: ctrl.signal });
      clearTimeout(t);
      if (resp.ok) {
        const data = await resp.json();
        totalPages = Number(data.total_pages || data.TotalPages || data.totalPages || 1) || 1;
        ok = true;
        break;
      }
      lastErr = `HTTP ${resp.status} ${resp.statusText}`;
      // Non-retryable client error — surface immediately, don't enqueue.
      if (resp.status >= 400 && resp.status < 500 && resp.status !== 408 && resp.status !== 429) {
        return res.status(resp.status).json({ error: `Source URL not accessible: ${lastErr}` });
      }
    } catch (err) {
      clearTimeout(t);
      const msg = err instanceof Error ? err.message : String(err);
      lastErr = /abort/i.test(msg) ? `timeout after ${VERIFY_TIMEOUT / 1000}s` : msg;
    }
    if (attempt < VERIFY_RETRIES - 1) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
  }
  if (!ok) {
    return res.status(504).json({ error: `Source URL unreachable after ${VERIFY_RETRIES} attempts — ${lastErr}` });
  }

  // Look up the audience_requests row (for progress notes + owner).
  const { data: reqRow } = await supabaseAdmin
    .from('audience_requests')
    .select('id, user_id')
    .eq('audience_id', audience_id)
    .maybeSingle();

  const jobId = crypto.randomUUID();
  const stagingAudienceId = `${audience_id}__staging_${jobId.slice(0, 8)}`;

  const { error: insertErr } = await supabaseAdmin
    .from('audience_import_jobs')
    .insert({
      id: jobId,
      audience_id,
      staging_audience_id: stagingAudienceId,
      request_id: reqRow?.id || null,
      source_url: url,
      audience_name: name,
      user_id: reqRow?.user_id || authResult.user.id,
      mode: 'reimport',
      status: 'pending',
      total_pages: totalPages,
      next_page: 1,
      pages_done: 0,
      contacts_imported: 0,
    });

  if (insertErr) {
    console.error('[reimport] failed to enqueue job:', insertErr);
    return res.status(500).json({ error: 'Failed to enqueue re-import job' });
  }

  // Defensive: clear any orphaned staging rows under this exact staging id.
  await supabaseAdmin.from('audience_contacts').delete().eq('audience_id', stagingAudienceId);

  await logEvent({
    type: 'audience',
    event_name: 'audience_reimport_start',
    status: 'info',
    message: `Audience re-import queued: "${name}" — ${totalPages} pages (~${(totalPages * 50).toLocaleString()} contacts). Processing in background.`,
    user_id: authResult.user.id,
    request_data: { audience_id, job_id: jobId, source_url: url, total_pages: totalPages },
  });

  return res.status(200).json({
    success: true,
    job_id: jobId,
    total_pages: totalPages,
    status: 'pending',
  });
}
