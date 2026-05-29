-- Migration 069: Audience import jobs (resumable, server-driven imports)
-- Date: 2026-05-29
-- Purpose:
--   Replace the browser-driven, single-request audience (re)import loop with a
--   resumable server-side job processed by a cron worker. Fixes the silent
--   mid-run failure on large audiences (e.g. "Children & Infant Nutrition",
--   ~230k contacts / 4600 pages) where the tab/loop dying left no process to
--   continue and no log was written.
--
--   Key properties this enables:
--     1. Resumability  — `next_page` cursor; the cron resumes where it stopped.
--     2. Clear-on-success — contacts are imported into a staging audience_id,
--        then atomically swapped over the live id (no empty-audience window).
--     3. Safe concurrency — claim_next_audience_import_job() uses
--        FOR UPDATE SKIP LOCKED so overlapping cron runs never double-process.

-- ---------------------------------------------------------------------------
-- Job table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audience_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audience_id          TEXT NOT NULL,                 -- live audience id (manual_<uuid>)
  staging_audience_id  TEXT NOT NULL,                 -- temp id rows are imported into
  request_id           UUID,                          -- audience_requests.id (for progress notes)
  source_url           TEXT NOT NULL,
  audience_name        TEXT,
  user_id              UUID,                           -- audience owner (for logging / API key)
  mode                 TEXT NOT NULL DEFAULT 'reimport', -- reimport | import
  status               TEXT NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  total_pages          INTEGER NOT NULL DEFAULT 1,
  next_page            INTEGER NOT NULL DEFAULT 1,        -- cursor: first page not yet committed
  pages_done           INTEGER NOT NULL DEFAULT 0,
  contacts_imported    INTEGER NOT NULL DEFAULT 0,
  failed_pages         JSONB   NOT NULL DEFAULT '[]'::jsonb, -- [{page, reason}]
  attempts             INTEGER NOT NULL DEFAULT 0,         -- times a worker has claimed it
  last_error           TEXT,
  heartbeat_at         TIMESTAMPTZ,                        -- updated each chunk; staleness detector
  started_at           TIMESTAMPTZ,
  finished_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audience_import_jobs_status
  ON public.audience_import_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_audience_import_jobs_audience
  ON public.audience_import_jobs(audience_id);

-- Keep updated_at fresh (re-uses the shared trigger fn from 001_initial_schema)
DROP TRIGGER IF EXISTS update_audience_import_jobs_updated_at ON public.audience_import_jobs;
CREATE TRIGGER update_audience_import_jobs_updated_at
  BEFORE UPDATE ON public.audience_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — only the service role touches this table (all access is via admin
-- endpoints using the service-role client). Default-deny for everyone else.
-- ---------------------------------------------------------------------------
ALTER TABLE public.audience_import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.audience_import_jobs;
CREATE POLICY "Service role full access"
  ON public.audience_import_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- claim_next_audience_import_job(stale_before)
--   Atomically claims the oldest runnable job: a pending job, or a running job
--   whose heartbeat is older than `p_stale_before` (i.e. the previous worker
--   crashed). FOR UPDATE SKIP LOCKED guarantees two concurrent cron runs never
--   grab the same row. Marks it running, bumps attempts, sets heartbeat.
--   Returns the claimed row, or no rows if nothing is runnable.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_next_audience_import_job(p_stale_before TIMESTAMPTZ)
RETURNS SETOF public.audience_import_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_row public.audience_import_jobs;
BEGIN
  SELECT id INTO v_id
  FROM public.audience_import_jobs
  WHERE status = 'pending'
     OR (status = 'running' AND (heartbeat_at IS NULL OR heartbeat_at < p_stale_before))
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.audience_import_jobs
  SET status       = 'running',
      heartbeat_at = NOW(),
      started_at   = COALESCE(started_at, NOW()),
      attempts     = attempts + 1,
      updated_at   = NOW()
  WHERE id = v_id
  RETURNING * INTO v_row;

  RETURN NEXT v_row;
END;
$$;

-- ---------------------------------------------------------------------------
-- swap_audience_import_staging(real_id, staging_id)
--   Atomic clear-on-success: deletes the live audience's existing contacts and
--   promotes the freshly-imported staging rows onto the live id in a single
--   transaction. Strips the internal `_p` page marker from `data`.
--   Returns the number of promoted rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.swap_audience_import_staging(p_real_id TEXT, p_staging_id TEXT)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.audience_contacts WHERE audience_id = p_real_id;

  UPDATE public.audience_contacts
  SET audience_id = p_real_id,
      data        = data - '_p'
  WHERE audience_id = p_staging_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_audience_import_job(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.swap_audience_import_staging(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_next_audience_import_job(TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.swap_audience_import_staging(TEXT, TEXT) TO service_role;

-- ===========================================================================
-- ROLLBACK (manual)
-- ===========================================================================
-- DROP FUNCTION IF EXISTS public.swap_audience_import_staging(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.claim_next_audience_import_job(TIMESTAMPTZ);
-- DROP TABLE IF EXISTS public.audience_import_jobs;
