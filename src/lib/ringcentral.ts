import { createClient } from '@supabase/supabase-js';
import { formatPhoneE164 } from './integrations';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RC_API_BASE = 'https://platform.ringcentral.com';
const RC_SANDBOX_API_BASE = 'https://platform.devtest.ringcentral.com';

function getApiBase(): string {
  return process.env.RINGCENTRAL_SANDBOX === 'true' ? RC_SANDBOX_API_BASE : RC_API_BASE;
}

/**
 * Refresh RingCentral OAuth token if expired. Returns valid access token.
 */
export async function refreshRCTokenIfNeeded(
  userId: string,
  config: Record<string, unknown>
): Promise<string> {
  const accessToken = config.rc_access_token as string | undefined;
  const refreshToken = config.rc_refresh_token as string | undefined;
  const expiresAt = config.rc_token_expires_at as string | undefined;

  if (!accessToken) throw new Error('No RingCentral access token found');

  // If not expired (with 60s buffer), return current token
  if (expiresAt && new Date(expiresAt).getTime() > Date.now() + 60000) {
    return accessToken;
  }

  if (!refreshToken) throw new Error('No refresh token available');

  const clientId = config.client_id as string;
  const clientSecret = config.client_secret as string;

  const resp = await fetch(`${getApiBase()}/restapi/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  const data = await resp.json();
  if (!resp.ok || !data.access_token) {
    throw new Error(`RC token refresh failed: ${data.error_description || data.error || 'Unknown error'}`);
  }

  const newExpiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Update stored tokens
  await supabaseAdmin
    .from('platform_integrations')
    .update({
      config: {
        ...config,
        rc_access_token: data.access_token,
        rc_refresh_token: data.refresh_token || refreshToken,
        rc_token_expires_at: newExpiresAt,
      },
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('platform', 'ringcentral');

  return data.access_token;
}

/**
 * Send an SMS via RingCentral API.
 */
export async function sendSms(
  accessToken: string,
  fromNumber: string,
  toNumber: string,
  text: string
): Promise<{ messageId: string }> {
  const resp = await fetch(`${getApiBase()}/restapi/v1.0/account/~/extension/~/sms`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { phoneNumber: fromNumber },
      to: [{ phoneNumber: toNumber }],
      text,
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`SMS send failed: ${data.message || data.error_description || JSON.stringify(data)}`);
  }

  return { messageId: data.id || data.uri || '' };
}

/**
 * Get available phone numbers from the RingCentral account (SMS-enabled).
 */
export async function getPhoneNumbers(accessToken: string): Promise<{ phoneNumber: string; label: string }[]> {
  const resp = await fetch(
    `${getApiBase()}/restapi/v1.0/account/~/extension/~/phone-number?usageType=DirectNumber&perPage=100`,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    }
  );

  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Failed to fetch phone numbers: ${data.message || JSON.stringify(data)}`);
  }

  const numbers: { phoneNumber: string; label: string }[] = [];
  for (const record of data.records || []) {
    const features = record.features || [];
    if (features.includes('SmsSender')) {
      numbers.push({
        phoneNumber: record.phoneNumber,
        label: record.label || record.phoneNumber,
      });
    }
  }

  return numbers;
}

/**
 * Substitute template variables with visitor data.
 * Supported: {first_name}, {last_name}, {full_name}, {company}, {job_title}, {city}, {state}
 */
export function substituteTemplateVars(
  template: string,
  visitor: Record<string, any>
): string {
  const enrichment = visitor.enrichment_data as Record<string, any> | null;

  const vars: Record<string, string> = {
    first_name: visitor.first_name || enrichment?.FIRST_NAME || '',
    last_name: visitor.last_name || enrichment?.LAST_NAME || '',
    full_name: visitor.full_name || `${visitor.first_name || ''} ${visitor.last_name || ''}`.trim() || '',
    company: visitor.company || enrichment?.COMPANY || '',
    job_title: visitor.job_title || enrichment?.TITLE || '',
    city: visitor.city || enrichment?.PERSONAL_CITY || enrichment?.CITY || '',
    state: visitor.state || enrichment?.PERSONAL_STATE || enrichment?.STATE || '',
  };

  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value);
  }

  return result;
}

/**
 * Extract a phone number from visitor data and format to E.164.
 * Returns null if no valid phone found.
 */
export function extractVisitorPhone(visitor: Record<string, any>): string | null {
  const meta = visitor.metadata as Record<string, any> | null;
  const enrichment = visitor.enrichment_data as Record<string, any> | null;

  const rawPhone = meta?.phone
    || enrichment?.MOBILE_PHONE
    || enrichment?.DIRECT_NUMBER
    || enrichment?.PERSONAL_PHONE
    || enrichment?.ALL_MOBILES?.split(',')[0]
    || visitor.phone
    || '';

  if (!rawPhone || typeof rawPhone !== 'string') return null;

  const cleaned = rawPhone.trim();
  if (!cleaned) return null;

  const formatted = formatPhoneE164(cleaned);
  // Basic validation: must start with + and have at least 10 digits
  const digits = formatted.replace(/\D/g, '');
  if (digits.length < 10) return null;

  return formatted;
}

/**
 * Check if current time is within the template's configured time window.
 */
export function isWithinTimeWindow(filters: Record<string, any>): boolean {
  const start = filters.time_window_start as string | undefined;
  const end = filters.time_window_end as string | undefined;
  const tz = filters.time_window_tz as string || 'America/New_York';

  if (!start || !end) return true; // No window configured = always OK

  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: tz,
    });

    const currentTime = formatter.format(now); // "HH:MM"
    return currentTime >= start && currentTime <= end;
  } catch {
    return true; // If timezone is invalid, allow sending
  }
}
