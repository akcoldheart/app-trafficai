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

/**
 * Send events using Klaviyo's Bulk Create Events API.
 * Accepts up to 10,000 events per request — much faster than one-by-one.
 */
async function sendBulkKlaviyoEvents(
  apiKey: string,
  events: Array<{ email: string; metricName: string; properties: Record<string, unknown> }>
): Promise<{ success: boolean; error?: string }> {
  if (events.length === 0) return { success: true };

  const eventData = events.map(e => ({
    type: 'event-bulk-create' as const,
    attributes: {
      profile: { data: { type: 'profile' as const, attributes: { email: e.email } } },
      metric: { data: { type: 'metric' as const, attributes: { name: e.metricName } } },
      properties: e.properties,
      time: new Date().toISOString(),
    },
  }));

  const response = await fetch('https://a.klaviyo.com/api/event-bulk-create-jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Klaviyo-API-Key ${apiKey}`,
      'accept': 'application/json',
      'content-type': 'application/json',
      'revision': '2024-10-15',
    },
    body: JSON.stringify({
      data: {
        type: 'event-bulk-create-job',
        attributes: {
          'events-bulk-create': {
            data: eventData,
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    let detail = `Klaviyo bulk API error ${response.status}`;
    try {
      const errJson = JSON.parse(errText);
      detail = errJson?.errors?.[0]?.detail || detail;
    } catch {
      // use default detail
    }
    console.error('Klaviyo bulk event error:', response.status, detail);

    // Retry once on rate limit
    if (response.status === 429) {
      await sleep(5000);
      const retry = await fetch('https://a.klaviyo.com/api/event-bulk-create-jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${apiKey}`,
          'accept': 'application/json',
          'content-type': 'application/json',
          'revision': '2024-10-15',
        },
        body: JSON.stringify({
          data: {
            type: 'event-bulk-create-job',
            attributes: {
              'events-bulk-create': {
                data: eventData,
              },
            },
          },
        }),
      });
      if (!retry.ok) {
        const retryErr = await retry.text();
        return { success: false, error: `Rate limited, retry failed: ${retryErr.slice(0, 200)}` };
      }
      return { success: true };
    }

    return { success: false, error: detail };
  }

  return { success: true };
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
      // Handled separately
      break;
  }

  const { data, error } = await query.limit(10000);
  if (error) throw error;
  return data || [];
}

async function getPricingPageVisitors(userId: string, pixelIds: string[], since: string | null) {
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

  const { data: visitors } = await supabaseAdmin
    .from('visitors')
    .select('email, first_name, last_name, full_name, company, job_title, lead_score, total_sessions, total_pageviews, last_seen_at, city, state, country')
    .eq('user_id', userId)
    .not('email', 'is', null)
    .in('id', visitorIds)
    .limit(10000);

  return visitors || [];
}

function buildVisitorProperties(visitor: Record<string, unknown>) {
  return {
    source: 'Traffic AI',
    lead_score: visitor.lead_score,
    company: visitor.company,
    job_title: visitor.job_title,
    city: visitor.city,
    state: visitor.state,
    country: visitor.country,
    total_sessions: visitor.total_sessions,
    total_pageviews: visitor.total_pageviews,
    first_name: visitor.first_name || (visitor.full_name ? (visitor.full_name as string).split(' ')[0] : null),
    last_name: visitor.last_name || (visitor.full_name ? (visitor.full_name as string).split(' ').slice(1).join(' ') : null),
  };
}

/**
 * Core push events logic — used by both the manual endpoint and the cron job.
 */
export async function pushEventsForUser(
  userId: string,
  eventTypes: string[],
  integration: { api_key: string; config: Record<string, unknown> }
) {
  // Get user's pixel IDs
  const { data: pixels } = await supabaseAdmin
    .from('pixels')
    .select('id')
    .eq('user_id', userId);

  if (!pixels || pixels.length === 0) {
    return { results: {}, total_pushed: 0 };
  }

  const pixelIds = pixels.map(p => p.id);
  const lastPushed = (integration.config.push_events_last_pushed || {}) as Record<string, string>;
  const results: Record<string, { pushed: number; errors: number }> = {};
  let totalPushed = 0;

  for (const type of eventTypes) {
    if (!EVENT_TYPES[type]) continue;

    let visitors;
    try {
      if (type === 'pricing_page') {
        visitors = await getPricingPageVisitors(userId, pixelIds, lastPushed[type] || null);
      } else {
        visitors = await getVisitorsForType(userId, type, pixelIds, lastPushed[type] || null);
      }
    } catch (error) {
      console.error(`Error fetching visitors for ${type}:`, error);
      results[type] = { pushed: 0, errors: 1 };
      continue;
    }

    if (visitors.length === 0) {
      results[type] = { pushed: 0, errors: 0 };
      continue;
    }

    // Build bulk events payload
    const bulkEvents = visitors.map(visitor => ({
      email: visitor.email!,
      metricName: EVENT_TYPES[type].metricName,
      properties: buildVisitorProperties(visitor),
    }));

    // Klaviyo bulk API supports up to 10,000 events per request.
    // Send in chunks of 5,000 to stay well within limits.
    const CHUNK_SIZE = 5000;
    let pushed = 0;
    let errors = 0;

    for (let i = 0; i < bulkEvents.length; i += CHUNK_SIZE) {
      const chunk = bulkEvents.slice(i, i + CHUNK_SIZE);
      const result = await sendBulkKlaviyoEvents(integration.api_key, chunk);

      if (result.success) {
        pushed += chunk.length;
      } else {
        console.error(`Bulk push error for ${type} chunk ${i}:`, result.error);
        errors += chunk.length;
      }

      // Small delay between chunks
      if (i + CHUNK_SIZE < bulkEvents.length) {
        await sleep(1000);
      }
    }

    results[type] = { pushed, errors };
    totalPushed += pushed;
  }

  // Update last pushed timestamps
  const newLastPushed = { ...lastPushed };
  const now = new Date().toISOString();
  for (const type of eventTypes) {
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
    .eq('user_id', userId)
    .eq('platform', 'klaviyo');

  return { results, total_pushed: totalPushed };
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

  try {
    const result = await pushEventsForUser(user.id, event_types, integration);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Push events error:', error);
    return res.status(500).json({ error: 'Failed to push events to Klaviyo' });
  }
}
