-- Add data_points column to pixel_requests for tracking requested data categories
ALTER TABLE pixel_requests
  ADD COLUMN IF NOT EXISTS data_points TEXT[] DEFAULT '{}';
