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
  for (const contact of contacts) {
    const uuid = getContactUuid(contact);
    if (!uuid) continue;
    const existing = grouped.get(uuid) || [];
    existing.push(contact);
    grouped.set(uuid, existing);
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
  const linkedinRaw = get('INDIVIDUAL_LINKEDIN_URL') || get('LINKEDIN_URL') || get('COMPANY_LINKEDIN_URL');
  const linkedinUrl = linkedinRaw
    ? (linkedinRaw.startsWith('http') ? linkedinRaw : `https://${linkedinRaw}`)
    : null;
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
    const startDate = event.ACTIVITY_START_DATE as string || event.EVENT_DATE as string;
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

    // Fetch first page
    console.log(`[visitors-api-fetcher] Fetching page 1 from: ${pixel.visitors_api_url}`);
    const firstResponse = await fetch(pixel.visitors_api_url, { method: 'GET', headers });

    if (!firstResponse.ok) {
      const errorText = await firstResponse.text();
      throw new Error(`API returned ${firstResponse.status}: ${errorText}`);
    }

    const firstData = await firstResponse.json();
    const totalPages = Number(firstData.total_pages || firstData.TotalPages || firstData.totalPages || 1);
    const currentPage = Number(firstData.page || firstData.Page || firstData.current_page || 1);

    console.log(`[visitors-api-fetcher] Page ${currentPage}/${totalPages}`);

    let allContacts: ApiContact[] = extractContacts(firstData);

    // Fetch remaining pages in parallel batches of 5
    if (totalPages > 1 && currentPage === 1) {
      const batchSize = 5;
      for (let batchStart = 2; batchStart <= totalPages; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize - 1, totalPages);
        const pagePromises = [];

        for (let page = batchStart; page <= batchEnd; page++) {
          const nextPageUrl = new URL(pixel.visitors_api_url);
          nextPageUrl.searchParams.set('page', String(page));
          pagePromises.push(
            fetch(nextPageUrl.toString(), { method: 'GET', headers })
              .then(async (r) => r.ok ? extractContacts(await r.json()) : [])
              .catch(() => [] as ApiContact[])
          );
        }

        const batchResults = await Promise.all(pagePromises);
        for (const records of batchResults) {
          allContacts = allContacts.concat(records);
        }
        console.log(`[visitors-api-fetcher] Fetched pages ${batchStart}-${batchEnd}, total contacts: ${allContacts.length}`);
      }
    }

    totalFetched = allContacts.length;
    console.log(`[visitors-api-fetcher] Total contacts fetched: ${totalFetched}`);

    // Debug: log first contact's keys to help diagnose UUID field issues
    if (allContacts.length > 0) {
      const sample = allContacts[0];
      const sampleKeys = Object.keys(sample).slice(0, 20);
      console.log(`[visitors-api-fetcher] Sample contact keys: ${sampleKeys.join(', ')}`);
      console.log(`[visitors-api-fetcher] Sample UUID value: ${getContactUuid(sample)}`);
    }

    // Group contacts by UUID and aggregate event data (pageviews, clicks, scroll, etc.)
    // The API returns multiple event records per person, so we aggregate them
    const uniqueRows = aggregateContactEvents(allContacts, pixel.id, pixel.user_id);
    console.log(`[visitors-api-fetcher] ${totalFetched} event records → ${uniqueRows.length} unique visitors (with aggregated activity stats)`);

    // Fetch ALL existing visitor_ids for this pixel to split into insert vs update
    // Paginate to avoid Supabase default 1000-row limit
    let existingVisitors: { id: string; visitor_id: string }[] = [];
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data: page } = await supabaseAdmin
        .from('visitors')
        .select('id, visitor_id')
        .eq('pixel_id', pixel.id)
        .range(from, from + PAGE - 1);
      if (!page || page.length === 0) break;
      existingVisitors = existingVisitors.concat(page);
      if (page.length < PAGE) break;
      from += PAGE;
    }

    const existingMap = new Map<string, string>();
    for (const v of (existingVisitors || [])) {
      existingMap.set(v.visitor_id, v.id);
    }

    const toInsert = uniqueRows.filter(r => !existingMap.has(r.visitor_id));
    const toUpdate = uniqueRows.filter(r => existingMap.has(r.visitor_id));

    console.log(`[visitors-api-fetcher] ${toInsert.length} new visitors to insert, ${toUpdate.length} existing to update`);

    // Batch insert new records
    const BATCH_SIZE = 200;
    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE);
      const { error: insertError } = await supabaseAdmin
        .from('visitors')
        .insert(batch);

      if (insertError) {
        console.error(`[visitors-api-fetcher] Insert error at offset ${i}:`, insertError.message);
      } else {
        totalUpserted += batch.length;
      }

      if (i % 1000 === 0 && i > 0) {
        console.log(`[visitors-api-fetcher] Inserted ${totalUpserted}/${toInsert.length}...`);
      }
    }

    // Update existing records in parallel batches of 50
    for (let i = 0; i < toUpdate.length; i += 50) {
      const batch = toUpdate.slice(i, i + 50);
      const results = await Promise.all(
        batch.map(row => {
          const dbId = existingMap.get(row.visitor_id)!;
          return supabaseAdmin
            .from('visitors')
            .update({
              email: row.email,
              first_name: row.first_name,
              last_name: row.last_name,
              full_name: row.full_name,
              company: row.company,
              job_title: row.job_title,
              linkedin_url: row.linkedin_url,
              city: row.city,
              state: row.state,
              country: row.country,
              ip_address: row.ip_address,
              first_seen_at: row.first_seen_at,
              last_seen_at: row.last_seen_at,
              total_pageviews: row.total_pageviews,
              total_sessions: row.total_sessions,
              total_time_on_site: row.total_time_on_site,
              max_scroll_depth: row.max_scroll_depth,
              total_clicks: row.total_clicks,
              form_submissions: row.form_submissions,
              lead_score: row.lead_score,
              is_enriched: true,
              enriched_at: row.enriched_at,
              enrichment_source: 'visitors_api',
              enrichment_data: row.enrichment_data,
              metadata: row.metadata,
              updated_at: row.updated_at,
            })
            .eq('id', dbId)
            .then(({ error }) => !error);
        })
      );
      totalUpserted += results.filter(Boolean).length;
    }

    console.log(`[visitors-api-fetcher] Done. Upserted ${totalUpserted} visitors.`);

    // Update pixel fetch status and events count
    await supabaseAdmin
      .from('pixels')
      .update({
        visitors_api_last_fetched_at: new Date().toISOString(),
        visitors_api_last_fetch_status: `success: ${totalUpserted} visitors synced`,
        events_count: totalFetched,
      })
      .eq('id', pixel.id);

    // Log success to system_logs
    await logEvent({
      type: 'api',
      event_name: 'visitors_api_sync',
      status: totalUpserted > 0 ? 'success' : 'info',
      message: `Visitors sync completed for pixel ${pixel.id}: ${totalFetched} fetched, ${toInsert.length} new, ${toUpdate.length} updated`,
      request_data: {
        pixel_id: pixel.id,
        api_url: pixel.visitors_api_url,
        total_pages: totalPages,
      },
      response_data: {
        total_fetched: totalFetched,
        unique_visitors: uniqueRows.length,
        new_inserted: toInsert.length,
        existing_updated: toUpdate.length,
        total_upserted: totalUpserted,
      },
      user_id: pixel.user_id,
    });

    return { totalFetched, totalUpserted };
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
