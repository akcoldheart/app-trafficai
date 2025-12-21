import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, logAuditAction } from '@/lib/api-helpers';

// Helper function to find matching auto-reply
async function findMatchingAutoReply(supabase: ReturnType<typeof createClient>, message: string) {
  try {
    // Get all active auto-replies ordered by priority
    const { data: autoReplies, error } = await supabase
      .from('chat_auto_replies')
      .select('*')
      .eq('is_active', true)
      .order('priority', { ascending: false });

    if (error || !autoReplies || autoReplies.length === 0) {
      return null;
    }

    // Normalize the message for matching
    const normalizedMessage = message.toLowerCase().trim();

    // Check each auto-reply for keyword matches
    for (const reply of autoReplies) {
      // Check if any keyword appears in the message
      const keywords = reply.keywords || [];
      for (const keyword of keywords) {
        if (keyword && normalizedMessage.includes(keyword.toLowerCase())) {
          return reply;
        }
      }

      // Also check if the question itself matches
      if (reply.question && normalizedMessage.includes(reply.question.toLowerCase())) {
        return reply;
      }
    }

    return null;
  } catch (err) {
    console.error('Error finding auto-reply:', err);
    return null;
  }
}

// Helper function to get default acknowledgment
async function getDefaultAcknowledgment(supabase: ReturnType<typeof createClient>) {
  try {
    const { data } = await supabase
      .from('chat_settings')
      .select('value')
      .eq('key', 'default_acknowledgment')
      .single();

    return data?.value || 'Thanks for reaching out! Our team will get back to you shortly.';
  } catch {
    return 'Thanks for reaching out! Our team will get back to you shortly.';
  }
}

// Helper function to get bot name
async function getBotName(supabase: ReturnType<typeof createClient>) {
  try {
    const { data } = await supabase
      .from('chat_settings')
      .select('value')
      .eq('key', 'bot_name')
      .single();

    return data?.value || 'Traffic AI';
  } catch {
    return 'Traffic AI';
  }
}

// Helper function to check if auto-reply is enabled
async function isAutoReplyEnabled(supabase: ReturnType<typeof createClient>) {
  try {
    const { data } = await supabase
      .from('chat_settings')
      .select('value')
      .eq('key', 'auto_reply_enabled')
      .single();

    return data?.value !== 'false';
  } catch {
    return true; // Default to enabled
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);

  try {
    if (req.method === 'POST') {
      const {
        conversation_id,
        body,
        sender_type = 'customer',
        sender_name,
        is_private = false,
        attachments = [],
      } = req.body;

      if (!conversation_id || !body) {
        return res.status(400).json({ error: 'conversation_id and body are required' });
      }

      // If sender is agent, require authentication
      let senderId = null;
      let senderDisplayName = sender_name;

      if (sender_type === 'agent' || sender_type === 'note') {
        const user = await getAuthenticatedUser(req, res);
        if (!user) return;

        senderId = user.id;
        senderDisplayName = sender_name || user.user_metadata?.full_name || user.email;
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id,
          body,
          sender_type: sender_type === 'note' ? 'agent' : sender_type,
          sender_id: senderId,
          sender_name: senderDisplayName,
          is_private: sender_type === 'note' || is_private,
          attachments,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating message:', error);
        return res.status(500).json({ error: error.message });
      }

      // Log audit if agent
      if (senderId) {
        await logAuditAction(senderId, 'send_chat_message', req, res, 'conversation', conversation_id);
      }

      // Auto-reply logic for customer messages
      if (sender_type === 'customer') {
        try {
          // Check if auto-reply is enabled
          const autoReplyEnabled = await isAutoReplyEnabled(supabase);
          if (!autoReplyEnabled) {
            return res.status(201).json({ data });
          }

          // Find matching auto-reply based on keywords for EVERY message
          const matchedReply = await findMatchingAutoReply(supabase, body);

          if (matchedReply) {
            // Only reply if we have a matching keyword/question
            const botName = await getBotName(supabase);

            // Insert the bot reply
            await supabase
              .from('chat_messages')
              .insert({
                conversation_id,
                body: matchedReply.answer,
                sender_type: 'bot',
                sender_name: botName,
                is_private: false,
              });
          } else {
            // For messages without keyword match, check if this is the first message
            // and send default acknowledgment only for the first message
            const { count, error: countError } = await supabase
              .from('chat_messages')
              .select('*', { count: 'exact', head: true })
              .eq('conversation_id', conversation_id)
              .eq('sender_type', 'customer');

            // Only send default acknowledgment for the first customer message
            if (!countError && count === 1) {
              const botName = await getBotName(supabase);
              const defaultReply = await getDefaultAcknowledgment(supabase);

              await supabase
                .from('chat_messages')
                .insert({
                  conversation_id,
                  body: defaultReply,
                  sender_type: 'bot',
                  sender_name: botName,
                  is_private: false,
                });
            }
          }
        } catch (autoReplyError) {
          // Log but don't fail the request if auto-reply fails
          console.error('Auto-reply error:', autoReplyError);
        }
      }

      return res.status(201).json({ data });
    }

    if (req.method === 'GET') {
      // Get messages for a conversation
      const { conversation_id } = req.query;
      const convIdStr = Array.isArray(conversation_id) ? conversation_id[0] : conversation_id;

      if (!convIdStr) {
        return res.status(400).json({ error: 'conversation_id is required' });
      }

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', convIdStr)
        .order('created_at', { ascending: true });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ data: data || [] });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
