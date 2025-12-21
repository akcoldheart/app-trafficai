import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can merge conversations
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const supabase = createClient(req, res);

  try {
    const { email } = req.body;

    // If email provided, merge only that email's conversations
    // Otherwise, merge ALL duplicate conversations
    if (email) {
      const result = await mergeConversationsForEmail(supabase, email);
      return res.status(200).json(result);
    }

    // Get all emails with multiple conversations
    const { data: duplicates, error: dupError } = await supabase
      .from('chat_conversations')
      .select('customer_email')
      .not('customer_email', 'is', null);

    if (dupError) throw dupError;

    // Count conversations per email
    const emailCounts: Record<string, number> = {};
    duplicates?.forEach((conv) => {
      const email = conv.customer_email?.toLowerCase();
      if (email) {
        emailCounts[email] = (emailCounts[email] || 0) + 1;
      }
    });

    // Find emails with more than 1 conversation
    const emailsToMerge = Object.entries(emailCounts)
      .filter(([, count]) => count > 1)
      .map(([email]) => email);

    let totalMerged = 0;
    let totalMessagesMoved = 0;

    for (const emailToMerge of emailsToMerge) {
      const result = await mergeConversationsForEmail(supabase, emailToMerge);
      totalMerged += result.conversationsMerged;
      totalMessagesMoved += result.messagesMoved;
    }

    return res.status(200).json({
      success: true,
      emailsProcessed: emailsToMerge.length,
      conversationsMerged: totalMerged,
      messagesMoved: totalMessagesMoved,
    });
  } catch (error) {
    console.error('Merge conversations error:', error);
    return res.status(500).json({ error: 'Failed to merge conversations' });
  }
}

async function mergeConversationsForEmail(
  supabase: ReturnType<typeof createClient>,
  email: string
) {
  // Get all conversations for this email, ordered by creation date
  const { data: conversations, error: convError } = await supabase
    .from('chat_conversations')
    .select('*')
    .ilike('customer_email', email)
    .order('created_at', { ascending: true });

  if (convError) throw convError;
  if (!conversations || conversations.length <= 1) {
    return { conversationsMerged: 0, messagesMoved: 0 };
  }

  // Keep the oldest conversation as the primary
  const primaryConversation = conversations[0];
  const duplicateConversations = conversations.slice(1);
  const duplicateIds = duplicateConversations.map((c) => c.id);

  // Move all messages from duplicate conversations to the primary
  const { data: movedMessages, error: moveError } = await supabase
    .from('chat_messages')
    .update({ conversation_id: primaryConversation.id })
    .in('conversation_id', duplicateIds)
    .select();

  if (moveError) throw moveError;

  // Delete the duplicate conversations
  const { error: deleteError } = await supabase
    .from('chat_conversations')
    .delete()
    .in('id', duplicateIds);

  if (deleteError) throw deleteError;

  // Update the primary conversation status to 'open' if any were open
  const hasOpenConversation = duplicateConversations.some((c) => c.status === 'open');
  if (hasOpenConversation) {
    await supabase
      .from('chat_conversations')
      .update({ status: 'open' })
      .eq('id', primaryConversation.id);
  }

  return {
    conversationsMerged: duplicateConversations.length,
    messagesMoved: movedMessages?.length || 0,
  };
}
