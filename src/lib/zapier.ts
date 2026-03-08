/**
 * Zapier trigger firing utility.
 * Call these from API routes when events occur in Traffic AI.
 */

import { createClient } from '@supabase/supabase-js';

// Lazy initialization — only runs on server where env vars are available
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export type ZapierTrigger = 'new_visitor' | 'high_intent_visitor' | 'new_lead' | 'audience_match';

export interface ZapierTriggerConfig {
  webhook_url: string;
  enabled: boolean;
}

export interface ZapierConfig {
  triggers: Partial<Record<ZapierTrigger, ZapierTriggerConfig>>;
}

export interface VisitorPayload {
  id?: string;
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company?: string;
  job_title?: string;
  city?: string;
  state?: string;
  country?: string;
  linkedin_url?: string;
  lead_score?: number;
  total_pageviews?: number;
  total_sessions?: number;
  first_seen_at?: string;
  last_seen_at?: string;
  pixel_domain?: string;
}

function buildPayload(trigger: ZapierTrigger, data: Record<string, unknown>) {
  return {
    event: trigger,
    source: 'traffic_ai',
    timestamp: new Date().toISOString(),
    trigger: TRIGGER_META[trigger].name,
    data,
  };
}

export const TRIGGER_META: Record<ZapierTrigger, { name: string; description: string }> = {
  new_visitor: {
    name: 'New Visitor Identified',
    description: 'Fires when a new visitor is identified on your website with an email address.',
  },
  high_intent_visitor: {
    name: 'New High Intent Visitor',
    description: 'Fires when a visitor with a high intent score (75+) is identified.',
  },
  new_lead: {
    name: 'New Lead',
    description: 'Fires when a visitor with both an email and company is identified (qualified lead).',
  },
  audience_match: {
    name: 'New Audience Match',
    description: 'Fires when a contact is added to one of your audiences.',
  },
};

export const TRIGGER_ORDER: ZapierTrigger[] = [
  'new_visitor',
  'high_intent_visitor',
  'new_lead',
  'audience_match',
];

async function getZapierConfig(userId: string): Promise<ZapierConfig | null> {
  const { data } = await getSupabaseAdmin()
    .from('platform_integrations')
    .select('config')
    .eq('user_id', userId)
    .eq('platform', 'zapier')
    .eq('is_connected', true)
    .single();

  if (!data?.config) return null;
  return data.config as ZapierConfig;
}

async function fireTrigger(webhookUrl: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('Error firing Zapier trigger:', error);
  }
}

/**
 * Fire the new_visitor trigger.
 * Call this when a new visitor with an email is identified.
 */
export async function fireNewVisitor(userId: string, visitor: VisitorPayload): Promise<void> {
  const config = await getZapierConfig(userId);
  if (!config) return;

  const trigger = config.triggers?.new_visitor;
  if (!trigger?.enabled || !trigger.webhook_url) return;

  await fireTrigger(trigger.webhook_url, buildPayload('new_visitor', { visitor }));
}

/**
 * Fire the high_intent_visitor trigger.
 * Call this when a visitor with lead_score >= 75 is identified.
 */
export async function fireHighIntentVisitor(userId: string, visitor: VisitorPayload): Promise<void> {
  const config = await getZapierConfig(userId);
  if (!config) return;

  const trigger = config.triggers?.high_intent_visitor;
  if (!trigger?.enabled || !trigger.webhook_url) return;

  await fireTrigger(trigger.webhook_url, buildPayload('high_intent_visitor', { visitor }));
}

/**
 * Fire the new_lead trigger.
 * Call this when a visitor with both email + company is identified (qualified lead).
 */
export async function fireNewLead(userId: string, visitor: VisitorPayload): Promise<void> {
  const config = await getZapierConfig(userId);
  if (!config) return;

  const trigger = config.triggers?.new_lead;
  if (!trigger?.enabled || !trigger.webhook_url) return;

  await fireTrigger(trigger.webhook_url, buildPayload('new_lead', { visitor }));
}

/**
 * Fire the audience_match trigger.
 * Call this when a contact is added to an audience.
 */
export async function fireAudienceMatch(
  userId: string,
  audience: { id: string; name: string },
  contact: { email: string; first_name?: string; last_name?: string; company?: string }
): Promise<void> {
  const config = await getZapierConfig(userId);
  if (!config) return;

  const trigger = config.triggers?.audience_match;
  if (!trigger?.enabled || !trigger.webhook_url) return;

  await fireTrigger(trigger.webhook_url, buildPayload('audience_match', { audience, contact }));
}

/**
 * Fire a specific trigger by name (used by test endpoint).
 */
export async function fireTestTrigger(
  webhookUrl: string,
  trigger: ZapierTrigger
): Promise<{ ok: boolean; status: number }> {
  const sampleData: Record<ZapierTrigger, Record<string, unknown>> = {
    new_visitor: {
      visitor: {
        email: 'jane.smith@acmecorp.com',
        first_name: 'Jane',
        last_name: 'Smith',
        company: 'Acme Corp',
        job_title: 'VP of Marketing',
        city: 'San Francisco',
        state: 'CA',
        country: 'US',
        linkedin_url: 'https://linkedin.com/in/janesmith',
        lead_score: 82,
        total_pageviews: 7,
        total_sessions: 3,
        pixel_domain: 'yoursite.com',
      },
    },
    high_intent_visitor: {
      visitor: {
        email: 'mike.jones@bigcorp.com',
        first_name: 'Mike',
        last_name: 'Jones',
        company: 'BigCorp',
        job_title: 'Head of Sales',
        city: 'Austin',
        state: 'TX',
        country: 'US',
        lead_score: 91,
        total_pageviews: 15,
        total_sessions: 6,
        pixel_domain: 'yoursite.com',
      },
    },
    new_lead: {
      visitor: {
        email: 'sarah.lee@startup.io',
        first_name: 'Sarah',
        last_name: 'Lee',
        company: 'Startup.io',
        job_title: 'CTO',
        city: 'New York',
        state: 'NY',
        country: 'US',
        lead_score: 68,
        total_pageviews: 4,
        total_sessions: 2,
        pixel_domain: 'yoursite.com',
      },
    },
    audience_match: {
      audience: {
        id: 'aud_123',
        name: 'Enterprise Decision Makers',
      },
      contact: {
        email: 'ceo@enterprise.com',
        first_name: 'Alex',
        last_name: 'Carter',
        company: 'Enterprise Co',
      },
    },
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(trigger, sampleData[trigger])),
  });

  return { ok: response.ok, status: response.status };
}
