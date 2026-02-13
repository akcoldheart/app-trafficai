-- Add data_points column to audience_requests for tracking requested data categories
ALTER TABLE audience_requests
  ADD COLUMN IF NOT EXISTS data_points TEXT[] DEFAULT '{}';
