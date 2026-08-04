-- Migration: Chat email notifications
-- Date: 2026-07-30
-- Purpose: Queue table + settings for emailing chat participants.
--   * A customer message  -> email admins/agents (link to /chat/<id>)
--   * An agent reply      -> email the customer (reply text + link back to the widget)
-- Rows are written by src/lib/chat-notifications.ts and drained by
-- /api/cron/send-chat-notifications (runs every minute). The delay between
-- enqueue (scheduled_at) and send lets a burst of messages in one conversation
-- collapse into a single email, and lets already-answered/already-read
-- notifications be skipped before they go out.

CREATE TABLE IF NOT EXISTS public.chat_email_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What the notification is about
  conversation_id UUID NOT NULL REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
  trigger_message_id UUID REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  -- Cron collects every message at/after this timestamp to build the email body
  after_message_at TIMESTAMPTZ NOT NULL,
  -- Who receives it
  recipient_email TEXT NOT NULL,
  recipient_type TEXT NOT NULL CHECK (recipient_type IN ('customer', 'admin')),
  recipient_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  -- Delivery state machine: pending -> sending -> sent | failed | skipped
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  -- Debounce window: cron ignores rows until scheduled_at has passed
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cron's main queue scan
CREATE INDEX IF NOT EXISTS idx_chat_email_notif_status_scheduled
  ON public.chat_email_notifications(status, scheduled_at);
-- Dedupe lookups when enqueueing (pending row already exists? recently sent?)
CREATE INDEX IF NOT EXISTS idx_chat_email_notif_conv_recipient
  ON public.chat_email_notifications(conversation_id, recipient_email, status);
-- Stale-claim recovery scan
CREATE INDEX IF NOT EXISTS idx_chat_email_notif_claimed
  ON public.chat_email_notifications(status, claimed_at);

DROP TRIGGER IF EXISTS update_chat_email_notifications_updated_at ON public.chat_email_notifications;
CREATE TRIGGER update_chat_email_notifications_updated_at
  BEFORE UPDATE ON public.chat_email_notifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS: service role does all the work; admins may read for debugging. No anon access.
ALTER TABLE public.chat_email_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages chat email notifications" ON public.chat_email_notifications;
CREATE POLICY "Service role manages chat email notifications" ON public.chat_email_notifications
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can read chat email notifications" ON public.chat_email_notifications;
CREATE POLICY "Admins can read chat email notifications" ON public.chat_email_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

GRANT SELECT ON public.chat_email_notifications TO authenticated;

COMMENT ON TABLE public.chat_email_notifications IS 'Outbound email queue for chat notifications, drained by /api/cron/send-chat-notifications';
COMMENT ON COLUMN public.chat_email_notifications.after_message_at IS 'Cron builds the email body from conversation messages at/after this timestamp';
COMMENT ON COLUMN public.chat_email_notifications.scheduled_at IS 'Debounce deadline — cron will not send before this time';

-- Settings (admin-editable in Settings > Chat Email Notifications).
-- Shipped disabled so nothing goes out until SMTP is verified with a test email.
INSERT INTO public.app_settings (key, value, description, category, is_secret) VALUES
  ('chat_email_notifications_enabled', 'false', 'Master switch for chat email notifications', 'notifications', FALSE),
  ('chat_notify_admins_on_customer_message', 'true', 'Email admins/agents when a customer sends a chat message', 'notifications', FALSE),
  ('chat_notify_customer_on_agent_reply', 'true', 'Email the customer when an agent replies in chat', 'notifications', FALSE),
  ('chat_notification_cc_emails', '', 'Comma-separated addresses CC''d on both the admin notification and the customer reply email', 'notifications', FALSE),
  ('chat_notification_debounce_minutes', '2', 'Minutes to wait before sending, so a burst of messages becomes one email', 'notifications', FALSE),
  ('chat_notification_admin_cooldown_minutes', '15', 'Minimum minutes between admin emails for the same conversation', 'notifications', FALSE),
  ('smtp_host', 'smtp.gmail.com', 'SMTP host used for outbound notification email', 'notifications', FALSE),
  ('smtp_port', '465', 'SMTP port (465 = implicit TLS, 587 = STARTTLS)', 'notifications', FALSE),
  ('smtp_user', '', 'SMTP username / from address (e.g. orchid@trafficai.io)', 'notifications', FALSE),
  ('smtp_password', '', 'SMTP password — for Gmail this is a Google app password', 'notifications', TRUE),
  ('smtp_from_name', 'Traffic AI Support', 'Display name on outbound notification email', 'notifications', FALSE),
  ('smtp_reply_to', '', 'Reply-To address for outbound notification email (defaults to smtp_user)', 'notifications', FALSE)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- DROP TABLE IF EXISTS public.chat_email_notifications CASCADE;
-- DELETE FROM public.app_settings WHERE key IN (
--   'chat_email_notifications_enabled',
--   'chat_notify_admins_on_customer_message',
--   'chat_notify_customer_on_agent_reply',
--   'chat_notification_cc_emails',
--   'chat_notification_debounce_minutes',
--   'chat_notification_admin_cooldown_minutes',
--   'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password',
--   'smtp_from_name', 'smtp_reply_to'
-- );
