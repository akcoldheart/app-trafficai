-- Cleanup: Delete approved pixel_requests where pixel_id is NULL
-- These are orphaned records where the associated pixel was deleted

DELETE FROM public.pixel_requests
WHERE status = 'approved'
  AND pixel_id IS NULL;
