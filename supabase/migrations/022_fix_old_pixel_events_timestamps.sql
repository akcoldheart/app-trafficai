-- Fix pixel_events with old timestamps from webhook
-- Update events that have created_at older than 30 days to use current timestamp
-- This ensures they appear in the dashboard charts

-- Update pixel_events where the created_at is more than 30 days old
-- These are likely events that came from webhooks with old activity dates
UPDATE pixel_events
SET created_at = NOW()
WHERE created_at < NOW() - INTERVAL '30 days';

-- Also update events that have future timestamps (data error)
UPDATE pixel_events
SET created_at = NOW()
WHERE created_at > NOW();
