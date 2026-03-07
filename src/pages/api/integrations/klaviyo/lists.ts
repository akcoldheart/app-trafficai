import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getKlaviyoApiKey(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('klaviyo_integrations')
    .select('api_key')
    .eq('user_id', userId)
    .eq('is_connected', true)
    .single();
  return data?.api_key || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const apiKey = await getKlaviyoApiKey(user.id);
  if (!apiKey) {
    return res.status(400).json({ error: 'Klaviyo not connected. Please connect your Klaviyo account first.' });
  }

  if (req.method === 'GET') {
    try {
      const response = await fetch('https://a.klaviyo.com/api/lists', {
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'revision': '2024-10-15',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch Klaviyo lists' });
      }

      const data = await response.json();
      const lists = (data.data || []).map((list: { id: string; attributes: { name: string; created: string; updated: string } }) => ({
        id: list.id,
        name: list.attributes.name,
        created: list.attributes.created,
        updated: list.attributes.updated,
      }));

      return res.status(200).json({ lists });
    } catch (error) {
      console.error('Error fetching Klaviyo lists:', error);
      return res.status(500).json({ error: 'Failed to fetch Klaviyo lists' });
    }
  }

  if (req.method === 'POST') {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'List name is required' });
    }

    try {
      const response = await fetch('https://a.klaviyo.com/api/lists', {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'content-type': 'application/json',
          'revision': '2024-10-15',
        },
        body: JSON.stringify({
          data: {
            type: 'list',
            attributes: { name },
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        return res.status(response.status).json({
          error: errorData?.errors?.[0]?.detail || 'Failed to create Klaviyo list',
        });
      }

      const data = await response.json();
      return res.status(201).json({
        list: {
          id: data.data.id,
          name: data.data.attributes.name,
        },
      });
    } catch (error) {
      console.error('Error creating Klaviyo list:', error);
      return res.status(500).json({ error: 'Failed to create Klaviyo list' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
