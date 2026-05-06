import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { cached } from '@/lib/api-cache';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Cache TTL: 30 seconds per user
const CACHE_TTL = 30_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);

  try {
    const effectiveUserId = await getEffectiveUserId(user.id);
    const cacheKey = `user-dashboard-stats:${effectiveUserId}`;
    const data = await cached(cacheKey, CACHE_TTL, () => fetchUserStats(supabase, effectiveUserId));

    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchUserStats(supabase: any, userId: string) {
  // Use UTC so results are consistent regardless of server timezone
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const last30Days = new Date(today);
  last30Days.setDate(last30Days.getDate() - 30);

  // Get user's pixels first (needed for event queries)
  const { data: rawPixels } = await supabase
    .from('pixels')
    .select('id, name, domain, status, events_count, visitors_api_url')
    .eq('user_id', userId);

  // Match the Pixels tab: a pixel marked 'active' without a visitors_api_url is effectively inactive
  const pixels = (rawPixels || []).map((p: { id: string; name: string; domain: string; status: string; events_count: number; visitors_api_url: string | null }) => ({
    id: p.id,
    name: p.name,
    domain: p.domain,
    status: p.status === 'active' && !p.visitors_api_url ? 'inactive' : p.status,
    events_count: p.events_count,
  }));

  const pixelIds = pixels.map((p: { id: string }) => p.id);
  const activePixels = pixels.filter((p: { status: string }) => p.status === 'active').length;
  const totalEvents = pixels.reduce((sum: number, p: { events_count: number }) => sum + (p.events_count || 0), 0);
  const pixelFilter = pixelIds.length > 0 ? pixelIds : ['00000000-0000-0000-0000-000000000000'];

  // Run ALL remaining queries in parallel
  const [
    totalVisitorsResult,
    identifiedVisitorsResult,
    enrichedVisitorsResult,
    visitorsTodayResult,
    visitorsYesterdayResult,
    eventsTodayResult,
    recentVisitorsResult,
    // DB aggregate functions
    avgLeadScoreResult,
    visitorStatsByDayResult,
    activityCountsResult,
    topEntryPagesResult,
    ownedAudiencesResult,
    assignedAudiencesResult,
    conversionsLast30Result,
    identifiedVisitorsLast30Result,
  ] = await Promise.all([
    // Visitor counts (head-only — no row data transferred)
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_identified', true),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_enriched', true),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', today.toISOString()),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', yesterday.toISOString()).lt('created_at', today.toISOString()),
    // Actual events from pixel_events table created today
    supabase.from('pixel_events').select('*', { count: 'exact', head: true }).in('pixel_id', pixelFilter).gte('created_at', today.toISOString()),
    // Recent visitors (just 5 rows)
    supabase.from('visitors').select('id, full_name, email, company, lead_score, last_seen_at, is_identified, is_enriched').eq('user_id', userId).order('last_seen_at', { ascending: false }).limit(5),
    // RPC: average lead score for this user (replaces fetching 1000 rows)
    supabase.rpc('get_avg_lead_score', { p_user_id: userId }),
    // RPC: daily visitor stats
    supabase.rpc('get_visitor_stats_by_day', { p_pixel_ids: pixelIds, p_days: 7 }),
    // RPC: visitor activity breakdown
    supabase.rpc('get_visitor_activity_counts', { p_pixel_ids: pixelIds, p_days: 7 }),
    // RPC: top entry pages
    supabase.rpc('get_top_entry_pages', { p_pixel_ids: pixelIds, p_days: 7, p_limit: 5 }),
    // Audience: owned approved requests with manual_audience
    supabaseAdmin
      .from('audience_requests')
      .select('audience_id')
      .eq('user_id', userId)
      .eq('status', 'approved')
      .not('form_data->manual_audience', 'is', null),
    // Audience: assigned audiences
    supabaseAdmin
      .from('audience_assignments')
      .select('audience_id')
      .eq('user_id', userId),
    // Conversions in the last 30 days (we only need a few fields for the cards)
    supabaseAdmin
      .from('conversions')
      .select('id, ordered_at, total_price, matched_visitor_id, matched_contact_id, currency')
      .eq('user_id', userId)
      .gte('ordered_at', last30Days.toISOString()),
    // Visitors identified in the last 30 days — denominator for conversion rate
    supabaseAdmin
      .from('visitors')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_identified', true)
      .gte('identified_at', last30Days.toISOString()),
  ]);

  const totalVisitors = totalVisitorsResult.count || 0;
  const identifiedVisitors = identifiedVisitorsResult.count || 0;
  const enrichedVisitors = enrichedVisitorsResult.count || 0;
  const visitorsToday = visitorsTodayResult.count || 0;
  const visitorsYesterday = visitorsYesterdayResult.count || 0;
  const eventsToday = eventsTodayResult.count || 0;
  const recentVisitors = recentVisitorsResult.data || [];

  const avgLeadScore = typeof avgLeadScoreResult.data === 'number'
    ? avgLeadScoreResult.data
    : 0;

  // Build chart data from RPC results
  const visitorsByDayMap: Record<string, { visitors: number; pageviews: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    visitorsByDayMap[dateStr] = { visitors: 0, pageviews: 0 };
  }

  if (visitorStatsByDayResult.error) {
    console.error('get_visitor_stats_by_day RPC error:', visitorStatsByDayResult.error);
  }
  if (visitorStatsByDayResult.data) {
    for (const row of visitorStatsByDayResult.data) {
      const dateStr = String(row.visit_date);
      if (visitorsByDayMap[dateStr]) {
        visitorsByDayMap[dateStr].visitors = Number(row.new_visitors);
        visitorsByDayMap[dateStr].pageviews = Number(row.day_pageviews);
      }
    }
  }

  const totalActivityLastWeek = (activityCountsResult.data || []).reduce(
    (sum: number, r: { activity_count: number }) => sum + Number(r.activity_count), 0
  ) || 1;

  const activityTypes = (activityCountsResult.data || []).map((row: { activity_type: string; activity_count: number }) => ({
    type: row.activity_type,
    count: Number(row.activity_count),
    percentage: Math.round(Number(row.activity_count) / totalActivityLastWeek * 100),
  }));

  const topPages = (topEntryPagesResult.data || []).map((row: { page_path: string; visitor_count: number }) => ({
    page: row.page_path || '/',
    views: Number(row.visitor_count),
  }));

  // Calculate visitor change percentage
  const visitorChange = visitorsYesterday > 0
    ? Math.round((visitorsToday - visitorsYesterday) / visitorsYesterday * 100)
    : 0;

  // Audience stats: combine owned + assigned, deduplicate
  const ownedIds = (ownedAudiencesResult.data || []).map((r: { audience_id: string }) => r.audience_id);
  const assignedIds = (assignedAudiencesResult.data || []).map((r: { audience_id: string }) => r.audience_id);
  const allAudienceIds = Array.from(new Set([...ownedIds, ...assignedIds]));
  const totalAudiences = allAudienceIds.length;

  let totalContacts = 0;
  if (allAudienceIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('audience_contacts')
      .select('id', { count: 'exact', head: true })
      .in('audience_id', allAudienceIds);
    totalContacts = count || 0;
  }

  // Conversion stats (last 30 days)
  const conversions = (conversionsLast30Result.data || []) as Array<{
    id: string;
    ordered_at: string;
    total_price: number | null;
    matched_visitor_id: string | null;
    matched_contact_id: string | null;
    currency: string | null;
  }>;
  const totalConversions = conversions.length;
  const attributedConversions = conversions.filter(c => c.matched_visitor_id || c.matched_contact_id);
  const attributedCount = attributedConversions.length;
  const revenueAttributed = attributedConversions.reduce((sum, c) => sum + (Number(c.total_price) || 0), 0);
  const totalRevenue = conversions.reduce((sum, c) => sum + (Number(c.total_price) || 0), 0);
  const avgOrderValue = attributedCount > 0 ? revenueAttributed / attributedCount : 0;
  const identifiedLast30 = identifiedVisitorsLast30Result.count || 0;
  // Conversion rate = how many of our identified visitors actually placed an attributed order
  const conversionRate = identifiedLast30 > 0
    ? Math.round((attributedCount / identifiedLast30) * 1000) / 10  // one decimal
    : 0;
  const matchRate = totalConversions > 0
    ? Math.round((attributedCount / totalConversions) * 100)
    : 0;
  // Pick the most common currency for display (Shopify shops are usually single-currency)
  const currencyCount: Record<string, number> = {};
  for (const c of conversions) {
    const cur = c.currency || 'USD';
    currencyCount[cur] = (currencyCount[cur] || 0) + 1;
  }
  const currency = Object.entries(currencyCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'USD';

  // 7-day conversions sparkline
  const conversionsByDayMap: Record<string, number> = {};
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    conversionsByDayMap[date.toISOString().split('T')[0]] = 0;
  }
  for (const c of conversions) {
    const dateStr = c.ordered_at.split('T')[0];
    if (dateStr in conversionsByDayMap) conversionsByDayMap[dateStr]++;
  }

  return {
    overview: {
      totalVisitors,
      identifiedVisitors,
      enrichedVisitors,
      visitorsToday,
      visitorChange,
      totalEvents,
      eventsToday,
      activePixels,
      avgLeadScore,
      totalAudiences,
      totalContacts,
    },
    conversions: {
      total: totalConversions,
      attributed: attributedCount,
      unmatched: totalConversions - attributedCount,
      revenueAttributed,
      totalRevenue,
      avgOrderValue,
      conversionRate,    // % of identified visitors who placed attributed orders (last 30d)
      matchRate,         // % of orders that we attributed to a known visitor/contact
      currency,
      identifiedLast30,
    },
    charts: {
      visitorsByDay: Object.entries(visitorsByDayMap).map(([date, data]) => ({
        date,
        day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        visitors: data.visitors,
      })),
      pageviewsByDay: Object.entries(visitorsByDayMap).map(([date, data]) => ({
        date,
        day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        pageviews: data.pageviews,
      })),
      conversionsByDay: Object.entries(conversionsByDayMap).map(([date, count]) => ({
        date,
        day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        conversions: count,
      })),
      activityTypes,
    },
    topPages,
    recentVisitors,
    pixels,
  };
}
