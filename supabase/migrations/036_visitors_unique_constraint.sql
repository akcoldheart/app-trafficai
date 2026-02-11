-- Add unique constraint on (visitor_id, pixel_id) for batch upsert support
CREATE UNIQUE INDEX IF NOT EXISTS visitors_visitor_id_pixel_id_unique
  ON visitors (visitor_id, pixel_id);
