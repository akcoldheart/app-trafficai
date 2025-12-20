import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export interface AutoReply {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createClient(req, res);

  try {
    // All operations require authentication
    const user = await getAuthenticatedUser(req, res);
    if (!user) return;

    if (req.method === 'GET') {
      // List all auto-replies
      const { data, error } = await supabase
        .from('chat_auto_replies')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ data: data || [] });
    }

    if (req.method === 'POST') {
      // Create new auto-reply
      const { question, answer, keywords = [], is_active = true, priority = 0 } = req.body;

      if (!question || !answer) {
        return res.status(400).json({ error: 'question and answer are required' });
      }

      const { data, error } = await supabase
        .from('chat_auto_replies')
        .insert({
          question,
          answer,
          keywords: Array.isArray(keywords) ? keywords : [],
          is_active,
          priority,
        })
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json({ data });
    }

    if (req.method === 'PUT') {
      // Update auto-reply
      const { id, question, answer, keywords, is_active, priority } = req.body;

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const updateData: Partial<AutoReply> = {};
      if (question !== undefined) updateData.question = question;
      if (answer !== undefined) updateData.answer = answer;
      if (keywords !== undefined) updateData.keywords = Array.isArray(keywords) ? keywords : [];
      if (is_active !== undefined) updateData.is_active = is_active;
      if (priority !== undefined) updateData.priority = priority;

      const { data, error } = await supabase
        .from('chat_auto_replies')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ data });
    }

    if (req.method === 'DELETE') {
      // Delete auto-reply
      const { id } = req.query;
      const idString = Array.isArray(id) ? id[0] : id;

      if (!idString) {
        return res.status(400).json({ error: 'id is required' });
      }

      const { error } = await supabase
        .from('chat_auto_replies')
        .delete()
        .eq('id', idString);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Auto-replies API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
