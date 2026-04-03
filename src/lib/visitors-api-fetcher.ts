import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ApiContact {
  // Identity fields (old format: UUID, new format: EDID)
  UUID?: string;
  EDID?: string;
  FIRST_NAME?: string;
  LAST_NAME?: string;
  PERSONAL_VERIFIED_EMAILS?: string;
  PERSONAL_EMAILS?: string;
  BUSINESS_EMAIL?: string;
  BUSINESS_VERIFIED_EMAILS?: string;
  COMPANY_NAME?: string;
  JOB_TITLE?: string;
  HEADLINE?: string;
  COMPANY_LINKEDIN_URL?: string;
  LINKEDIN_URL?: string;
  INDIVIDUAL_LINKEDIN_URL?: string;
  INDIVIDUAL_FACEBOOK_URL?: string;
  INDIVIDUAL_TWITTER_URL?: string;
  PERSONAL_CITY?: string;
  PERSONAL_STATE?: string;
  PERSONAL_ADDRESS?: string;
  PERSONAL_ZIP?: string;
  CITY?: string;
  STATE?: string;
  COUNTRY?: string;
  IP_ADDRESS?: string;
  URL?: string;
  FULL_URL?: string;
  REFERRER_URL?: string;
  MOBILE_PHONE?: string;
  DIRECT_NUMBER?: string;
  PERSONAL_PHONE?: string;
  ALL_MOBILES?: string;
  ALL_LANDLINES?: string;
  GENDER?: string;
  AGE_RANGE?: string;
  INCOME_RANGE?: string;
  SENIORITY_LEVEL?: string;
  DEPARTMENT?: string;
  COMPANY_INDUSTRY?: string;
  COMPANY_EMPLOYEE_COUNT?: string;
  COMPANY_REVENUE?: string;
  COMPANY_DOMAIN?: string;
  COMPANY_DESCRIPTION?: string;
  COMPANY_ADDRESS?: string;
  COMPANY_CITY?: string;
  COMPANY_STATE?: string;
  COMPANY_ZIP?: string;
  HOMEOWNER?: string;
  MARRIED?: string;
  CHILDREN?: string;
  NET_WORTH?: string;
  // Old format event fields
  EVENT_TYPE?: string;
  EVENT_DATA?: string;
  EVENT_TIMESTAMP?: string;
  ACTIVITY_START_DATE?: string;
  ACTIVITY_END_DATE?: string;
  // New format event fields
  EVENT_DATE?: string;
  PIXEL_ID?: string;
  resolution?: Record<string, string | null | undefined>;
  [key: string]: unknown;
}

interface PixelForFetch {
  id: string;
  user_id: string;
  visitors_api_url: string;
  visitors_api_last_fetched_at?: string | null;
}

function getFirstValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const items = value.split(',').map(v => v.trim()).filter(Boolean);
  return items[0] || null;
}

function getEmail(contact: ApiContact): string | null {
  return getFirstValue(contact.PERSONAL_VERIFIED_EMAILS as string)
    || getFirstValue(contact.PERSONAL_EMAILS as string)
    || getFirstValue(contact.BUSINESS_EMAIL as string);
}

function getPhone(contact: ApiContact): string | null {
  return getFirstValue(contact.MOBILE_PHONE as string)
    || getFirstValue(contact.ALL_MOBILES as string)
    || getFirstValue(contact.DIRECT_NUMBER as string)
    || getFirstValue(contact.PERSONAL_PHONE as string)
    || getFirstValue(contact.ALL_LANDLINES as string);
}

async function getApiKey(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('user_api_keys')
    .select('api_key')
    .limit(1)
    .single();
  return data?.api_key || null;
}

function buildHeaders(apiUrl: string, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  const parsedUrl = new URL(apiUrl);
  if (parsedUrl.hostname.includes('audiencelab.io')) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  headers['X-API-Key'] = apiKey;
  return headers;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function getEventTimestamp(contact: ApiContact): string | null {
  const ts = contact.EVENT_TIMESTAMP as string || contact.EVENT_DATE as string || contact.ACTIVITY_START_DATE as string;
  return ts || null;
}

// Check if any contact in the batch has an EVENT_TIMESTAMP older than the cutoff
function hasReachedCutoff(contacts: ApiContact[], cutoffIso: string): boolean {
  for (const contact of contacts) {
    const ts = getEventTimestamp(contact);
    if (ts && ts < cutoffIso) return true;
  }
  return false;
}

// Return only contacts with EVENT_TIMESTAMP newer than the cutoff
function filterNewContacts(contacts: ApiContact[], cutoffIso: string): ApiContact[] {
  return contacts.filter(contact => {
    const ts = getEventTimestamp(contact);
    if (!ts) return true; // keep records without timestamps
    return ts >= cutoffIso;
  });
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry on rate limits (429) and server errors (500, 502, 503, 504)
      const isRetryable = response.status === 429 || (response.status >= 500 && response.status <= 504);

      if (isRetryable) {
        if (attempt === maxRetries) return response;
        // Exponential backoff: 2s, 4s, 8s
        const backoff = Math.pow(2, attempt + 1) * 1000;
        console.warn(`[visitors-api-fetcher] Got ${response.status}, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(backoff);
        continue;
      }

      return response;
    } catch (fetchErr) {
      // Network errors (DNS, timeout, etc.) — retry
      if (attempt === maxRetries) throw fetchErr;
      const backoff = Math.pow(2, attempt + 1) * 1000;
      console.warn(`[visitors-api-fetcher] Network error, retrying in ${backoff}ms (attempt ${attempt + 1}/${maxRetries}):`, (fetchErr as Error).message);
      await sleep(backoff);
    }
  }
  // Should never reach here, but just in case
  return fetch(url, options);
}

function extractContacts(data: Record<string, unknown>): ApiContact[] {
  const raw = data.Data || data.data || data.records || data.contacts || [];
  return (Array.isArray(raw) ? raw : []) as ApiContact[];
}

function getContactUuid(contact: ApiContact): string | null {
  // Try multiple possible ID field names (old format: UUID, new format: EDID)
  const raw = contact.UUID || contact.EDID || contact.uuid || contact.edid
    || contact.Id || contact.id || contact.ID
    || (contact.resolution as Record<string, string | null | undefined> | undefined)?.uuid;
  if (!raw || typeof raw !== 'string') return null;
  return raw.trim() || null;
}

// Group contacts by UUID and aggregate events into a single visitor row
function aggregateContactEvents(contacts: ApiContact[], pixelId: string, userId: string) {
  // Group all event records by UUID
  const grouped = new Map<string, ApiContact[]>();
  let skippedNoUuid = 0;
  for (const contact of contacts) {
    const uuid = getContactUuid(contact);
    if (!uuid) {
      skippedNoUuid++;
      console.warn(`[visitors-api-fetcher] Skipping contact without UUID/EDID. Available keys: ${Object.keys(contact).slice(0, 15).join(', ')}`);
      continue;
    }
    const existing = grouped.get(uuid) || [];
    existing.push(contact);
    grouped.set(uuid, existing);
  }
  if (skippedNoUuid > 0) {
    console.warn(`[visitors-api-fetcher] Skipped ${skippedNoUuid}/${contacts.length} contacts without UUID/EDID`);
  }

  const now = new Date().toISOString();
  const results: ReturnType<typeof mapGroupToVisitor>[] = [];

  grouped.forEach((events, uuid) => {
    const row = mapGroupToVisitor(uuid, events, pixelId, userId, now);
    if (row) results.push(row);
  });

  return results;
}

function mapGroupToVisitor(
  uuid: string,
  events: ApiContact[],
  pixelId: string,
  userId: string,
  now: string,
) {
  // Use the first record for personal/company data (all events share the same contact info)
  const primary = events[0];
  const get = (field: string) => {
    const val = (primary[field] as string) || null;
    return val && val.trim() ? val.trim() : null;
  };

  const email = getEmail(primary);
  const firstName = get('FIRST_NAME');
  const lastName = get('LAST_NAME');
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
  // Only use individual LinkedIn URLs — company pages can't receive connection requests
  const linkedinRaw = get('INDIVIDUAL_LINKEDIN_URL') || get('LINKEDIN_URL') || null;
  let linkedinUrl: string | null = null;
  if (linkedinRaw) {
    const normalized = linkedinRaw.startsWith('http') ? linkedinRaw : `https://${linkedinRaw}`;
    // Only store personal profile URLs (/in/), not company pages (/company/)
    if (normalized.includes('/in/')) {
      linkedinUrl = normalized;
    }
  }
  const city = get('PERSONAL_CITY') || get('CITY');
  const state = get('PERSONAL_STATE') || get('STATE');
  const country = get('COUNTRY') || (state ? 'US' : null);

  // Aggregate activity stats from all event records
  let totalPageviews = 0;
  let totalClicks = 0;
  let formSubmissions = 0;
  let maxScrollDepth = 0;
  let totalTimeOnSite = 0;
  const sessionDates = new Set<string>();
  let earliestSeen: string | null = null;
  let latestSeen: string | null = null;

  for (const event of events) {
    const eventType = (event.EVENT_TYPE as string || '').toLowerCase();
    // Support both old format (ACTIVITY_START_DATE/END_DATE) and new format (EVENT_DATE)
    const startDate = event.ACTIVITY_START_DATE as string || event.EVENT_DATE as string || event.EVENT_TIMESTAMP as string;
    const endDate = event.ACTIVITY_END_DATE as string;

    // Track unique sessions by date
    if (startDate) {
      const dateKey = startDate.substring(0, 10); // YYYY-MM-DD
      sessionDates.add(dateKey);
      if (!earliestSeen || startDate < earliestSeen) earliestSeen = startDate;
      if (endDate && (!latestSeen || endDate > latestSeen)) latestSeen = endDate;
      if (!latestSeen || startDate > latestSeen) latestSeen = startDate;
    }

    // Aggregate time on site from activity windows
    if (startDate && endDate) {
      const duration = new Date(endDate).getTime() - new Date(startDate).getTime();
      if (duration > 0) totalTimeOnSite += Math.round(duration / 1000);
    }

    // Count events by type (old format has EVENT_TYPE, new format counts each record as a page view)
    if (eventType) {
      switch (eventType) {
        case 'page_view':
          totalPageviews++;
          break;
        case 'click':
          totalClicks++;
          break;
        case 'form_submission':
          formSubmissions++;
          break;
        case 'scroll_depth': {
          try {
            const data = JSON.parse(event.EVENT_DATA as string || '{}');
            const pct = Number(data.percentage || 0);
            if (pct > maxScrollDepth) maxScrollDepth = pct;
          } catch { /* ignore parse errors */ }
          break;
        }
      }
    } else {
      // New format: each record represents a page visit
      totalPageviews++;
    }
  }

  // Calculate lead score based on activity
  let leadScore = 15; // base score for identified visitors
  leadScore += Math.min(totalPageviews * 2, 20);
  leadScore += Math.min(totalClicks * 3, 15);
  leadScore += formSubmissions * 10;
  leadScore += maxScrollDepth > 50 ? 5 : 0;
  leadScore += sessionDates.size > 1 ? 10 : 0;
  leadScore = Math.min(leadScore, 100);

  return {
    pixel_id: pixelId,
    user_id: userId,
    visitor_id: uuid,
    email,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    company: get('COMPANY_NAME'),
    job_title: get('JOB_TITLE') || get('HEADLINE'),
    linkedin_url: linkedinUrl,
    city,
    state,
    country,
    ip_address: get('IP_ADDRESS'),
    first_page_url: get('URL') || get('FULL_URL'),
    first_referrer: get('REFERRER_URL'),
    first_seen_at: earliestSeen || now,
    last_seen_at: latestSeen || now,
    total_pageviews: totalPageviews,
    total_sessions: sessionDates.size,
    total_time_on_site: totalTimeOnSite,
    max_scroll_depth: maxScrollDepth,
    total_clicks: totalClicks,
    form_submissions: formSubmissions,
    lead_score: leadScore,
    is_identified: !!email,
    identified_at: email ? (earliestSeen || now) : null,
    is_enriched: true,
    enriched_at: now,
    enrichment_source: 'visitors_api',
    enrichment_data: primary as unknown as Record<string, unknown>,
    metadata: {
      phone: getPhone(primary),
      gender: get('GENDER'),
      age_range: get('AGE_RANGE'),
      income_range: get('INCOME_RANGE'),
      seniority_level: get('SENIORITY_LEVEL'),
      department: get('DEPARTMENT'),
      company_industry: get('COMPANY_INDUSTRY'),
      company_employee_count: get('COMPANY_EMPLOYEE_COUNT'),
      company_revenue: get('COMPANY_REVENUE'),
      company_domain: get('COMPANY_DOMAIN'),
      homeowner: get('HOMEOWNER'),
      married: get('MARRIED'),
      children: get('CHILDREN'),
      net_worth: get('NET_WORTH'),
    },
    updated_at: now,
  };
}

export async function fetchVisitorsFromApi(pixel: PixelForFetch): Promise<{
  totalFetched: number;
  totalUpserted: number;
  uniqueVisitors?: number;
  newInserted?: number;
  existingUpdated?: number;
  fetchMode?: string;
  dbErrors?: string[];
  error?: string;
}> {
  let totalFetched = 0;
  let totalUpserted = 0;

  try {
    const apiKey = await getApiKey();
    if (!apiKey) {
      throw new Error('No API key configured. Please add an API key in Settings first.');
    }

    const headers = buildHeaders(pixel.visitors_api_url, apiKey);

    // Use larger page size (200 vs default 50) to reduce API round-trips
    const apiUrl = new URL(pixel.visitors_api_url);
    apiUrl.searchParams.set('page_size', '200');

    // Fetch first page
    const firstResponse = await fetchWithRetry(apiUrl.toString(), { method: 'GET', headers });

    if (!firstResponse.ok) {
      const errorText = await firstResponse.text();
      throw new Error(`API returned ${firstResponse.status}: ${errorText}`);
    }

    const firstData = await firstResponse.json();
    const recalcTotalPages = Number(firstData.total_pages || firstData.TotalPages || firstData.totalPages || 1);
    const currentPage = Number(firstData.page || firstData.Page || firstData.current_page || 1);

    let allContacts: ApiContact[] = extractContacts(firstData);

    // Incremental fetch: API returns records newest-first (by EVENT_TIMESTAMP desc).
    // If we have a last_fetched_at timestamp, stop fetching once we hit records older
    // than that — they were already processed in a previous run. This reduces a pixel
    // with 8000+ records from 43 pages down to 1-2 pages on hourly syncs.
    const lastFetchedAt = pixel.visitors_api_last_fetched_at || null;
    let reachedOldRecords = false;

    // Check if first page already contains old records
    if (lastFetchedAt) {
      reachedOldRecords = hasReachedCutoff(allContacts, lastFetchedAt);
      if (reachedOldRecords) {
        // Trim contacts to only include records newer than last fetch
        allContacts = filterNewContacts(allContacts, lastFetchedAt);
      }
    }

    // Fetch remaining pages — stop early if we hit already-seen records
    if (recalcTotalPages > 1 && currentPage === 1 && !reachedOldRecords) {
      const batchSize = 3;
      for (let batchStart = 2; batchStart <= recalcTotalPages; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize - 1, recalcTotalPages);
        const pagePromises = [];

        for (let page = batchStart; page <= batchEnd; page++) {
          const nextPageUrl = new URL(apiUrl.toString());
          nextPageUrl.searchParams.set('page', String(page));
          pagePromises.push(
            fetchWithRetry(nextPageUrl.toString(), { method: 'GET', headers })
              .then(async (r) => r.ok ? extractContacts(await r.json()) : [])
              .catch(() => [] as ApiContact[])
          );
        }

        const batchResults = await Promise.all(pagePromises);
        let stopFetching = false;
        for (const records of batchResults) {
          if (lastFetchedAt && hasReachedCutoff(records, lastFetchedAt)) {
            allContacts = allContacts.concat(filterNewContacts(records, lastFetchedAt));
            stopFetching = true;
          } else {
            allContacts = allContacts.concat(records);
          }
        }

        if (stopFetching) {
          console.log(`[visitors-api-fetcher] Pixel ${pixel.id}: stopped at page ~${batchEnd}/${recalcTotalPages} (reached already-synced records)`);
          break;
        }

        // Small delay between page batches to stay under rate limits
        if (batchStart + batchSize <= recalcTotalPages) {
          await sleep(300);
        }
      }
    }

    totalFetched = allContacts.length;

    // Group contacts by UUID and aggregate event data (pageviews, clicks, scroll, etc.)
    // The API returns multiple event records per person, so we aggregate them
    const uniqueRows = aggregateContactEvents(allContacts, pixel.id, pixel.user_id);

    const fetchMode = lastFetchedAt ? 'incremental' : 'full';
    console.log(`[visitors-api-fetcher] Pixel ${pixel.id} (${fetchMode}): ${totalFetched} fetched → ${uniqueRows.length} unique visitors`);

    // Count existing visitors to determine new vs updated after upsert
    const visitorIds = uniqueRows.map(r => r.visitor_id);
    let existingCount = 0;
    for (let i = 0; i < visitorIds.length; i += 500) {
      const chunk = visitorIds.slice(i, i + 500);
      const { count } = await supabaseAdmin
        .from('visitors')
        .select('id', { count: 'exact', head: true })
        .eq('pixel_id', pixel.id)
        .in('visitor_id', chunk);
      existingCount += count || 0;
    }
    const newInserted = uniqueRows.length - existingCount;
    const existingUpdated = existingCount;

    // Batch upsert all rows using the unique constraint on (visitor_id, pixel_id)
    // This handles both inserts and updates in a single operation, much faster than
    // individual row updates which were causing Vercel timeout on large pixels
    const BATCH_SIZE = 200;
    const dbErrors: string[] = [];

    for (let i = 0; i < uniqueRows.length; i += BATCH_SIZE) {
      const batch = uniqueRows.slice(i, i + BATCH_SIZE);
      const { error: upsertError, count } = await supabaseAdmin
        .from('visitors')
        .upsert(batch, {
          onConflict: 'visitor_id,pixel_id',
          ignoreDuplicates: false,
          count: 'exact',
        });

      if (upsertError) {
        const errMsg = `Upsert error at offset ${i}: ${upsertError.message} (code: ${upsertError.code}, details: ${upsertError.details})`;
        console.error(`[visitors-api-fetcher] ${errMsg}`);
        dbErrors.push(errMsg);
      } else {
        totalUpserted += count || batch.length;
      }
    }

    if (dbErrors.length > 0) {
      console.error(`[visitors-api-fetcher] DB errors for pixel ${pixel.id}:`, dbErrors);
    }

    // Update pixel fetch status
    const updateFields: Record<string, unknown> = {
      visitors_api_last_fetched_at: new Date().toISOString(),
      visitors_api_last_fetch_status: `success: ${totalUpserted} visitors synced (${fetchMode})`,
    };
    // Only update events_count on full fetches (incremental only has new records)
    if (!lastFetchedAt) {
      updateFields.events_count = totalFetched;
    }
    await supabaseAdmin
      .from('pixels')
      .update(updateFields)
      .eq('id', pixel.id);

    // Log success to system_logs
    await logEvent({
      type: 'api',
      event_name: 'visitors_api_sync',
      status: totalUpserted > 0 ? 'success' : 'info',
      message: `Visitors sync completed for pixel ${pixel.id} (${fetchMode}): ${totalFetched} fetched, ${newInserted} new, ${existingUpdated} updated`,
      request_data: {
        pixel_id: pixel.id,
        api_url: pixel.visitors_api_url,
        total_pages: recalcTotalPages,
      },
      response_data: {
        total_fetched: totalFetched,
        unique_visitors: uniqueRows.length,
        new_inserted: newInserted,
        existing_updated: existingUpdated,
        total_upserted: totalUpserted,
        fetch_mode: fetchMode,
      },
      user_id: pixel.user_id,
    });

    // ZeroBounce + Klaviyo auto-sync is handled separately by the push-klaviyo-events cron
    // which runs every 30 minutes and picks up new/updated visitors incrementally.
    // This avoids duplicating that logic here and keeps the sync fast.

    return {
      totalFetched,
      totalUpserted,
      uniqueVisitors: uniqueRows.length,
      newInserted,
      existingUpdated,
      fetchMode,
      dbErrors: dbErrors.length > 0 ? dbErrors : undefined,
    };
  } catch (err) {
    const errorMessage = (err as Error).message;
    console.error(`[visitors-api-fetcher] Error for pixel ${pixel.id}:`, errorMessage);

    // Log error to system_logs
    await logEvent({
      type: 'api',
      event_name: 'visitors_api_sync',
      status: 'error',
      message: `Visitors sync failed for pixel ${pixel.id}`,
      request_data: {
        pixel_id: pixel.id,
        api_url: pixel.visitors_api_url,
      },
      response_data: {
        total_fetched: totalFetched,
        total_upserted: totalUpserted,
      },
      error_details: errorMessage,
      user_id: pixel.user_id,
    });

    await supabaseAdmin
      .from('pixels')
      .update({
        visitors_api_last_fetched_at: new Date().toISOString(),
        visitors_api_last_fetch_status: `error: ${errorMessage}`,
      })
      .eq('id', pixel.id);

    return { totalFetched, totalUpserted, error: errorMessage };
  }
}
