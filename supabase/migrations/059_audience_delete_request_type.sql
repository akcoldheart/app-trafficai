-- Migration: 059_audience_delete_request_type
-- Description: Allow 'delete' as a request_type for audience deletion requests
-- Date: 2026-03-27

-- Drop and recreate the check constraint to include 'delete'
ALTER TABLE audience_requests
  DROP CONSTRAINT IF EXISTS audience_requests_request_type_check;

ALTER TABLE audience_requests
  ADD CONSTRAINT audience_requests_request_type_check
  CHECK (request_type IN ('standard', 'custom', 'delete'));
