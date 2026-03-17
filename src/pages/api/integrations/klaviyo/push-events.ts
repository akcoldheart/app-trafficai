import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 300,
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EVENT_TYPES: Record<string, { metricName: string; description: string }> = {
  identified_visitor: { metricName: 'TrafficAI Identified Visitor', description: 'Identified visitors with email' },
  high_intent: { metricName: 'TrafficAI High Intent Visitor', description: 'Visitors with lead score >= 75' },
  pricing_page: { metricName: 'TrafficAI Pricing Page Visit', description: 'Visitors who viewed pricing pages' },
  returning_visitor: { metricName: 'TrafficAI Returning Visitor', description: 'Visitors with 2+ sessions' },
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getKlaviyoIntegration(userId: string) {
  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('api_key, config')
    .eq('user_id', userId)
    .eq('platform', 'klaviyo')
    .eq('is_connected', true)
    .single();
  if (!data) return null;
  return { api_key: data.api_key, config: (data.config || {}) as Record<string, unknown> };
}

async function sendKlaviyoEvent(apiKey: string, email: string, metricName: string, properties: Record<string, unknown>) {
  const response = await fetch('https://a.klaviyo.com/api/events', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'accept': 'application/json',
      'content-type': 'application/json',
      'revision': '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'event',
        attributes: {
          metric: { data: { type: 'metric', attributes: { name: metricName } } },
          profile: { data: { type: 'profile', attributes: { email } } },
          properties,
          time: new Date().toISOString(),
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => null);
    const detail = err?.errors?.[0]?.detail || `Klaviyo API error ${response.status}`;
    console.error('Klaviyo event error:', response.status, detail, 'email:', email, 'metric:', metricName);

    // If rate limited, wait and retry once
    if (response.status === 429) {
      await sleep(5000);
      const retry = await fetch('https://a.klaviyo.com/api/events', {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'content-type': 'application/json',
          'revision': '2024-10-15',
        },
        body: JSON.stringify({
          data: {
            type: 'event',
            attributes: {
              metric: { data: { type: 'metric', attributes: { name: metricName } } },
              profile: { data: { type: 'profile', attributes: { email } } },
              properties,
              time: new Date().toISOString(),
            },
          },
        }),
      });
      if (!retry.ok) {
        const retryErr = await retry.json().catch(() => null);
        throw new Error(retryErr?.errors?.[0]?.detail || `Klaviyo API error ${retry.status} (after retry)`);
      }
      return;
    }

    throw new Error(detail);
  }
}

async function getVisitorsForType(userId: string, type: string, pixelIds: string[], since: string | null) {
  let query = supabaseAdmin
    .from('visitors')
    .select('email, first_name, last_name, full_name, company, job_title, lead_score, total_sessions, total_pageviews, last_seen_at, city, state, country')
    .eq('user_id', userId)
    .not('email', 'is', null)
    .in('pixel_id', pixelIds);

  if (since) {
    query = query.gt('last_seen_at', since);
  }

  switch (type) {
    case 'identified_visitor':
      query = query.eq('is_identified', true);
      break;
    case 'high_intent':
      query = query.gte('lead_score', 75);
      break;
    case 'returning_visitor':
      query = query.gte('total_sessions', 2);
      break;
    case 'pricing_page':
      // For pricing page, we need a different approach - join with pixel_events
      break;
  }

  const { data, error } = await query.limit(10000);
  if (error) throw error;
  return data || [];
}

async function getPricingPageVisitors(userId: string, pixelIds: string[], since: string | null) {
  // Get visitor IDs who have pricing page events
  let eventsQuery = supabaseAdmin
    .from('pixel_events')
    .select('visitor_id')
    .in('pixel_id', pixelIds)
    .ilike('page_url', '%pricing%');

  if (since) {
    eventsQuery = eventsQuery.gt('created_at', since);
  }

  const { data: events } = await eventsQuery.limit(10000);
  if (!events || events.length === 0) return [];

  const visitorIds = Array.from(new Set(events.map(e => e.visitor_id)));

  // Fetch those visitors
  const { data: visitors } = await supabaseAdmin
    .from('visitors')
    .select('email, first_name, last_name, full_name, company, job_title, lead_score, total_sessions, total_pageviews, last_seen_at, city, state, country')
    .eq('user_id', userId)
    .not('email', 'is', null)
    .in('id', visitorIds)
    .limit(10000);

  return visitors || [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const integration = await getKlaviyoIntegration(user.id);
  if (!integration) {
    return res.status(400).json({ error: 'Klaviyo not connected' });
  }

  const { event_types } = req.body;
  if (!event_types || !Array.isArray(event_types) || event_types.length === 0) {
    return res.status(400).json({ error: 'event_types array is required' });
  }

  // Get user's pixel IDs
  const { data: pixels } = await supabaseAdmin
    .from('pixels')
    .select('id')
    .eq('user_id', user.id);

  if (!pixels || pixels.length === 0) {
    return res.status(400).json({ error: 'No pixels found' });
  }

  const pixelIds = pixels.map(p => p.id);
  const lastPushed = (integration.config.push_events_last_pushed || {}) as Record<string, string>;
  const results: Record<string, { pushed: number; errors: number }> = {};
  let totalPushed = 0;

  for (const type of event_types) {
    if (!EVENT_TYPES[type]) continue;

    const since = lastPushed[type] || null;
    let visitors;

    try {
      if (type === 'pricing_page') {
        visitors = await getPricingPageVisitors(user.id, pixelIds, since);
      } else {
        visitors = await getVisitorsForType(user.id, type, pixelIds, since);
      }
    } catch (error) {
      console.error(`Error fetching visitors for ${type}:`, error);
      results[type] = { pushed: 0, errors: 1 };
      continue;
    }

    let pushed = 0;
    let errors = 0;

    // Send in batches of 10 with delays to respect Klaviyo rate limits
    for (let i = 0; i < visitors.length; i += 10) {
      const batch = visitors.slice(i, i + 10);

      for (const visitor of batch) {
        try {
          await sendKlaviyoEvent(integration.api_key, visitor.email!, EVENT_TYPES[type].metricName, {
            source: 'Traffic AI',
            lead_score: visitor.lead_score,
            company: visitor.company,
            job_title: visitor.job_title,
            city: visitor.city,
            state: visitor.state,
            country: visitor.country,
            total_sessions: visitor.total_sessions,
            total_pageviews: visitor.total_pageviews,
            first_name: visitor.first_name || (visitor.full_name ? visitor.full_name.split(' ')[0] : null),
            last_name: visitor.last_name || (visitor.full_name ? visitor.full_name.split(' ').slice(1).join(' ') : null),
          });
          pushed++;
        } catch (error) {
          console.error(`Error pushing event for ${visitor.email}:`, error);
          errors++;
        }
        // Small delay between individual requests to avoid burst rate limiting
        await sleep(100);
      }

      // Longer delay between batches
      if (i + 10 < visitors.length) {
        await sleep(2000);
      }
    }

    results[type] = { pushed, errors };
    totalPushed += pushed;
  }

  // Update last pushed timestamps
  const newLastPushed = { ...lastPushed };
  const now = new Date().toISOString();
  for (const type of event_types) {
    if (EVENT_TYPES[type] && results[type]?.pushed > 0) {
      newLastPushed[type] = now;
    }
  }

  const updatedConfig = {
    ...integration.config,
    push_events_last_pushed: newLastPushed,
  };

  await supabaseAdmin
    .from('platform_integrations')
    .update({ config: updatedConfig, updated_at: now })
    .eq('user_id', user.id)
    .eq('platform', 'klaviyo');

  return res.status(200).json({ results, total_pushed: totalPushed });
}
