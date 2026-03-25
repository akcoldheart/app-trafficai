import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type PlatformType = 'hubspot' | 'slack' | 'zapier' | 'salesforce' | 'shopify' | 'mailchimp' | 'pipedrive' | 'activecampaign' | 'facebook' | 'linkedin' | 'ringcentral' | 'google_ads';

export interface PlatformIntegration {
  id: string;
  user_id: string;
  platform: PlatformType;
  api_key: string | null;
  webhook_url: string | null;
  config: Record<string, unknown>;
  is_connected: boolean;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getIntegration(userId: string, platform: PlatformType): Promise<PlatformIntegration | null> {
  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', platform)
    .eq('is_connected', true)
    .single();
  return data as PlatformIntegration | null;
}

export async function getIntegrationStatus(userId: string, platform: PlatformType) {
  const { data, error } = await supabaseAdmin
    .from('platform_integrations')
    .select('id, platform, is_connected, config, last_synced_at, created_at, updated_at')
    .eq('user_id', userId)
    .eq('platform', platform)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

export async function saveIntegration(
  userId: string,
  platform: PlatformType,
  data: Partial<PlatformIntegration>
) {
  const { data: result, error } = await supabaseAdmin
    .from('platform_integrations')
    .upsert(
      {
        user_id: userId,
        platform,
        ...data,
        is_connected: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,platform' }
    )
    .select('id, platform, is_connected, config, last_synced_at, created_at, updated_at')
    .single();

  if (error) throw error;
  return result;
}

export async function updateIntegrationConfig(
  userId: string,
  platform: PlatformType,
  config: Record<string, unknown>
) {
  const { data, error } = await supabaseAdmin
    .from('platform_integrations')
    .update({
      config,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', platform)
    .select('id, platform, is_connected, config, last_synced_at, created_at, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function updateLastSynced(userId: string, platform: PlatformType) {
  await supabaseAdmin
    .from('platform_integrations')
    .update({
      last_synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', platform);
}

export async function disconnectIntegration(userId: string, platform: PlatformType) {
  const { error } = await supabaseAdmin
    .from('platform_integrations')
    .delete()
    .eq('user_id', userId)
    .eq('platform', platform);

  if (error) throw error;
}

export async function getAllIntegrationStatuses(userId: string) {
  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('platform, is_connected, last_synced_at')
    .eq('user_id', userId)
    .eq('is_connected', true);
  return data || [];
}

// Shared data fetching for sync operations

export async function getVisitorsForSync(userId: string, pixelId?: string) {
  // Paginate to fetch ALL visitors (Supabase caps at 1000 rows per request)
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;

  while (true) {
    let query = supabaseAdmin
      .from('visitors')
      .select('email, first_name, last_name, full_name, company, job_title, city, state, country, linkedin_url, lead_score, total_pageviews, total_sessions, first_seen_at, last_seen_at, metadata, enrichment_data')
      .eq('user_id', userId)
      .not('email', 'is', null);

    if (pixelId) {
      query = query.eq('pixel_id', pixelId);
    }

    const { data: page, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!page || page.length === 0) break;

    allData = allData.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}

export async function getAudienceContactsForSync(audienceId: string) {
  const PAGE_SIZE = 1000;
  let allData: any[] = [];
  let from = 0;

  while (true) {
    const { data: page, error } = await supabaseAdmin
      .from('audience_contacts')
      .select('email, first_name, last_name, full_name, company, job_title, phone, city, state, country, linkedin_url, seniority, department, data')
      .eq('audience_id', audienceId)
      .not('email', 'is', null)
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;
    if (!page || page.length === 0) break;

    allData = allData.concat(page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allData;
}

// Shared utilities

export function formatPhoneE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (phone.startsWith('+')) return phone;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return phone;
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function cleanEmail(email: string): string {
  return email.split(',')[0].trim();
}

export function parseFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
  };
}
