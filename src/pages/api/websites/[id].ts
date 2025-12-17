import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Website ID is required' });
  }

  // Verify ownership
  const { data: existingWebsite, error: fetchError } = await supabase
    .from('user_websites')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (fetchError || !existingWebsite) {
    return res.status(404).json({ error: 'Website not found' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({ website: existingWebsite });
  }

  if (req.method === 'PUT' || req.method === 'PATCH') {
    // Update website
    const { url, name, is_primary } = req.body;

    const updates: Record<string, unknown> = {};

    if (url !== undefined) {
      // Validate URL format
      try {
        new URL(url);
        updates.url = url;
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }
    }

    if (name !== undefined) {
      updates.name = name;
    }

    if (is_primary !== undefined) {
      updates.is_primary = is_primary;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data: website, error } = await supabase
      .from('user_websites')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating website:', error);
      return res.status(500).json({ error: 'Failed to update website' });
    }

    return res.status(200).json({ website });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('user_websites')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('Error deleting website:', error);
      return res.status(500).json({ error: 'Failed to delete website' });
    }

    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
