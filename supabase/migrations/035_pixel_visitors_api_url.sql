-- Add visitors API URL fields to pixels table
ALTER TABLE pixels
  ADD COLUMN IF NOT EXISTS visitors_api_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS visitors_api_last_fetched_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS visitors_api_last_fetch_status TEXT DEFAULT NULL;
