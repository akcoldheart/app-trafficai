import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(req, res);

  try {
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    const { user_email, user_name, message } = req.body;

    if (!user_email || !message) {
      return res.status(400).json({ error: 'user_email and message are required' });
    }

    const normalizedEmail = user_email.toLowerCase().trim();

    // Check for existing open conversation with this email
    const { data: existing, error: findError } = await supabase
      .from('chat_conversations')
      .select('*')
      .ilike('customer_email', normalizedEmail)
      .eq('status', 'open')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (findError) {
      console.error('Error finding conversation:', findError);
      return res.status(500).json({ error: findError.message });
    }

    if (existing) {
      // Send the message to the existing conversation
      await supabase
        .from('chat_messages')
        .insert({
          conversation_id: existing.id,
          body: message,
          sender_type: 'agent',
          sender_id: user.id,
          sender_name: user.user_metadata?.full_name || user.email,
          is_private: false,
        });

      return res.status(200).json({ data: existing, existing: true });
    }

    // Create new conversation
    const { data: conversation, error: createError } = await supabase
      .from('chat_conversations')
      .insert({
        customer_name: user_name || normalizedEmail,
        customer_email: normalizedEmail,
        source: 'admin',
        status: 'open',
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating conversation:', createError);
      return res.status(500).json({ error: createError.message });
    }

    // Insert first agent message
    await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversation.id,
        body: message,
        sender_type: 'agent',
        sender_id: user.id,
        sender_name: user.user_metadata?.full_name || user.email,
        is_private: false,
      });

    await logAuditAction(user.id, 'admin_create_conversation', req, res, 'conversation', conversation.id);

    return res.status(201).json({ data: conversation, existing: false });
  } catch (error) {
    console.error('Admin Create Conversation Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
