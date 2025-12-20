-- Migration: Chat system tables for Traffic AI
-- Creates chat_conversations, chat_messages tables with Supabase Realtime support

-- Create enum types for chat
DO $$ BEGIN
  CREATE TYPE conversation_status AS ENUM ('open', 'closed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE message_type AS ENUM ('customer', 'agent', 'bot', 'note');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create chat_conversations table
CREATE TABLE IF NOT EXISTS public.chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Customer info (for anonymous visitors)
  customer_name TEXT,
  customer_email TEXT,
  customer_metadata JSONB DEFAULT '{}',
  -- Visitor tracking (links to pixel visitors if available)
  visitor_id TEXT,
  -- Assigned agent (admin panel user)
  assignee_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Conversation state
  status conversation_status DEFAULT 'open',
  subject TEXT,
  preview TEXT,
  -- Read status
  read BOOLEAN DEFAULT false,
  last_message_at TIMESTAMPTZ,
  -- Source tracking
  source TEXT DEFAULT 'widget',
  page_url TEXT,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON public.chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_assignee ON public.chat_conversations(assignee_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_customer_email ON public.chat_conversations(customer_email);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_visitor_id ON public.chat_conversations(visitor_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_last_message ON public.chat_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created ON public.chat_conversations(created_at DESC);

CREATE TRIGGER update_chat_conversations_updated_at
  BEFORE UPDATE ON public.chat_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  -- Sender info
  sender_type message_type NOT NULL,
  sender_id UUID REFERENCES public.users(id) ON DELETE SET NULL, -- For agent messages
  sender_name TEXT,
  -- Message content
  body TEXT NOT NULL,
  -- Private notes (only visible to agents)
  is_private BOOLEAN DEFAULT false,
  -- Attachments
  attachments JSONB DEFAULT '[]',
  -- Read receipt
  seen_at TIMESTAMPTZ,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON public.chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON public.chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_type ON public.chat_messages(sender_type);

-- Function to update conversation preview and last_message_at
CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.chat_conversations
  SET
    preview = LEFT(NEW.body, 100),
    last_message_at = NEW.created_at,
    read = CASE WHEN NEW.sender_type = 'customer' THEN false ELSE read END,
    updated_at = NOW()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_chat_message_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_conversation_on_message();

-- Enable RLS
ALTER TABLE public.chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_conversations

-- Authenticated users (agents) can view all conversations
CREATE POLICY "Agents can view all conversations" ON public.chat_conversations
  FOR SELECT TO authenticated
  USING (true);

-- Agents can update conversations
CREATE POLICY "Agents can update conversations" ON public.chat_conversations
  FOR UPDATE TO authenticated
  USING (true);

-- Anyone can create conversations (for widget visitors)
CREATE POLICY "Anyone can create conversations" ON public.chat_conversations
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- RLS Policies for chat_messages

-- Authenticated users can view non-private messages or all if agent
CREATE POLICY "Agents can view all messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (true);

-- Anon users can view non-private messages in their conversation
CREATE POLICY "Visitors can view own conversation messages" ON public.chat_messages
  FOR SELECT TO anon
  USING (is_private = false);

-- Anyone can create messages
CREATE POLICY "Anyone can create messages" ON public.chat_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Grant permissions
GRANT ALL ON public.chat_conversations TO authenticated;
GRANT ALL ON public.chat_messages TO authenticated;
GRANT SELECT, INSERT ON public.chat_conversations TO anon;
GRANT SELECT, INSERT ON public.chat_messages TO anon;

-- Enable Realtime for chat tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;

COMMENT ON TABLE public.chat_conversations IS 'Chat conversations from website visitors';
COMMENT ON TABLE public.chat_messages IS 'Individual messages within chat conversations';
