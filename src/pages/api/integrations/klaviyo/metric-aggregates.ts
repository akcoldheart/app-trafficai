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

function getDateRange(timeframe: string): { start: string; end: string; interval: string } {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;
  let interval: string;

  switch (timeframe) {
    case 'last_7_days':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      interval = 'day';
      break;
    case 'last_30_days':
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      interval = 'day';
      break;
    case 'last_90_days':
      start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      interval = 'week';
      break;
    default:
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      interval = 'day';
  }

  return { start: start.toISOString(), end, interval };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const apiKey = await getKlaviyoApiKey(user.id);
  if (!apiKey) {
    return res.status(400).json({ error: 'Klaviyo not connected' });
  }

  const { metric_id, measurement = 'count', timeframe = 'last_7_days' } = req.body;

  if (!metric_id) {
    return res.status(400).json({ error: 'metric_id is required' });
  }

  const { start, end, interval } = getDateRange(timeframe);

  try {
    const response = await fetch('https://a.klaviyo.com/api/metric-aggregates', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        'revision': '2024-10-15',
      },
      body: JSON.stringify({
        data: {
          type: 'metric-aggregate',
          attributes: {
            metric_id,
            measurements: [measurement],
            interval,
            filter: [
              `greater-or-equal(datetime,${start})`,
              `less-than(datetime,${end})`,
            ],
            by: [],
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error('Klaviyo metric-aggregates error:', errorData);
      return res.status(response.status).json({ error: 'Failed to fetch metric aggregates' });
    }

    const result = await response.json();
    const attrs = result.data?.attributes;
    const dates = attrs?.dates || [];
    const values = attrs?.data?.[0]?.measurements?.[measurement] || [];

    const data = dates.map((date: string, i: number) => ({
      date,
      value: values[i] || 0,
    }));

    return res.status(200).json({ data });
  } catch (error) {
    console.error('Error fetching metric aggregates:', error);
    return res.status(500).json({ error: 'Failed to fetch metric aggregates' });
  }
}
