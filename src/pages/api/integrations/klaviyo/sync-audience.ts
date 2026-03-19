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

interface KlaviyoProfile {
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

function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('+')) return phone;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return phone;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { audience_id, list_id, create_new_list, new_list_name } = req.body;

  if (!audience_id) {
    return res.status(400).json({ error: 'audience_id is required' });
  }

  // Get Klaviyo integration
  const { data: rawIntegration } = await supabaseAdmin
    .from('platform_integrations')
    .select('api_key, config')
    .eq('user_id', user.id)
    .eq('platform', 'klaviyo')
    .eq('is_connected', true)
    .single();
  const integration = rawIntegration ? {
    api_key: rawIntegration.api_key,
    default_list_id: ((rawIntegration.config || {}) as Record<string, unknown>).default_list_id as string | null,
  } : null;

  if (!integration) {
    return res.status(400).json({ error: 'Klaviyo not connected' });
  }

  try {
    let targetListId = list_id || integration.default_list_id;

    // Create a new list if requested
    if (create_new_list && new_list_name) {
      const createListResponse = await fetch('https://a.klaviyo.com/api/lists', {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${integration.api_key}`,
          'accept': 'application/json',
          'content-type': 'application/json',
          'revision': '2024-10-15',
        },
        body: JSON.stringify({
          data: {
            type: 'list',
            attributes: { name: new_list_name },
          },
        }),
      });

      if (!createListResponse.ok) {
        const errorData = await createListResponse.json().catch(() => null);
        return res.status(400).json({
          error: errorData?.errors?.[0]?.detail || 'Failed to create Klaviyo list',
        });
      }

      const listData = await createListResponse.json();
      targetListId = listData.data.id;
    }

    if (!targetListId) {
      return res.status(400).json({ error: 'No list selected. Please select a list or create a new one.' });
    }

    // Fetch audience contacts
    const { data: contacts, error: contactsError } = await supabaseAdmin
      .from('audience_contacts')
      .select('email, first_name, last_name, full_name, company, job_title, phone, city, state, country, linkedin_url, seniority, department, data')
      .eq('audience_id', audience_id)
      .not('email', 'is', null)
      .limit(10000);

    if (contactsError) {
      return res.status(500).json({ error: 'Failed to fetch audience contacts' });
    }

    if (!contacts || contacts.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No contacts with email found in this audience' });
    }

    // Transform to Klaviyo profiles (filter out invalid emails)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const profiles: KlaviyoProfile[] = contacts
      .filter((c) => {
        if (!c.email) return false;
        // Handle comma-separated emails - take the first valid one
        const firstEmail = c.email.split(',')[0].trim();
        return emailRegex.test(firstEmail);
      })
      .map((contact) => {
        const email = contact.email!.split(',')[0].trim();
        const formattedPhone = contact.phone ? formatPhoneE164(contact.phone) : undefined;
        return {
        type: 'profile' as const,
        attributes: {
          email,
          first_name: contact.first_name || (contact.full_name ? contact.full_name.split(' ')[0] : undefined),
          last_name: contact.last_name || (contact.full_name ? contact.full_name.split(' ').slice(1).join(' ') : undefined),
          organization: contact.company || undefined,
          title: contact.job_title || undefined,
          phone_number: formattedPhone,
          location: {
            city: contact.city || undefined,
            region: contact.state || undefined,
            country: contact.country || undefined,
          },
          properties: {
            source: 'Traffic AI Audience',
            audience_id,
            linkedin_url: contact.linkedin_url || undefined,
            seniority: contact.seniority || undefined,
            department: contact.department || undefined,
          },
          subscriptions: {
            email: { marketing: { consent: 'SUBSCRIBED' as const } },
            ...(formattedPhone ? { sms: { marketing: { consent: 'SUBSCRIBED' as const } } } : {}),
          },
        },
      };
      });

    // Bulk import to Klaviyo in batches of 100
    const batchSize = 100;
    const jobIds: string[] = [];

    for (let i = 0; i < profiles.length; i += batchSize) {
      const batch = profiles.slice(i, i + batchSize);

      const importResponse = await fetch('https://a.klaviyo.com/api/profile-bulk-import-jobs', {
        method: 'POST',
        headers: {
          'Authorization': `Klaviyo-API-Key ${integration.api_key}`,
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
                data: [{ type: 'list', id: targetListId }],
              },
            },
          },
        }),
      });

      if (!importResponse.ok) {
        const errorData = await importResponse.json().catch(() => null);
        console.error('Klaviyo bulk import error:', errorData);
        throw new Error(errorData?.errors?.[0]?.detail || 'Failed to import contacts to Klaviyo');
      }

      const importData = await importResponse.json();
      if (importData.data?.id) {
        jobIds.push(importData.data.id);
      }
    }

    // Update last synced
    await supabaseAdmin
      .from('platform_integrations')
      .update({ last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('platform', 'klaviyo');

    await logEvent({
      type: 'api',
      event_name: 'klaviyo_sync_audience',
      status: 'success',
      message: `Synced ${profiles.length} audience contacts to Klaviyo list`,
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      request_data: { audience_id, list_id: targetListId },
      response_data: { synced: profiles.length, jobs: jobIds },
    });

    return res.status(200).json({
      success: true,
      synced: profiles.length,
      list_id: targetListId,
      jobs: jobIds,
      message: `${profiles.length} contacts queued for sync to Klaviyo`,
    });
  } catch (error) {
    console.error('Error syncing audience to Klaviyo:', error);

    await logEvent({
      type: 'api',
      event_name: 'klaviyo_sync_audience',
      status: 'error',
      message: 'Failed to sync audience to Klaviyo',
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      request_data: { audience_id },
      error_details: (error as Error).message,
    });

    return res.status(500).json({ error: (error as Error).message || 'Failed to sync audience to Klaviyo' });
  }
}
