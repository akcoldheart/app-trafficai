import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ZEROBOUNCE_API_BASE = 'https://api.zerobounce.net/v2';

// Statuses that are safe to send to Klaviyo/email platforms
export const SAFE_EMAIL_STATUSES = ['valid', 'catch-all'];

// Statuses that should never be sent
export const BLOCKED_EMAIL_STATUSES = ['invalid', 'spamtrap', 'abuse', 'do_not_mail'];

export interface ZeroBounceResult {
  address: string;
  status: string;
  sub_status: string;
  free_email: boolean;
  did_you_mean: string | null;
  account: string;
  domain: string;
  domain_age_days: string;
  smtp_provider: string;
  mx_found: string;
  mx_record: string;
  firstname: string;
  lastname: string;
  gender: string;
  country: string | null;
  region: string | null;
  city: string | null;
  zipcode: string | null;
  processed_at: string;
  error?: string;
}

export interface ZeroBounceCredits {
  Credits: string;
}

/**
 * Get the ZeroBounce API key for a given user.
 * Falls back to the global admin key from platform_integrations if no user-specific key exists.
 */
export async function getZeroBounceApiKey(userId?: string): Promise<string | null> {
  // Try user-specific key first
  if (userId) {
    const { data } = await supabaseAdmin
      .from('platform_integrations')
      .select('api_key')
      .eq('user_id', userId)
      .eq('platform', 'zerobounce')
      .eq('is_connected', true)
      .single();
    if (data?.api_key) return data.api_key;
  }

  // Fall back to any connected ZeroBounce integration (admin-configured global key)
  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('api_key')
    .eq('platform', 'zerobounce')
    .eq('is_connected', true)
    .limit(1)
    .single();

  return data?.api_key || null;
}

/**
 * Get ZeroBounce config for a user (or global).
 */
export async function getZeroBounceConfig(userId?: string): Promise<Record<string, unknown> | null> {
  if (userId) {
    const { data } = await supabaseAdmin
      .from('platform_integrations')
      .select('config')
      .eq('user_id', userId)
      .eq('platform', 'zerobounce')
      .eq('is_connected', true)
      .single();
    if (data) return (data.config || {}) as Record<string, unknown>;
  }

  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('config')
    .eq('platform', 'zerobounce')
    .eq('is_connected', true)
    .limit(1)
    .single();

  return data ? ((data.config || {}) as Record<string, unknown>) : null;
}

/**
 * Check remaining ZeroBounce credits.
 */
export async function getZeroBounceCredits(apiKey: string): Promise<number> {
  const response = await fetch(`${ZEROBOUNCE_API_BASE}/getcredits?api_key=${encodeURIComponent(apiKey)}`);
  if (!response.ok) throw new Error('Failed to fetch ZeroBounce credits');
  const data: ZeroBounceCredits = await response.json();
  const credits = parseInt(data.Credits, 10);
  if (credits === -1) throw new Error('Invalid ZeroBounce API key');
  return credits || 0;
}

/**
 * Verify a single email via ZeroBounce.
 */
export async function verifySingleEmail(apiKey: string, email: string, ipAddress = ''): Promise<ZeroBounceResult> {
  const params = new URLSearchParams({
    api_key: apiKey,
    email: email,
    ip_address: ipAddress,
  });

  const response = await fetch(`${ZEROBOUNCE_API_BASE}/validate?${params}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ZeroBounce API error: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * Verify a batch of emails via ZeroBounce.
 * ZeroBounce batch API is async — it returns a file_id that you poll for results.
 * For real-time use, we use the single endpoint in parallel with rate limiting.
 */
export async function verifyEmailBatch(
  apiKey: string,
  emails: string[],
  concurrency = 5,
  delayMs = 200,
): Promise<Map<string, ZeroBounceResult>> {
  const results = new Map<string, ZeroBounceResult>();
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < emails.length; i += concurrency) {
    const batch = emails.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(email => verifySingleEmail(apiKey, email))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const email = batch[j];
      if (result.status === 'fulfilled') {
        results.set(email, result.value);
      } else {
        results.set(email, {
          address: email,
          status: 'unknown',
          sub_status: 'api_error',
          free_email: false,
          did_you_mean: null,
          account: '',
          domain: '',
          domain_age_days: '',
          smtp_provider: '',
          mx_found: '',
          mx_record: '',
          firstname: '',
          lastname: '',
          gender: '',
          country: null,
          region: null,
          city: null,
          zipcode: null,
          processed_at: new Date().toISOString(),
          error: (result.reason as Error).message,
        });
      }
    }

    // Rate limit delay between batches
    if (i + concurrency < emails.length) {
      await sleep(delayMs);
    }
  }

  return results;
}

/**
 * Verify emails for a list of visitor records and update the DB.
 * Returns count of verified emails.
 */
export async function verifyAndUpdateVisitors(
  visitors: Array<{ id: string; email: string }>,
  userId?: string,
): Promise<{ verified: number; valid: number; invalid: number; unknown: number }> {
  const apiKey = await getZeroBounceApiKey(userId);
  if (!apiKey) {
    console.warn('[email-verification] No ZeroBounce API key configured, skipping verification');
    return { verified: 0, valid: 0, invalid: 0, unknown: 0 };
  }

  // Check credits before verifying
  const credits = await getZeroBounceCredits(apiKey);
  if (credits < visitors.length) {
    console.warn(`[email-verification] Insufficient ZeroBounce credits: ${credits} available, ${visitors.length} needed`);
    await logEvent({
      type: 'api',
      event_name: 'zerobounce_low_credits',
      status: 'warning',
      message: `ZeroBounce credits low: ${credits} available, ${visitors.length} needed. Verifying ${credits} emails only.`,
      user_id: userId,
      response_data: { credits_available: credits, emails_requested: visitors.length },
    });
    // Verify as many as we can afford
    visitors = visitors.slice(0, credits);
  }

  if (visitors.length === 0) return { verified: 0, valid: 0, invalid: 0, unknown: 0 };

  const emails = visitors.map(v => v.email);
  const results = await verifyEmailBatch(apiKey, emails);

  let valid = 0;
  let invalid = 0;
  let unknown = 0;
  const now = new Date().toISOString();

  // Update visitors in batches of 50
  const BATCH_SIZE = 50;
  for (let i = 0; i < visitors.length; i += BATCH_SIZE) {
    const batch = visitors.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (visitor) => {
        const result = results.get(visitor.email);
        if (!result) return;

        const status = result.status.toLowerCase();
        if (SAFE_EMAIL_STATUSES.includes(status)) valid++;
        else if (BLOCKED_EMAIL_STATUSES.includes(status)) invalid++;
        else unknown++;

        await supabaseAdmin
          .from('visitors')
          .update({
            email_status: status,
            email_sub_status: result.sub_status || null,
            email_verified_at: now,
          })
          .eq('id', visitor.id);
      })
    );
  }

  return { verified: visitors.length, valid, invalid, unknown };
}

/**
 * Check if an email should be synced to Klaviyo based on its verification status.
 * If email hasn't been verified yet, it's allowed through (verify-on-sync will catch it).
 * Config option `allow_catch_all` controls whether catch-all emails are allowed.
 */
export function isEmailSyncable(emailStatus: string | null, config?: Record<string, unknown>): boolean {
  // Not yet verified — allow through (will be verified on next batch)
  if (!emailStatus) return true;

  const status = emailStatus.toLowerCase();

  // Always block known-bad statuses
  if (BLOCKED_EMAIL_STATUSES.includes(status)) return false;

  // Valid is always allowed
  if (status === 'valid') return true;

  // Catch-all: configurable (default: allow)
  if (status === 'catch-all') {
    return config?.allow_catch_all !== false;
  }

  // Unknown: configurable (default: allow — will retry verification later)
  if (status === 'unknown') {
    return config?.allow_unknown !== false;
  }

  return true;
}
