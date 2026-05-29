import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Poll the status of an audience import job. The frontend uses this for the
 * progress bar; because the job runs server-side, progress survives the tab
 * being closed. Accepts ?job_id= or ?audience_id= (latest job for the audience).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const jobId = typeof req.query.job_id === 'string' ? req.query.job_id : null;
  const audienceId = typeof req.query.audience_id === 'string' ? req.query.audience_id : null;
  if (!jobId && !audienceId) {
    return res.status(400).json({ error: 'job_id or audience_id is required' });
  }

  let query = supabaseAdmin
    .from('audience_import_jobs')
    .select('id, audience_id, status, total_pages, next_page, pages_done, contacts_imported, failed_pages, last_error, started_at, finished_at, updated_at');

  query = jobId
    ? query.eq('id', jobId)
    : query.eq('audience_id', audienceId!).order('created_at', { ascending: false }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) {
    console.error('[import-job-status] query error:', error.message);
    return res.status(500).json({ error: 'Failed to load job status' });
  }
  if (!data) {
    return res.status(404).json({ error: 'No import job found' });
  }

  const failedPages = Array.isArray(data.failed_pages) ? data.failed_pages : [];
  const percent =
    data.status === 'done'
      ? 100
      : data.total_pages > 0
        ? Math.min(99, Math.round((data.pages_done / data.total_pages) * 100))
        : 0;

  return res.status(200).json({
    job_id: data.id,
    audience_id: data.audience_id,
    status: data.status, // pending | running | done | failed
    total_pages: data.total_pages,
    pages_done: data.pages_done,
    contacts_imported: data.contacts_imported,
    failed_pages: failedPages.length,
    percent,
    last_error: data.last_error,
    started_at: data.started_at,
    finished_at: data.finished_at,
    updated_at: data.updated_at,
  });
}
