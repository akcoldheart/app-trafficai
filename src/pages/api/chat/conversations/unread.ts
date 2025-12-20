import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      const { count, error } = await supabase
        .from('chat_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'open')
        .eq('read', false);

      if (error) {
        console.error('Error fetching unread count:', error);
        return res.status(200).json({ count: 0 });
      }

      return res.status(200).json({ count: count || 0 });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(200).json({ count: 0 });
  }
}
