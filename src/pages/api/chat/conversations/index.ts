import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // Auth required for listing conversations
      const user = await getAuthenticatedUser(req, res);
      if (!user) return;

      const { status = 'open', page = '1', page_size = '20' } = req.query;
      const pageNum = parseInt(page as string, 10);
      const pageSize = parseInt(page_size as string, 10);
      const offset = (pageNum - 1) * pageSize;

      let query = supabase
        .from('chat_conversations')
        .select('*', { count: 'exact' })
        .order('last_message_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching conversations:', error);
        return res.status(500).json({ error: error.message });
      }

      await logAuditAction(user.id, 'list_chat_conversations', req, res);

      return res.status(200).json({
        data: data || [],
        pagination: {
          page: pageNum,
          page_size: pageSize,
          total_pages: Math.ceil((count || 0) / pageSize),
          total_entries: count || 0,
        },
      });
    }

    if (req.method === 'POST') {
      // Create new conversation (can be anonymous from widget)
      const { customer_name, customer_email, customer_metadata, visitor_id, source, page_url } = req.body;

      const { data, error } = await supabase
        .from('chat_conversations')
        .insert({
          customer_name,
          customer_email,
          customer_metadata: customer_metadata || {},
          visitor_id,
          source: source || 'widget',
          page_url,
          status: 'open',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating conversation:', error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json({ data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
