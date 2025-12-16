-- Migration: Create visitors table for lead tracking
-- This table stores identified and enriched visitor data from the pixel

-- Create visitors table
CREATE TABLE IF NOT EXISTS public.visitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pixel_id UUID NOT NULL REFERENCES public.pixels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL, -- Client-side generated ID

  -- Fingerprint
  fingerprint_hash TEXT,

  -- Identity info (from enrichment or self-identification)
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  company TEXT,
  job_title TEXT,
  linkedin_url TEXT,

  -- Location
  city TEXT,
  state TEXT,
  country TEXT,

  -- Technical info
  ip_address INET,
  user_agent TEXT,

  -- Timestamps
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),

  -- First touch attribution
  first_page_url TEXT,
  first_referrer TEXT,

  -- Engagement metrics
  total_pageviews INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 1,
  total_time_on_site INTEGER DEFAULT 0, -- in seconds
  max_scroll_depth INTEGER DEFAULT 0,   -- percentage 0-100
  total_clicks INTEGER DEFAULT 0,
  form_submissions INTEGER DEFAULT 0,

  -- Lead scoring
  lead_score INTEGER DEFAULT 0, -- 0-100

  -- Identification status
  is_identified BOOLEAN DEFAULT FALSE,
  identified_at TIMESTAMPTZ,

  -- Enrichment status
  is_enriched BOOLEAN DEFAULT FALSE,
  enriched_at TIMESTAMPTZ,
  enrichment_source TEXT, -- 'traffic_ai', 'clearbit', etc.
  enrichment_data JSONB, -- Full enrichment response

  -- Metadata
  metadata JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one visitor record per pixel + visitor_id
  UNIQUE(pixel_id, visitor_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_visitors_pixel_id ON public.visitors(pixel_id);
CREATE INDEX IF NOT EXISTS idx_visitors_user_id ON public.visitors(user_id);
CREATE INDEX IF NOT EXISTS idx_visitors_visitor_id ON public.visitors(visitor_id);
CREATE INDEX IF NOT EXISTS idx_visitors_email ON public.visitors(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_visitors_lead_score ON public.visitors(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON public.visitors(last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_is_identified ON public.visitors(is_identified) WHERE is_identified = TRUE;
CREATE INDEX IF NOT EXISTS idx_visitors_is_enriched ON public.visitors(is_enriched) WHERE is_enriched = TRUE;
CREATE INDEX IF NOT EXISTS idx_visitors_fingerprint ON public.visitors(fingerprint_hash);

-- Function to increment pixel events count
CREATE OR REPLACE FUNCTION public.increment_pixel_events(pixel_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.pixels
  SET
    events_count = events_count + 1,
    last_event_at = NOW(),
    updated_at = NOW()
  WHERE id = pixel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update updated_at on visitors
CREATE TRIGGER update_visitors_updated_at
  BEFORE UPDATE ON public.visitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS Policies for visitors table
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;

-- Users can view their own visitors
CREATE POLICY "Users can view own visitors"
  ON public.visitors FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all visitors
CREATE POLICY "Admins can view all visitors"
  ON public.visitors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role can insert (for pixel tracking)
CREATE POLICY "Service role can insert visitors"
  ON public.visitors FOR INSERT
  WITH CHECK (true);

-- Service role can update (for enrichment)
CREATE POLICY "Service role can update visitors"
  ON public.visitors FOR UPDATE
  USING (true);

-- Users can delete their own visitors
CREATE POLICY "Users can delete own visitors"
  ON public.visitors FOR DELETE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT ALL ON public.visitors TO authenticated;
GRANT ALL ON public.visitors TO service_role;

-- Add indexes to pixel_events for better query performance
CREATE INDEX IF NOT EXISTS idx_pixel_events_pixel_id ON public.pixel_events(pixel_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_visitor_id ON public.pixel_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_created_at ON public.pixel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pixel_events_event_type ON public.pixel_events(event_type);

COMMENT ON TABLE public.visitors IS 'Stores identified and enriched visitor data from pixel tracking';
COMMENT ON COLUMN public.visitors.lead_score IS 'Engagement score 0-100 based on behavior';
COMMENT ON COLUMN public.visitors.visitor_id IS 'Client-side generated unique visitor ID';
COMMENT ON COLUMN public.visitors.fingerprint_hash IS 'Hash of browser fingerprint for cross-session tracking';
