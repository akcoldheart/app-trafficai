import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getKlaviyoApiKey(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('api_key')
    .eq('user_id', userId)
    .eq('platform', 'klaviyo')
    .eq('is_connected', true)
    .single();
  return data?.api_key || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const apiKey = await getKlaviyoApiKey(user.id);
  if (!apiKey) {
    return res.status(400).json({ error: 'Klaviyo not connected' });
  }

  try {
    const response = await fetch('https://a.klaviyo.com/api/metrics', {
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'accept': 'application/json',
        'revision': '2024-10-15',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch Klaviyo metrics' });
    }

    const data = await response.json();
    const metrics = (data.data || []).map((m: { id: string; attributes: { name: string; integration: { name: string; category: string } } }) => ({
      id: m.id,
      name: m.attributes.name,
      integration_name: m.attributes.integration?.name || '',
      integration_category: m.attributes.integration?.category || '',
    }));

    return res.status(200).json({ metrics });
  } catch (error) {
    console.error('Error fetching Klaviyo metrics:', error);
    return res.status(500).json({ error: 'Failed to fetch Klaviyo metrics' });
  }
}
