import type { NextApiRequest, NextApiResponse} from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient } from '@/lib/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can manage API keys
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user } = auth;
  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // Get user's API key
      const { data, error } = await supabase
        .from('user_api_keys')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      return res.status(200).json(data || null);
    }

    if (req.method === 'PUT') {
      // Assign or update API key
      const { apiKey } = req.body;

      if (!apiKey || typeof apiKey !== 'string') {
        return res.status(400).json({ error: 'Invalid API key' });
      }

      // Check if API key already exists
      const { data: existing } = await supabase
        .from('user_api_keys')
        .select('id')
        .eq('user_id', userId)
        .single();

      let data;
      if (existing) {
        // Update existing
        const result = await supabase
          .from('user_api_keys')
          // @ts-ignore - Supabase type inference issue
          .update({
            api_key: apiKey,
            assigned_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId)
          .select()
          .single();

        if (result.error) throw result.error;
        data = result.data;
      } else {
        // Insert new
        const result = await supabase
          .from('user_api_keys')
          // @ts-ignore - Supabase type inference issue
          .insert({
            user_id: userId,
            api_key: apiKey,
            assigned_by: user.id,
          })
          .select()
          .single();

        if (result.error) throw result.error;
        data = result.data;
      }

      await logAuditAction(user.id, 'assign_api_key', req, res, 'user', userId);
      return res.status(200).json(data);
    }

    if (req.method === 'DELETE') {
      // Remove API key
      const { error } = await supabase
        .from('user_api_keys')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      await logAuditAction(user.id, 'remove_api_key', req, res, 'user', userId);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
