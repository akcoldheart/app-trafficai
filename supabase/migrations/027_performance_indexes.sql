-- Migration: Add performance indexes for common query patterns
-- These indexes improve dashboard, visitor list, and event query performance

-- Composite index for pixel_events: speeds up "events for a pixel sorted by time"
-- Used by dashboard stats, event listings, and analytics queries
CREATE INDEX IF NOT EXISTS idx_pixel_events_pixel_created
  ON public.pixel_events(pixel_id, created_at DESC);

-- Composite index for visitors by user + identification status
-- Speeds up filtered visitor lists (e.g. "show me only identified visitors")
CREATE INDEX IF NOT EXISTS idx_visitors_user_identified
  ON public.visitors(user_id, is_identified);

-- Index on visitors.created_at for sorting by signup/creation date
CREATE INDEX IF NOT EXISTS idx_visitors_created_at
  ON public.visitors(created_at DESC);

-- Composite index for visitors by user + lead score
-- Speeds up "top leads" queries on the dashboard
CREATE INDEX IF NOT EXISTS idx_visitors_user_lead_score
  ON public.visitors(user_id, lead_score DESC);

-- Composite index for pixel_events by pixel + event_type + created_at
-- Speeds up "event type breakdown" dashboard queries
CREATE INDEX IF NOT EXISTS idx_pixel_events_pixel_type_created
  ON public.pixel_events(pixel_id, event_type, created_at DESC);

-- Index on visitors full_name for search (trigram would be better but requires extension)
-- Partial index: only index rows that have a full_name value
CREATE INDEX IF NOT EXISTS idx_visitors_full_name
  ON public.visitors(full_name) WHERE full_name IS NOT NULL;

-- Index on visitors company for search/filtering
CREATE INDEX IF NOT EXISTS idx_visitors_company
  ON public.visitors(company) WHERE company IS NOT NULL;

-- Comments
COMMENT ON INDEX public.idx_pixel_events_pixel_created IS 'Speeds up event queries filtered by pixel and sorted by time';
COMMENT ON INDEX public.idx_visitors_user_identified IS 'Speeds up visitor list filtered by identification status';
COMMENT ON INDEX public.idx_visitors_created_at IS 'Speeds up visitor list sorted by creation date';
COMMENT ON INDEX public.idx_visitors_user_lead_score IS 'Speeds up top leads dashboard query';
COMMENT ON INDEX public.idx_pixel_events_pixel_type_created IS 'Speeds up event type breakdown queries';
COMMENT ON INDEX public.idx_visitors_full_name IS 'Speeds up visitor name search';
COMMENT ON INDEX public.idx_visitors_company IS 'Speeds up visitor company search/filter';
