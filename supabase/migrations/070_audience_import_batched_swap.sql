-- Migration 070: Batched, resumable audience-import swap
-- Date: 2026-05-29
-- Purpose:
--   The single-transaction swap_audience_import_staging() (migration 069) does a
--   DELETE + UPDATE over the entire audience in one statement. On a large audience
--   (~230k rows, e.g. "Children & Infant Nutrition") that exceeds Postgres
--   statement_timeout → "canceling statement due to statement timeout", the swap
--   rolls back, and the freshly-imported data never reaches the live audience.
--
--   Fix: do the swap in small batches (≤10k rows per statement) driven by the cron
--   worker, tracked by a `swap_phase` cursor so it is resumable and never depends on
--   the statement_timeout being large. Phases (promote-first → no empty-audience window):
--     1 = promote: staging rows → live id (keep the _p page marker)
--     2 = delete:  remove the OLD live rows (those WITHOUT a _p marker)
--     3 = strip:   remove the _p marker from the promoted rows (clean steady state)
--   The explicit phase cursor disambiguates phase 2 (delete no-_p) from phase 3
--   (strip _p), so a crash mid-swap resumes safely.

-- Cursor for the swap state machine (0 = not started / still fetching).
ALTER TABLE public.audience_import_jobs
  ADD COLUMN IF NOT EXISTS swap_phase SMALLINT NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- Phase 1: promote up to p_limit staging rows onto the live audience id.
-- Returns the number of rows promoted (caller loops until < p_limit).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_staging_batch(p_real TEXT, p_staging TEXT, p_limit INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.audience_contacts
  SET audience_id = p_real
  WHERE id IN (
    SELECT id FROM public.audience_contacts
    WHERE audience_id = p_staging
    LIMIT p_limit
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Phase 2: delete up to p_limit OLD live rows (those without a _p marker).
-- Promoted rows carry _p, so they are never deleted here.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_old_real_batch(p_real TEXT, p_limit INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.audience_contacts
  WHERE id IN (
    SELECT id FROM public.audience_contacts
    WHERE audience_id = p_real AND NOT (data ? '_p')
    LIMIT p_limit
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Phase 3: strip the _p marker from up to p_limit promoted rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.strip_import_marker_batch(p_real TEXT, p_limit INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.audience_contacts
  SET data = data - '_p'
  WHERE id IN (
    SELECT id FROM public.audience_contacts
    WHERE audience_id = p_real AND (data ? '_p')
    LIMIT p_limit
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- Generic batched delete (used to clean up staging rows on terminal failure
-- without tripping statement_timeout on a large staging set).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_audience_contacts_batch(p_audience_id TEXT, p_limit INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.audience_contacts
  WHERE id IN (
    SELECT id FROM public.audience_contacts
    WHERE audience_id = p_audience_id
    LIMIT p_limit
  );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_staging_batch(TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_old_real_batch(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.strip_import_marker_batch(TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_audience_contacts_batch(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_staging_batch(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_old_real_batch(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.strip_import_marker_batch(TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_audience_contacts_batch(TEXT, INTEGER) TO service_role;

-- ===========================================================================
-- ROLLBACK (manual)
-- ===========================================================================
-- DROP FUNCTION IF EXISTS public.delete_audience_contacts_batch(TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS public.strip_import_marker_batch(TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS public.delete_old_real_batch(TEXT, INTEGER);
-- DROP FUNCTION IF EXISTS public.promote_staging_batch(TEXT, TEXT, INTEGER);
-- ALTER TABLE public.audience_import_jobs DROP COLUMN IF EXISTS swap_phase;
