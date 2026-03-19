import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';

export const config = {
  maxDuration: 300,
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface KlaviyoProfile {
  type: 'profile';
  attributes: {
    email?: string;
    first_name?: string;
    last_name?: string;
    organization?: string;
    title?: string;
    phone_number?: string;
    location?: {
      city?: string;
      region?: string;
      country?: string;
    };
    properties?: Record<string, unknown>;
    subscriptions?: {
      email?: { marketing: { consent: 'SUBSCRIBED' | 'UNSUBSCRIBED' } };
      sms?: { marketing: { consent: 'SUBSCRIBED' | 'UNSUBSCRIBED' } };
    };
  };
}

// Format phone to E.164 format for Klaviyo (e.g. "858-405-7845" -> "+18584057845")
export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('+')) return phone;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return phone; // return as-is if we can't determine format
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
  const config = (data.config || {}) as Record<string, unknown>;
  return { api_key: data.api_key, default_list_id: config.default_list_id as string | null };
}

export async function addProfilesToKlaviyo(apiKey: string, listId: string, profiles: KlaviyoProfile[]) {
  // Step 1: Create/update profiles in batches of 100 (Klaviyo limit)
  const batchSize = 100;
  const profileIds: string[] = [];

  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);

    const importResponse = await fetch('https://a.klaviyo.com/api/profile-bulk-import-jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Klaviyo-API-Key ${apiKey}`,
        'accept': 'application/json',
        'content-type': 'application/json',
        'revision': '2024-10-15',
      },
      body: JSON.stringify({
        data: {
          type: 'profile-bulk-import-job',
          attributes: {
            profiles: {
              data: batch,
            },
          },
          relationships: {
            lists: {
              data: [{ type: 'list', id: listId }],
            },
          },
        },
      }),
    });

    if (!importResponse.ok) {
      const errorData = await importResponse.json().catch(() => null);
      console.error('Klaviyo bulk import error:', errorData);
      throw new Error(errorData?.errors?.[0]?.detail || 'Failed to import profiles to Klaviyo');
    }

    const importData = await importResponse.json();
    if (importData.data?.id) {
      profileIds.push(importData.data.id);
    }
  }

  return profileIds;
}

/**
 * Core sync logic — used by both the manual endpoint and the cron auto-sync.
 * When `since` is provided, only visitors created or updated after that timestamp are synced (incremental).
 * When `since` is null (manual sync), all visitors are synced (full sync).
 */
export async function syncVisitorsForUser(
  userId: string,
  apiKey: string,
  listId: string,
  pixelId?: string | null,
  since?: string | null
): Promise<{ synced: number; jobs: string[] }> {
  // Paginate to fetch visitors (Supabase caps at 1000 rows per request)
  const PAGE_SIZE = 1000;
  let allVisitors: any[] = [];
  let from = 0;

  while (true) {
    let query = supabaseAdmin
      .from('visitors')
      .select('email, first_name, last_name, full_name, company, job_title, city, state, country, linkedin_url, lead_score, total_pageviews, total_sessions, first_seen_at, last_seen_at, metadata')
      .eq('user_id', userId)
      .not('email', 'is', null);

    if (pixelId) {
      query = query.eq('pixel_id', pixelId);
    }

    // Incremental: only fetch visitors created since last sync
    // Note: we use created_at (not updated_at) because the visitor API fetcher
    // updates all existing visitors' updated_at on every run, which would cause
    // a full re-sync every time. New visitors from the fetcher trigger an immediate
    // sync directly, so the cron only needs to catch any that were missed.
    if (since) {
      query = query.gt('created_at', since);
    }

    const { data: page, error: visitorsError } = await query
      .range(from, from + PAGE_SIZE - 1);

    if (visitorsError) throw visitorsError;
    if (!page || page.length === 0) break;

    allVisitors = allVisitors.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const visitors = allVisitors;
  if (visitors.length === 0) return { synced: 0, jobs: [] };

  const profiles: KlaviyoProfile[] = visitors
    .filter((v) => v.email)
    .map((visitor) => {
      const meta = visitor.metadata as Record<string, unknown> | null;
      const phone = meta?.phone || meta?.PHONE || meta?.Phone || meta?.phone_number || meta?.MOBILE_PHONE || undefined;

      const formattedPhone = phone ? formatPhoneE164(String(phone)) : undefined;

      return {
        type: 'profile' as const,
        attributes: {
          email: visitor.email!,
          first_name: visitor.first_name || (visitor.full_name ? visitor.full_name.split(' ')[0] : undefined),
          last_name: visitor.last_name || (visitor.full_name ? visitor.full_name.split(' ').slice(1).join(' ') : undefined),
          organization: visitor.company || undefined,
          title: visitor.job_title || undefined,
          phone_number: formattedPhone,
          location: {
            city: visitor.city || undefined,
            region: visitor.state || undefined,
            country: visitor.country || undefined,
          },
          properties: {
            source: 'Traffic AI',
            linkedin_url: visitor.linkedin_url || undefined,
            lead_score: visitor.lead_score || undefined,
            total_pageviews: visitor.total_pageviews || undefined,
            total_sessions: visitor.total_sessions || undefined,
            first_seen_at: visitor.first_seen_at || undefined,
            last_seen_at: visitor.last_seen_at || undefined,
          },
          subscriptions: {
            email: { marketing: { consent: 'SUBSCRIBED' as const } },
            ...(formattedPhone ? { sms: { marketing: { consent: 'SUBSCRIBED' as const } } } : {}),
          },
        },
      };
    });

  const jobIds = await addProfilesToKlaviyo(apiKey, listId, profiles);

  // Update last synced timestamp
  await supabaseAdmin
    .from('platform_integrations')
    .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('platform', 'klaviyo');

  return { synced: profiles.length, jobs: jobIds };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { pixel_id, list_id } = req.body;

  const integration = await getKlaviyoIntegration(user.id);
  if (!integration) {
    return res.status(400).json({ error: 'Klaviyo not connected' });
  }

  const targetListId = list_id || integration.default_list_id;
  if (!targetListId) {
    return res.status(400).json({ error: 'No Klaviyo list selected. Please select a default list or specify a list_id.' });
  }

  try {
    const result = await syncVisitorsForUser(user.id, integration.api_key, targetListId, pixel_id);

    await logEvent({
      type: 'api',
      event_name: 'klaviyo_sync_visitors',
      status: 'success',
      message: `Synced ${result.synced} visitors to Klaviyo list`,
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      request_data: { pixel_id: pixel_id || 'all', list_id: targetListId },
      response_data: { synced: result.synced, jobs: result.jobs },
    });

    return res.status(200).json({
      success: true,
      synced: result.synced,
      jobs: result.jobs,
      message: `${result.synced} visitors queued for sync to Klaviyo`,
    });
  } catch (error) {
    console.error('Error syncing visitors to Klaviyo:', error);

    await logEvent({
      type: 'api',
      event_name: 'klaviyo_sync_visitors',
      status: 'error',
      message: 'Failed to sync visitors to Klaviyo',
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      request_data: { pixel_id: pixel_id || 'all' },
      error_details: (error as Error).message,
    });

    return res.status(500).json({ error: (error as Error).message || 'Failed to sync visitors to Klaviyo' });
  }
}
