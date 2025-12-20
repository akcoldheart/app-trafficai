-- Migration: Chat Auto-Reply Q&A pairs for Traffic AI
-- Creates chat_auto_replies table for FAQ-based automated responses
-- Also fixes RLS policy for chat_conversations (anon users couldn't SELECT their own conversations)

-- Fix: Allow anonymous users to select their own conversations
-- This was missing from the original migration, causing chat widget to get stuck on loading
CREATE POLICY "Anon can view own conversations" ON public.chat_conversations
  FOR SELECT TO anon
  USING (true);

-- Create chat_auto_replies table
CREATE TABLE IF NOT EXISTS public.chat_auto_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Question/trigger text
  question TEXT NOT NULL,
  -- The auto-reply response
  answer TEXT NOT NULL,
  -- Keywords for matching (array of strings)
  keywords TEXT[] DEFAULT '{}',
  -- Enable/disable this reply
  is_active BOOLEAN DEFAULT true,
  -- Higher priority = checked first (descending order)
  priority INTEGER DEFAULT 0,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for active replies lookup
CREATE INDEX IF NOT EXISTS idx_chat_auto_replies_active ON public.chat_auto_replies(is_active, priority DESC);

-- Create trigger for updated_at
CREATE TRIGGER update_chat_auto_replies_updated_at
  BEFORE UPDATE ON public.chat_auto_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Enable RLS
ALTER TABLE public.chat_auto_replies ENABLE ROW LEVEL SECURITY;

-- RLS Policies - only authenticated users (admins) can manage auto-replies
CREATE POLICY "Authenticated users can view auto-replies" ON public.chat_auto_replies
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create auto-replies" ON public.chat_auto_replies
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update auto-replies" ON public.chat_auto_replies
  FOR UPDATE TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete auto-replies" ON public.chat_auto_replies
  FOR DELETE TO authenticated
  USING (true);

-- Anon users can read active auto-replies (for matching)
CREATE POLICY "Anon can read active auto-replies" ON public.chat_auto_replies
  FOR SELECT TO anon
  USING (is_active = true);

-- Grant permissions
GRANT ALL ON public.chat_auto_replies TO authenticated;
GRANT SELECT ON public.chat_auto_replies TO anon;

-- Create chat_settings table for default messages
CREATE TABLE IF NOT EXISTS public.chat_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS for settings
ALTER TABLE public.chat_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage chat_settings" ON public.chat_settings
  FOR ALL TO authenticated
  USING (true);

CREATE POLICY "Anon can read chat_settings" ON public.chat_settings
  FOR SELECT TO anon
  USING (true);

GRANT ALL ON public.chat_settings TO authenticated;
GRANT SELECT ON public.chat_settings TO anon;

-- Insert default settings
INSERT INTO public.chat_settings (key, value) VALUES
  ('default_greeting', 'Hi there! How can we help you today?'),
  ('default_acknowledgment', 'Thanks for reaching out! Our team will get back to you shortly.'),
  ('bot_name', 'Traffic AI'),
  ('auto_reply_enabled', 'true')
ON CONFLICT (key) DO NOTHING;

COMMENT ON TABLE public.chat_auto_replies IS 'FAQ-based auto-reply Q&A pairs for chat bot';
COMMENT ON TABLE public.chat_settings IS 'Chat system configuration settings';
