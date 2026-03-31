import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';
import { getZeroBounceConfig, isEmailSyncable, verifyAndUpdateVisitors } from '@/lib/email-verification';

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
  const batchSize = 100;
  const profileIds: string[] = [];
  const headers = {
    'Authorization': `Klaviyo-API-Key ${apiKey}`,
    'accept': 'application/json',
    'content-type': 'application/json',
    'revision': '2024-10-15',
  };

  // Step 1: Import profiles (without subscriptions — Klaviyo doesn't allow it in bulk import)
  for (let i = 0; i < profiles.length; i += batchSize) {
    const batch = profiles.slice(i, i + batchSize);

    // Strip subscriptions from profile attributes before sending
    const cleanBatch = batch.map(p => ({
      ...p,
      attributes: { ...p.attributes, subscriptions: undefined },
    }));

    const importResponse = await fetch('https://a.klaviyo.com/api/profile-bulk-import-jobs', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        data: {
          type: 'profile-bulk-import-job',
          attributes: {
            profiles: {
              data: cleanBatch,
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

  // Step 2: Subscribe profiles to email/SMS via the subscription bulk create endpoint
  const emailProfiles = profiles.filter(p => p.attributes.email);
  const smsProfiles = profiles.filter(p => p.attributes.phone_number);

  // Subscribe emails in batches
  for (let i = 0; i < emailProfiles.length; i += batchSize) {
    const batch = emailProfiles.slice(i, i + batchSize);
    try {
      await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: {
            type: 'profile-subscription-bulk-create-job',
            attributes: {
              custom_source: 'Traffic AI',
              profiles: {
                data: batch.map(p => ({
                  type: 'profile',
                  attributes: {
                    email: p.attributes.email,
                    subscriptions: {
                      email: { marketing: { consent: 'SUBSCRIBED' } },
                    },
                  },
                })),
              },
            },
            relationships: {
              list: {
                data: { type: 'list', id: listId },
              },
            },
          },
        }),
      });
    } catch (err) {
      console.error('Klaviyo email subscription error:', err);
    }
  }

  // Subscribe SMS in batches (only profiles with phone numbers)
  if (smsProfiles.length > 0) {
    for (let i = 0; i < smsProfiles.length; i += batchSize) {
      const batch = smsProfiles.slice(i, i + batchSize);
      try {
        await fetch('https://a.klaviyo.com/api/profile-subscription-bulk-create-jobs', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            data: {
              type: 'profile-subscription-bulk-create-job',
              attributes: {
                custom_source: 'Traffic AI',
                profiles: {
                  data: batch.map(p => ({
                    type: 'profile',
                    attributes: {
                      phone_number: p.attributes.phone_number,
                      subscriptions: {
                        sms: { marketing: { consent: 'SUBSCRIBED' } },
                      },
                    },
                  })),
                },
              },
              relationships: {
                list: {
                  data: { type: 'list', id: listId },
                },
              },
            },
          }),
        });
      } catch (err) {
        console.error('Klaviyo SMS subscription error:', err);
      }
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
): Promise<{ synced: number; jobs: string[]; filtered?: number }> {
  // Check ZeroBounce config for email filtering (null = not connected, skip all ZB logic)
  const zbConfig = await getZeroBounceConfig(userId);
  const verifyOnSync = zbConfig ? zbConfig.verify_on_sync !== false : false;

  // Paginate to fetch visitors (Supabase caps at 1000 rows per request)
  const PAGE_SIZE = 1000;
  let allVisitors: any[] = [];
  let from = 0;

  while (true) {
    let query = supabaseAdmin
      .from('visitors')
      .select('id, email, first_name, last_name, full_name, company, job_title, city, state, country, linkedin_url, lead_score, total_pageviews, total_sessions, first_seen_at, last_seen_at, metadata, email_status, email_verified_at')
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

  // If ZeroBounce is configured and verify_on_sync is enabled,
  // verify any unverified emails before filtering
  if (zbConfig && verifyOnSync) {
    const unverified = visitors.filter((v: any) => v.email && !v.email_verified_at);
    if (unverified.length > 0) {
      try {
        await verifyAndUpdateVisitors(
          unverified.map((v: any) => ({ id: v.id, email: v.email })),
          userId
        );
        // Re-fetch email_status for the verified visitors
        const { data: refreshed } = await supabaseAdmin
          .from('visitors')
          .select('id, email_status')
          .in('id', unverified.map((v: any) => v.id));
        if (refreshed) {
          const statusMap = new Map(refreshed.map(r => [r.id, r.email_status]));
          for (const v of visitors) {
            if (statusMap.has(v.id)) {
              v.email_status = statusMap.get(v.id);
            }
          }
        }
      } catch (zbErr) {
        console.error('[klaviyo-sync] ZeroBounce verification error during sync:', (zbErr as Error).message);
      }
    }
  }

  // Filter visitors by email verification status (if ZeroBounce is configured)
  const totalWithEmail = visitors.filter((v: any) => v.email).length;
  const filteredVisitors = zbConfig
    ? visitors.filter((v: any) => v.email && isEmailSyncable(v.email_status, zbConfig))
    : visitors.filter((v: any) => v.email);
  const filteredCount = totalWithEmail - filteredVisitors.length;

  if (filteredCount > 0) {
    console.log(`[klaviyo-sync] Filtered out ${filteredCount} visitors with invalid emails (ZeroBounce)`);
  }

  if (filteredVisitors.length === 0) return { synced: 0, jobs: [], filtered: filteredCount };

  const profiles: KlaviyoProfile[] = filteredVisitors
    .map((visitor: any) => {
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

  return { synced: profiles.length, jobs: jobIds, filtered: filteredCount };
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
      message: `Synced ${result.synced} visitors to Klaviyo list${result.filtered ? ` (${result.filtered} filtered by email verification)` : ''}`,
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      request_data: { pixel_id: pixel_id || 'all', list_id: targetListId },
      response_data: { synced: result.synced, jobs: result.jobs, filtered: result.filtered || 0 },
    });

    return res.status(200).json({
      success: true,
      synced: result.synced,
      filtered: result.filtered || 0,
      jobs: result.jobs,
      message: `${result.synced} visitors queued for sync to Klaviyo${result.filtered ? `, ${result.filtered} filtered by email verification` : ''}`,
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
