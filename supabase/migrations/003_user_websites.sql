-- Migration: Add company_website to users and create user_websites table
-- Allows users to have a primary company website and manage multiple websites

-- Add company_website column to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS company_website TEXT;

-- Create user_websites table for managing multiple websites
CREATE TABLE IF NOT EXISTS public.user_websites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  name TEXT,
  is_primary BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_websites_user_id ON public.user_websites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_websites_url ON public.user_websites(url);
CREATE INDEX IF NOT EXISTS idx_user_websites_is_primary ON public.user_websites(user_id, is_primary) WHERE is_primary = true;

-- Add trigger for updated_at
CREATE TRIGGER update_user_websites_updated_at
  BEFORE UPDATE ON public.user_websites
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.user_websites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_websites
CREATE POLICY "Users can view own websites" ON public.user_websites
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create websites" ON public.user_websites
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own websites" ON public.user_websites
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own websites" ON public.user_websites
  FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all websites" ON public.user_websites
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin')
  );

-- Grant permissions
GRANT ALL ON public.user_websites TO authenticated;
GRANT ALL ON public.user_websites TO service_role;

-- Function to ensure only one primary website per user
CREATE OR REPLACE FUNCTION public.ensure_single_primary_website()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_primary = true THEN
    UPDATE public.user_websites
    SET is_primary = false
    WHERE user_id = NEW.user_id AND id != NEW.id AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ensure_single_primary_website_trigger
  BEFORE INSERT OR UPDATE ON public.user_websites
  FOR EACH ROW EXECUTE FUNCTION public.ensure_single_primary_website();

-- Update handle_new_user function to copy company_website from auth metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  company_website_val TEXT;
BEGIN
  -- Get company_website from user metadata
  company_website_val := NEW.raw_user_meta_data->>'company_website';

  INSERT INTO public.users (id, email, role, company_website)
  VALUES (NEW.id, NEW.email, 'team', company_website_val);

  -- If company website was provided, also add it to user_websites
  IF company_website_val IS NOT NULL AND company_website_val != '' THEN
    INSERT INTO public.user_websites (user_id, url, name, is_primary)
    VALUES (NEW.id, company_website_val, 'Primary Website', true);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON TABLE public.user_websites IS 'User websites for tracking and management';
COMMENT ON COLUMN public.users.company_website IS 'Primary company website URL from signup';
