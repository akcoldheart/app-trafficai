import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Conversation ID is required' });
  }

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // Require authentication to view conversations
      const user = await getAuthenticatedUser(req, res);
      if (!user) return;

      // Fetch conversation with messages
      const { data: conversation, error: convError } = await supabase
        .from('chat_conversations')
        .select('*')
        .eq('id', id)
        .single();

      if (convError) {
        if (convError.code === 'PGRST116') {
          return res.status(404).json({ error: 'Conversation not found' });
        }
        return res.status(500).json({ error: 'Failed to fetch conversation' });
      }

      // Fetch messages for this conversation
      const { data: messages, error: msgError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('conversation_id', id)
        .order('created_at', { ascending: true });

      if (msgError) {
        return res.status(500).json({ error: 'Failed to fetch messages' });
      }

      await logAuditAction(user.id, 'view_chat_conversation', req, res, 'conversation', id);

      // Mark as read when agent views
      await supabase
        .from('chat_conversations')
        .update({ read: true })
        .eq('id', id);

      return res.status(200).json({
        data: {
          ...conversation,
          messages: messages || [],
        },
      });
    }

    if (req.method === 'PUT') {
      // Update conversation (requires auth)
      const user = await getAuthenticatedUser(req, res);
      if (!user) return;

      const updates = req.body;

      // Handle status changes
      if (updates.status === 'closed' && !updates.closed_at) {
        updates.closed_at = new Date().toISOString();
      }
      if (updates.status === 'open') {
        updates.closed_at = null;
      }

      const { data, error } = await supabase
        .from('chat_conversations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating conversation:', error);
        return res.status(500).json({ error: 'Failed to update conversation' });
      }

      await logAuditAction(user.id, 'update_chat_conversation', req, res, 'conversation', id);
      return res.status(200).json({ data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
