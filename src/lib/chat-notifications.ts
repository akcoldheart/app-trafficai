import { createClient } from '@supabase/supabase-js';
import { getAllSettings } from '@/lib/settings';
import { escapeHtml, getSmtpConfig } from '@/lib/mailer';
import { logEvent } from '@/lib/webhook-logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface ChatMessageRow {
  id: string;
  conversation_id: string;
  sender_type: 'customer' | 'agent' | 'bot' | 'note';
  sender_name: string | null;
  body: string;
  is_private: boolean | null;
  created_at: string;
}

export interface ChatConversationRow {
  id: string;
  customer_name: string | null;
  customer_email: string | null;
  assignee_id: string | null;
  subject: string | null;
  page_url: string | null;
}

export interface ChatNotificationSettings {
  enabled: boolean;
  notifyAdmins: boolean;
  notifyCustomer: boolean;
  /** CC'd on both the admin notification and the customer reply email. */
  ccEmails: string[];
  debounceMinutes: number;
  adminCooldownMinutes: number;
}

export async function getChatNotificationSettings(): Promise<ChatNotificationSettings> {
  const settings = await getAllSettings();

  return {
    enabled: settings.chat_email_notifications_enabled === 'true',
    // Direction toggles default ON — only the master switch ships off.
    notifyAdmins: settings.chat_notify_admins_on_customer_message !== 'false',
    notifyCustomer: settings.chat_notify_customer_on_agent_reply !== 'false',
    ccEmails: (settings.chat_notification_cc_emails || '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
    debounceMinutes: Math.max(0, parseInt(settings.chat_notification_debounce_minutes || '2', 10) || 0),
    adminCooldownMinutes: Math.max(0, parseInt(settings.chat_notification_admin_cooldown_minutes || '15', 10) || 0),
  };
}

/**
 * Resolve who is addressed (To:) on a new-customer-message notification: every
 * admin plus the assigned agent. The configured CC list is NOT included here —
 * those addresses ride along as a CC header at send time, so they get one copy
 * of one email rather than a copy per admin.
 *
 * `ccFallback` is only used when there is no admin at all, so a configured CC
 * address still receives the notification instead of it silently vanishing.
 */
async function resolveAdminRecipients(
  conversation: ChatConversationRow,
  ccFallback: string[]
): Promise<{ email: string; userId: string | null }[]> {
  const recipients = new Map<string, string | null>();

  // Admin status can come from role_id (database-driven RBAC, preferred) or the
  // legacy users.role string — match checkIsAdmin() and accept either.
  const { data: adminRoles } = await supabaseAdmin
    .from('roles')
    .select('id')
    .eq('name', 'admin');

  const adminRoleIds = (adminRoles || []).map((role: { id: string }) => role.id);

  let query = supabaseAdmin.from('users').select('id, email');
  query = adminRoleIds.length > 0
    ? query.or(`role.eq.admin,role_id.in.(${adminRoleIds.join(',')})`)
    : query.eq('role', 'admin');

  const { data: admins } = await query;

  (admins || []).forEach((admin: { id: string; email: string | null }) => {
    if (admin.email) recipients.set(admin.email.toLowerCase(), admin.id);
  });

  // No admins configured at all — address the CC list directly so the
  // notification still reaches someone.
  if (recipients.size === 0) {
    ccFallback.forEach((email) => recipients.set(email, null));
  }

  // The assigned agent always hears about their own conversation, even if they
  // are not an admin.
  if (conversation.assignee_id) {
    const { data: assignee } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('id', conversation.assignee_id)
      .maybeSingle();

    if (assignee?.email) recipients.set(assignee.email.toLowerCase(), assignee.id);
  }

  return Array.from(recipients.entries()).map(([email, userId]) => ({ email, userId }));
}

/**
 * Queue email notifications for a freshly inserted chat message.
 *
 * Called from the message-send paths. Never throws and never blocks the send:
 * the actual delivery happens in /api/cron/send-chat-notifications.
 */
export async function enqueueChatNotifications(message: ChatMessageRow): Promise<void> {
  try {
    // Bot greetings and auto-replies must not email anyone, and private agent
    // notes are internal-only.
    if (message.sender_type !== 'customer' && message.sender_type !== 'agent') return;
    if (message.is_private) return;

    const settings = await getChatNotificationSettings();
    if (!settings.enabled) return;

    const isFromCustomer = message.sender_type === 'customer';
    if (isFromCustomer && !settings.notifyAdmins) return;
    if (!isFromCustomer && !settings.notifyCustomer) return;

    const { data: conversation } = await supabaseAdmin
      .from('chat_conversations')
      .select('id, customer_name, customer_email, assignee_id, subject, page_url')
      .eq('id', message.conversation_id)
      .maybeSingle();

    if (!conversation) return;

    const conv = conversation as ChatConversationRow;

    // Candidate recipients for this direction
    let candidates: { email: string; userId: string | null; type: 'admin' | 'customer' }[];

    if (isFromCustomer) {
      const admins = await resolveAdminRecipients(conv, settings.ccEmails);
      candidates = admins.map((a) => ({ ...a, type: 'admin' as const }));
    } else {
      if (!conv.customer_email) return;
      candidates = [{ email: conv.customer_email.toLowerCase(), userId: null, type: 'customer' as const }];
    }

    if (candidates.length === 0) return;

    // Burst collapse: a recipient with a pending row for this conversation will
    // already be told about this message when that row is sent.
    const { data: pendingRows } = await supabaseAdmin
      .from('chat_email_notifications')
      .select('recipient_email')
      .eq('conversation_id', conv.id)
      .eq('status', 'pending');

    const alreadyQueued = new Set(
      (pendingRows || []).map((row: { recipient_email: string }) => row.recipient_email.toLowerCase())
    );

    // Cooldown (admins only): don't re-notify about the same conversation more
    // than once every N minutes, however chatty the customer is.
    const onCooldown = new Set<string>();
    if (isFromCustomer && settings.adminCooldownMinutes > 0) {
      const cutoff = new Date(Date.now() - settings.adminCooldownMinutes * 60_000).toISOString();
      const { data: recentlySent } = await supabaseAdmin
        .from('chat_email_notifications')
        .select('recipient_email')
        .eq('conversation_id', conv.id)
        .eq('recipient_type', 'admin')
        .eq('status', 'sent')
        .gte('sent_at', cutoff);

      (recentlySent || []).forEach((row: { recipient_email: string }) =>
        onCooldown.add(row.recipient_email.toLowerCase())
      );
    }

    const scheduledAt = new Date(Date.now() + settings.debounceMinutes * 60_000).toISOString();

    const rows = candidates
      .filter((c) => !alreadyQueued.has(c.email) && !onCooldown.has(c.email))
      .map((c) => ({
        conversation_id: conv.id,
        trigger_message_id: message.id,
        after_message_at: message.created_at,
        recipient_email: c.email,
        recipient_type: c.type,
        recipient_user_id: c.userId,
        scheduled_at: scheduledAt,
      }));

    if (rows.length === 0) return;

    const { error } = await supabaseAdmin.from('chat_email_notifications').insert(rows);
    if (error) {
      await logEvent({
        type: 'error',
        event_name: 'chat_notification_enqueue',
        status: 'error',
        message: `Failed to queue ${rows.length} chat notification(s) for conversation ${conv.id}`,
        error_details: error.message,
      });
    }
  } catch (err) {
    // A notification problem must never break sending a chat message.
    console.error('[chat-notifications] enqueue failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

const BRAND_COLOR = '#7c3aed';

interface TemplateMessage {
  sender_name: string | null;
  body: string;
  created_at: string;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }) + ' UTC';
}

function renderMessageBlocks(messages: TemplateMessage[], fallbackName: string): string {
  return messages
    .map(
      (m) => `
      <div style="margin:0 0 12px 0;padding:14px 16px;background:#f6f5fb;border-left:3px solid ${BRAND_COLOR};border-radius:6px;">
        <div style="font-size:12px;color:#6b7280;margin-bottom:6px;">
          ${escapeHtml(m.sender_name || fallbackName)} &middot; ${escapeHtml(formatTimestamp(m.created_at))}
        </div>
        <div style="font-size:15px;color:#111827;line-height:1.5;white-space:pre-wrap;">${escapeHtml(m.body)}</div>
      </div>`
    )
    .join('');
}

function renderMessagesText(messages: TemplateMessage[], fallbackName: string): string {
  return messages
    .map((m) => `${m.sender_name || fallbackName} (${formatTimestamp(m.created_at)}):\n${m.body}`)
    .join('\n\n');
}

function wrapEmail(bodyHtml: string, footer: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
    <div style="background:#ffffff;border-radius:10px;padding:28px 24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      ${bodyHtml}
    </div>
    <p style="font-size:12px;color:#9ca3af;text-align:center;margin:16px 0 0 0;line-height:1.5;">${footer}</p>
  </div>
</body></html>`;
}

function renderButton(url: string, label: string): string {
  return `<a href="${escapeHtml(url)}" style="display:inline-block;background:${BRAND_COLOR};color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px;">${escapeHtml(label)}</a>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Email to the customer when an agent replies. */
export function renderCustomerReplyEmail(
  conversation: ChatConversationRow,
  messages: TemplateMessage[],
  appUrl: string
): RenderedEmail {
  const agentName = messages[messages.length - 1]?.sender_name || 'Traffic AI Support';
  const chatUrl = `${appUrl.replace(/\/$/, '')}/?chat=${conversation.id}`;
  const subject =
    messages.length > 1
      ? `${messages.length} new replies from Traffic AI Support`
      : `New reply from ${agentName}`;

  const html = wrapEmail(
    `
      <h1 style="font-size:19px;color:#111827;margin:0 0 6px 0;">You have a new reply</h1>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px 0;">
        ${escapeHtml(conversation.customer_name || 'Hi there')}, our support team replied to your chat.
      </p>
      ${renderMessageBlocks(messages, 'Traffic AI Support')}
      <div style="margin-top:24px;">${renderButton(chatUrl, 'Open the chat')}</div>
    `,
    "You're receiving this because you started a chat with Traffic AI support."
  );

  const text = [
    'You have a new reply from Traffic AI Support.',
    '',
    renderMessagesText(messages, 'Traffic AI Support'),
    '',
    `Open the chat: ${chatUrl}`,
    '',
    "You're receiving this because you started a chat with Traffic AI support.",
  ].join('\n');

  return { subject, html, text };
}

/** Email to admins/agents when a customer sends a message. */
export function renderAdminNewMessageEmail(
  conversation: ChatConversationRow,
  messages: TemplateMessage[],
  appUrl: string
): RenderedEmail {
  const customerLabel = conversation.customer_name || conversation.customer_email || 'A visitor';
  const chatUrl = `${appUrl.replace(/\/$/, '')}/chat/${conversation.id}`;
  const subject =
    messages.length > 1
      ? `${messages.length} new chat messages from ${customerLabel}`
      : `New chat message from ${customerLabel}`;

  const details = [
    conversation.customer_email ? `Email: ${conversation.customer_email}` : null,
    conversation.page_url ? `Page: ${conversation.page_url}` : null,
  ].filter(Boolean) as string[];

  const html = wrapEmail(
    `
      <h1 style="font-size:19px;color:#111827;margin:0 0 6px 0;">New chat message</h1>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px 0;">
        ${escapeHtml(customerLabel)} is waiting for a reply.
      </p>
      ${renderMessageBlocks(messages, customerLabel)}
      ${
        details.length
          ? `<div style="font-size:13px;color:#6b7280;line-height:1.6;margin:18px 0 0 0;">${details
              .map((d) => escapeHtml(d))
              .join('<br />')}</div>`
          : ''
      }
      <div style="margin-top:24px;">${renderButton(chatUrl, 'Reply in admin panel')}</div>
    `,
    'Traffic AI admin notification. Manage this in Settings &rsaquo; Chat Email Notifications.'
  );

  const text = [
    `New chat message from ${customerLabel}.`,
    '',
    renderMessagesText(messages, customerLabel),
    '',
    ...details,
    '',
    `Reply in admin panel: ${chatUrl}`,
  ].join('\n');

  return { subject, html, text };
}

/** Small helper so the cron and the test endpoint agree on the app URL. */
export async function resolveAppUrl(): Promise<string> {
  const config = await getSmtpConfig();
  return config.appUrl || 'https://app.trafficai.io';
}
