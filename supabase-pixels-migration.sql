-- Traffic AI Admin Panel - Pixels & Integrations Migration
-- Run this in your Supabase SQL editor after the initial schema

-- Create pixel_status enum
CREATE TYPE pixel_status AS ENUM ('active', 'inactive', 'pending');

-- Create integration_type enum
CREATE TYPE integration_type AS ENUM ('facebook', 'google', 'email', 'crm', 'webhook');

-- Create pixels table
CREATE TABLE IF NOT EXISTS public.pixels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  pixel_code TEXT NOT NULL UNIQUE,
  status pixel_status DEFAULT 'pending',
  events_count INTEGER DEFAULT 0,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create integrations table
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type integration_type NOT NULL,
  name TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  is_connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, type)
);

-- Create pixel_events table (for tracking pixel activity)
CREATE TABLE IF NOT EXISTS public.pixel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pixel_id UUID NOT NULL REFERENCES public.pixels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'pageview',
  visitor_id TEXT,
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_address TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_pixels_user_id ON public.pixels(user_id);
CREATE INDEX IF NOT EXISTS idx_pixels_pixel_code ON public.pixels(pixel_code);
CREATE INDEX IF NOT EXISTS idx_pixels_status ON public.pixels(status);
CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON public.integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON public.integrations(type);
CREATE INDEX IF NOT EXISTS idx_pixel_events_pixel_id ON public.pixel_events(pixel_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_created_at ON public.pixel_events(created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixel_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pixels table
-- Users can view their own pixels
CREATE POLICY "Users can view own pixels"
  ON public.pixels FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own pixels
CREATE POLICY "Users can create own pixels"
  ON public.pixels FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pixels
CREATE POLICY "Users can update own pixels"
  ON public.pixels FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own pixels
CREATE POLICY "Users can delete own pixels"
  ON public.pixels FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can view all pixels
CREATE POLICY "Admins can view all pixels"
  ON public.pixels FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for integrations table
-- Users can view their own integrations
CREATE POLICY "Users can view own integrations"
  ON public.integrations FOR SELECT
  USING (auth.uid() = user_id);

-- Users can manage their own integrations
CREATE POLICY "Users can manage own integrations"
  ON public.integrations FOR ALL
  USING (auth.uid() = user_id);

-- Admins can view all integrations
CREATE POLICY "Admins can view all integrations"
  ON public.integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for pixel_events table
-- Users can view events for their own pixels
CREATE POLICY "Users can view own pixel events"
  ON public.pixel_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.pixels
      WHERE pixels.id = pixel_events.pixel_id
      AND pixels.user_id = auth.uid()
    )
  );

-- Allow anonymous inserts for pixel tracking (from websites)
CREATE POLICY "Allow anonymous pixel event inserts"
  ON public.pixel_events FOR INSERT
  WITH CHECK (true);

-- Create triggers for updated_at
CREATE TRIGGER update_pixels_updated_at
  BEFORE UPDATE ON public.pixels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to increment pixel events count
CREATE OR REPLACE FUNCTION public.increment_pixel_events()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.pixels
  SET events_count = events_count + 1,
      last_event_at = NOW(),
      status = CASE WHEN status = 'pending' THEN 'active'::pixel_status ELSE status END
  WHERE id = NEW.pixel_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-increment pixel events count
CREATE TRIGGER on_pixel_event_created
  AFTER INSERT ON public.pixel_events
  FOR EACH ROW EXECUTE FUNCTION public.increment_pixel_events();

-- Function to generate unique pixel code
CREATE OR REPLACE FUNCTION public.generate_pixel_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
BEGIN
  new_code := 'px_' || encode(gen_random_bytes(8), 'hex');
  RETURN new_code;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT ALL ON public.pixels TO anon, authenticated;
GRANT ALL ON public.integrations TO anon, authenticated;
GRANT ALL ON public.pixel_events TO anon, authenticated;
