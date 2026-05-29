import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';
import { processImportJob, type ImportJob, type JobOutcome } from '@/lib/audience-import';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Leave a buffer before Vercel's 300s hard limit; jobs pause cleanly at the deadline.
const MAX_PROCESSING_MS = 270_000;
// A running job whose heartbeat is older than this is considered crashed and reclaimable.
const STALE_AFTER_MS = 5 * 60_000;

/**
 * Cron worker for resumable audience imports.
 *
 * Each run claims runnable jobs (pending, or running-but-stale) one at a time via
 * `claim_next_audience_import_job` (FOR UPDATE SKIP LOCKED — safe across overlapping
 * runs), and processes each until it finishes or the time budget is exhausted. A
 * job that hits the deadline is left in `running` with an advanced cursor + fresh
 * heartbeat, so the next run resumes exactly where it stopped.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startTime = Date.now();
  const deadlineAt = startTime + MAX_PROCESSING_MS;
  const processed: { job_id: string; audience_id: string; outcome: JobOutcome }[] = [];

  try {
    // Keep claiming jobs while there's enough budget to make progress (need
    // headroom for at least one chunk: ~35s).
    while (Date.now() < deadlineAt - 35_000) {
      const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
      const { data: claimed, error: claimErr } = await supabaseAdmin
        .rpc('claim_next_audience_import_job', { p_stale_before: staleBefore });

      if (claimErr) {
        console.error('[cron/process-audience-imports] claim error:', claimErr.message);
        await logEvent({
          type: 'api',
          event_name: 'audience_import_worker',
          status: 'error',
          message: 'Audience import worker could not claim a job',
          error_details: claimErr.message,
        });
        break;
      }

      const row = Array.isArray(claimed) ? claimed[0] : claimed;
      if (!row) break; // nothing runnable

      const job: ImportJob = {
        id: row.id,
        audience_id: row.audience_id,
        staging_audience_id: row.staging_audience_id,
        request_id: row.request_id,
        source_url: row.source_url,
        audience_name: row.audience_name,
        user_id: row.user_id,
        total_pages: row.total_pages,
        next_page: row.next_page,
        pages_done: row.pages_done,
        contacts_imported: row.contacts_imported,
        failed_pages: (row.failed_pages || []) as { page: number; reason: string }[],
        attempts: row.attempts,
        swap_phase: row.swap_phase ?? 0,
      };

      let outcome: JobOutcome;
      try {
        outcome = await processImportJob(job, deadlineAt);
      } catch (jobErr) {
        // Error isolation: one job's failure must not crash the worker. Leave it
        // running with a fresh heartbeat so it can be reclaimed/retried later.
        console.error(`[cron/process-audience-imports] job ${job.id} threw:`, (jobErr as Error).message);
        await supabaseAdmin
          .from('audience_import_jobs')
          .update({ last_error: (jobErr as Error).message, heartbeat_at: new Date().toISOString() })
          .eq('id', job.id);
        outcome = 'paused';
      }

      processed.push({ job_id: job.id, audience_id: job.audience_id, outcome });

      // If this job paused because the deadline was reached, stop the whole run.
      if (outcome === 'paused') break;
    }

    return res.status(200).json({
      success: true,
      processed: processed.length,
      jobs: processed,
      elapsed_ms: Date.now() - startTime,
    });
  } catch (error) {
    console.error('[cron/process-audience-imports] crashed:', error);
    await logEvent({
      type: 'api',
      event_name: 'audience_import_worker',
      status: 'error',
      message: 'Audience import worker crashed unexpectedly',
      error_details: (error as Error).message,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
