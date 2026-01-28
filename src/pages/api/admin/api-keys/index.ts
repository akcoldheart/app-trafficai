import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can manage API keys
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('user_api_keys')
        .select(`
          *,
          user:users!user_api_keys_user_id_fkey(id, email, full_name),
          assigned_by_user:users!user_api_keys_assigned_by_fkey(email)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching API keys:', error);
        return res.status(500).json({ error: 'Failed to fetch API keys' });
      }

      return res.status(200).json({ apiKeys: data || [] });
    }

    if (req.method === 'POST') {
      const { user_id, api_key } = req.body;

      if (!user_id || !api_key) {
        return res.status(400).json({ error: 'User ID and API key are required' });
      }

      // Check if user already has an API key
      const { data: existing } = await supabase
        .from('user_api_keys')
        .select('id')
        .eq('user_id', user_id)
        .single();

      if (existing) {
        return res.status(400).json({ error: 'User already has an API key assigned. Update or delete the existing one first.' });
      }

      const { data, error } = await supabase
        .from('user_api_keys')
        .insert({
          user_id,
          api_key,
          assigned_by: authResult.user.id,
        })
        .select(`
          *,
          user:users!user_api_keys_user_id_fkey(id, email, full_name),
          assigned_by_user:users!user_api_keys_assigned_by_fkey(email)
        `)
        .single();

      if (error) {
        console.error('Error creating API key:', error);
        return res.status(500).json({ error: 'Failed to assign API key' });
      }

      await logAuditAction(authResult.user.id, 'assign_api_key', req, res, 'user_api_key', data.id, { user_id });
      return res.status(201).json({ apiKey: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
