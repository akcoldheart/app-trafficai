import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    // Get all websites for the current user
    const { data: websites, error } = await supabase
      .from('user_websites')
      .select('*')
      .eq('user_id', user.id)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching websites:', error);
      return res.status(500).json({ error: 'Failed to fetch websites' });
    }

    return res.status(200).json({ websites });
  }

  if (req.method === 'POST') {
    // Add a new website
    const { url, name, is_primary } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'Website URL is required' });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const { data: website, error } = await supabase
      .from('user_websites')
      .insert({
        user_id: user.id,
        url,
        name: name || null,
        is_primary: is_primary || false,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating website:', error);
      return res.status(500).json({ error: 'Failed to add website' });
    }

    return res.status(201).json({ website });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
