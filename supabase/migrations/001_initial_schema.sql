-- Migration: Initial schema for Traffic AI
-- Creates users, pixels, pixel_events, integrations tables

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'team', 'partner');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE pixel_status AS ENUM ('active', 'inactive', 'pending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE integration_type AS ENUM ('facebook', 'google', 'email', 'crm', 'webhook');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role user_role DEFAULT 'team',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create user_api_keys table
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  assigned_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_user_api_keys_updated_at
  BEFORE UPDATE ON public.user_api_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

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

CREATE INDEX IF NOT EXISTS idx_pixels_user_id ON public.pixels(user_id);
CREATE INDEX IF NOT EXISTS idx_pixels_pixel_code ON public.pixels(pixel_code);
CREATE INDEX IF NOT EXISTS idx_pixels_domain ON public.pixels(domain);

CREATE TRIGGER update_pixels_updated_at
  BEFORE UPDATE ON public.pixels
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Function to generate pixel code
CREATE OR REPLACE FUNCTION public.generate_pixel_code()
RETURNS TEXT AS $$
DECLARE
  chars TEXT := 'abcdefghijklmnopqrstuvwxyz0123456789';
  result TEXT := 'px_';
  i INTEGER;
BEGIN
  FOR i IN 1..20 LOOP
    result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
  END LOOP;
  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create pixel_events table
CREATE TABLE IF NOT EXISTS public.pixel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pixel_id UUID NOT NULL REFERENCES public.pixels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'pageview',
  visitor_id TEXT,
  page_url TEXT,
  referrer TEXT,
  user_agent TEXT,
  ip_address INET,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pixel_events_pixel_id ON public.pixel_events(pixel_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_visitor_id ON public.pixel_events(visitor_id);
CREATE INDEX IF NOT EXISTS idx_pixel_events_created_at ON public.pixel_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pixel_events_event_type ON public.pixel_events(event_type);

-- Create integrations table
CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type integration_type NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  config JSONB DEFAULT '{}',
  is_connected BOOLEAN DEFAULT false,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integrations_user_id ON public.integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_type ON public.integrations(type);

CREATE TRIGGER update_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pixel_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view own profile" ON public.users
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all users" ON public.users
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can update own profile" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- RLS Policies for pixels
CREATE POLICY "Users can view own pixels" ON public.pixels
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all pixels" ON public.pixels
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "Users can create pixels" ON public.pixels
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pixels" ON public.pixels
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own pixels" ON public.pixels
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for pixel_events (service role only for insert, users can view)
CREATE POLICY "Users can view own pixel events" ON public.pixel_events
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.pixels WHERE id = pixel_id AND user_id = auth.uid())
  );

CREATE POLICY "Service role can insert events" ON public.pixel_events
  FOR INSERT WITH CHECK (true);

-- RLS Policies for integrations
CREATE POLICY "Users can view own integrations" ON public.integrations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create integrations" ON public.integrations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own integrations" ON public.integrations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own integrations" ON public.integrations
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for user_api_keys
CREATE POLICY "Users can view own api keys" ON public.user_api_keys
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage api keys" ON public.user_api_keys
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- RLS Policies for audit_logs
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all audit logs" ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Grant permissions
GRANT ALL ON public.users TO authenticated;
GRANT ALL ON public.user_api_keys TO authenticated;
GRANT ALL ON public.pixels TO authenticated;
GRANT ALL ON public.pixel_events TO authenticated;
GRANT ALL ON public.integrations TO authenticated;
GRANT ALL ON public.audit_logs TO authenticated;

GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.user_api_keys TO service_role;
GRANT ALL ON public.pixels TO service_role;
GRANT ALL ON public.pixel_events TO service_role;
GRANT ALL ON public.integrations TO service_role;
GRANT ALL ON public.audit_logs TO service_role;

-- Create function to auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'team');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create user profile on auth signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON TABLE public.pixels IS 'Tracking pixels for website visitor identification';
COMMENT ON TABLE public.pixel_events IS 'Events captured by the tracking pixel';
COMMENT ON TABLE public.integrations IS 'Third-party integrations for data sync';
