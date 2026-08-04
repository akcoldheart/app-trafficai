import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { sendMail } from '@/lib/mailer';
import {
  getChatNotificationSettings,
  renderAdminNewMessageEmail,
  renderCustomerReplyEmail,
  resolveAppUrl,
  type ChatConversationRow,
} from '@/lib/chat-notifications';
import { logEvent } from '@/lib/webhook-logger';

export const config = { maxDuration: 300 };

// This cron runs every minute. Keep a tight budget so a slow SMTP server can
// never let one run overlap the next by more than the stale-claim window.
const MAX_PROCESSING_MS = 240_000;
// Gmail/Workspace caps outbound volume (~2k/day), so cap per-run volume too.
const MAX_EMAILS_PER_RUN = 100;
const SEND_GAP_MS = 200;
// A row claimed but never finished (lambda killed mid-send) returns to pending.
const STALE_CLAIM_MS = 10 * 60_000;
const MAX_ATTEMPTS = 3;
const QUEUE_BATCH_SIZE = 200;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface QueueRow {
  id: string;
  conversation_id: string;
  after_message_at: string;
  recipient_email: string;
  recipient_type: 'customer' | 'admin';
  attempts: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function markSkipped(ids: string[], reason: string) {
  if (ids.length === 0) return;
  await supabaseAdmin
    .from('chat_email_notifications')
    .update({ status: 'skipped', last_error: reason, claimed_at: null })
    .in('id', ids);
}

async function markSent(ids: string[]) {
  if (ids.length === 0) return;
  await supabaseAdmin
    .from('chat_email_notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString(), last_error: null })
    .in('id', ids);
}

/**
 * Failure handling: put the row back in the queue for the next minute until it
 * has burned through MAX_ATTEMPTS, then park it as failed with the last error.
 */
async function markFailure(rows: QueueRow[], error: string) {
  for (const row of rows) {
    const attempts = (row.attempts || 0) + 1;
    await supabaseAdmin
      .from('chat_email_notifications')
      .update({
        status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
        attempts,
        last_error: error.slice(0, 1000),
        claimed_at: null,
      })
      .eq('id', row.id);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const startedAt = Date.now();
  const stats = { claimed: 0, sent: 0, skipped: 0, failed: 0, groups: 0, deferred: 0 };

  try {
    const settings = await getChatNotificationSettings();
    if (!settings.enabled) {
      return res.status(200).json({ message: 'Chat email notifications are disabled', ...stats });
    }

    // 1. Recover rows a previous run claimed but never finished.
    const staleCutoff = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
    await supabaseAdmin
      .from('chat_email_notifications')
      .update({ status: 'pending', claimed_at: null })
      .eq('status', 'sending')
      .lt('claimed_at', staleCutoff);

    // 2. Find due rows (debounce window elapsed).
    const { data: due, error: dueError } = await supabaseAdmin
      .from('chat_email_notifications')
      .select('id, conversation_id, after_message_at, recipient_email, recipient_type, attempts')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })
      .limit(QUEUE_BATCH_SIZE);

    if (dueError) {
      console.error('[cron/send-chat-notifications] Failed to read queue:', dueError);
      return res.status(500).json({ error: 'Failed to read notification queue' });
    }

    if (!due || due.length === 0) {
      return res.status(200).json({ message: 'Nothing to send', ...stats });
    }

    // 3. Claim atomically. Only rows this run actually transitioned come back,
    //    so two overlapping runs can never send the same email twice.
    const { data: claimedRows, error: claimError } = await supabaseAdmin
      .from('chat_email_notifications')
      .update({ status: 'sending', claimed_at: new Date().toISOString() })
      .in('id', due.map((row: QueueRow) => row.id))
      .eq('status', 'pending')
      .select('id, conversation_id, after_message_at, recipient_email, recipient_type, attempts');

    if (claimError) {
      console.error('[cron/send-chat-notifications] Failed to claim rows:', claimError);
      return res.status(500).json({ error: 'Failed to claim notification rows' });
    }

    const claimed = (claimedRows || []) as QueueRow[];
    stats.claimed = claimed.length;
    if (claimed.length === 0) {
      return res.status(200).json({ message: 'All due rows were claimed by another run', ...stats });
    }

    // 4. One email per (conversation, recipient) — collapses a message burst.
    const groups = new Map<string, QueueRow[]>();
    for (const row of claimed) {
      const key = `${row.conversation_id}|${row.recipient_email}`;
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    stats.groups = groups.size;

    // The configured CC list is a real CC header on both directions. A customer
    // reply email has a single recipient so it always carries the CC, but a
    // customer message fans out to one email per admin — attaching the CC to
    // every one of those would deliver N copies to the CC'd inbox. So pick a
    // single carrier per conversation (lowest recipient email, deterministic).
    const ccCarrierByConversation = new Map<string, string>();
    for (const row of claimed) {
      if (row.recipient_type !== 'admin') continue;
      const current = ccCarrierByConversation.get(row.conversation_id);
      if (!current || row.recipient_email < current) {
        ccCarrierByConversation.set(row.conversation_id, row.recipient_email);
      }
    }

    const appUrl = await resolveAppUrl();
    const conversationCache = new Map<string, ChatConversationRow | null>();

    for (const group of Array.from(groups.values())) {
      const ids = group.map((row) => row.id);

      // Budget guards: release the rest back to pending for the next minute.
      if (Date.now() - startedAt > MAX_PROCESSING_MS || stats.sent >= MAX_EMAILS_PER_RUN) {
        await supabaseAdmin
          .from('chat_email_notifications')
          .update({ status: 'pending', claimed_at: null })
          .in('id', ids);
        stats.deferred += ids.length;
        continue;
      }

      const first = group[0];
      // Oldest un-notified message across the merged rows
      const afterMessageAt = group
        .map((row) => row.after_message_at)
        .sort()[0];

      try {
        if (!conversationCache.has(first.conversation_id)) {
          const { data } = await supabaseAdmin
            .from('chat_conversations')
            .select('id, customer_name, customer_email, assignee_id, subject, page_url, read')
            .eq('id', first.conversation_id)
            .maybeSingle();
          conversationCache.set(first.conversation_id, (data as ChatConversationRow) || null);
        }

        const conversation = conversationCache.get(first.conversation_id) as
          | (ChatConversationRow & { read?: boolean | null })
          | null;

        if (!conversation) {
          await markSkipped(ids, 'Conversation no longer exists');
          stats.skipped += ids.length;
          continue;
        }

        // All non-private messages since the trigger, to decide relevance and
        // to build the body.
        const { data: messages } = await supabaseAdmin
          .from('chat_messages')
          .select('sender_type, sender_name, body, created_at')
          .eq('conversation_id', first.conversation_id)
          .eq('is_private', false)
          .gte('created_at', afterMessageAt)
          .order('created_at', { ascending: true });

        const since = messages || [];

        if (first.recipient_type === 'admin') {
          // Already handled: an agent opened the conversation, or someone replied.
          if (conversation.read) {
            await markSkipped(ids, 'Conversation already read in admin panel');
            stats.skipped += ids.length;
            continue;
          }
          if (since.some((m) => m.sender_type === 'agent')) {
            await markSkipped(ids, 'An agent already replied');
            stats.skipped += ids.length;
            continue;
          }
        } else if (since.some((m) => m.sender_type === 'customer')) {
          // The customer kept typing in the widget, so they saw the reply.
          await markSkipped(ids, 'Customer is active in the widget');
          stats.skipped += ids.length;
          continue;
        }

        const relevant =
          first.recipient_type === 'admin'
            ? since.filter((m) => m.sender_type === 'customer')
            : since.filter((m) => m.sender_type === 'agent');

        if (relevant.length === 0) {
          await markSkipped(ids, 'No messages left to report');
          stats.skipped += ids.length;
          continue;
        }

        const email =
          first.recipient_type === 'admin'
            ? renderAdminNewMessageEmail(conversation, relevant, appUrl)
            : renderCustomerReplyEmail(conversation, relevant, appUrl);

        // Never CC an address that is already the To: recipient — that would
        // deliver the same email to them twice.
        const carriesCc =
          first.recipient_type === 'customer' ||
          ccCarrierByConversation.get(first.conversation_id) === first.recipient_email;
        const cc = carriesCc
          ? settings.ccEmails.filter((address) => address !== first.recipient_email)
          : [];

        const result = await sendMail({
          to: first.recipient_email,
          subject: email.subject,
          html: email.html,
          text: email.text,
          cc,
        });

        if (result.ok) {
          await markSent(ids);
          stats.sent += 1;
        } else {
          await markFailure(group, result.error || 'Unknown SMTP error');
          stats.failed += ids.length;
        }

        await sleep(SEND_GAP_MS);
      } catch (err) {
        // Error isolation: one bad row can't stop the rest of the queue.
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[cron/send-chat-notifications] Group ${first.conversation_id} failed:`, err);
        await markFailure(group, message);
        stats.failed += ids.length;
      }
    }

    if (stats.deferred > 0) {
      console.warn(
        `[cron/send-chat-notifications] Deferred ${stats.deferred} row(s) to the next run (per-run cap ${MAX_EMAILS_PER_RUN}, budget ${MAX_PROCESSING_MS}ms).`
      );
      await logEvent({
        type: 'info',
        event_name: 'chat_notification_cron',
        status: 'warning',
        message: `Deferred ${stats.deferred} chat notification(s) to the next run`,
        response_data: { ...stats },
      });
    }

    if (stats.failed > 0) {
      await logEvent({
        type: 'error',
        event_name: 'chat_notification_cron',
        status: 'error',
        message: `${stats.failed} chat notification(s) failed to send`,
        response_data: { ...stats },
      });
    }

    return res.status(200).json({
      message: 'Chat notification queue processed',
      ...stats,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[cron/send-chat-notifications] Fatal error:', error);
    await logEvent({
      type: 'error',
      event_name: 'chat_notification_cron',
      status: 'error',
      message: 'Chat notification cron failed',
      error_details: error instanceof Error ? error.message : 'Unknown error',
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
