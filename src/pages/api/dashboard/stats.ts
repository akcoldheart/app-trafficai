import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { cached } from '@/lib/api-cache';

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
    const cacheKey = `user-dashboard-stats:${user.id}`;
    const data = await cached(cacheKey, CACHE_TTL, () => fetchUserStats(supabase, user.id));

    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchUserStats(supabase: any, userId: string) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Get user's pixels first (needed for event queries)
  const { data: pixels } = await supabase
    .from('pixels')
    .select('id, name, domain, status, events_count')
    .eq('user_id', userId);

  const pixelIds = pixels?.map((p: { id: string }) => p.id) || [];
  const activePixels = pixels?.filter((p: { status: string }) => p.status === 'active').length || 0;
  const totalEvents = pixels?.reduce((sum: number, p: { events_count: number }) => sum + (p.events_count || 0), 0) || 0;
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
    eventStatsByDayResult,
    eventTypeCountsResult,
    topPagesResult,
  ] = await Promise.all([
    // Visitor counts (head-only — no row data transferred)
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_identified', true),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('is_enriched', true),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('last_seen_at', today.toISOString()),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('last_seen_at', yesterday.toISOString()).lt('last_seen_at', today.toISOString()),
    // Events today count
    supabase.from('pixel_events').select('*', { count: 'exact', head: true }).in('pixel_id', pixelFilter).gte('created_at', today.toISOString()),
    // Recent visitors (just 5 rows)
    supabase.from('visitors').select('id, full_name, email, company, lead_score, last_seen_at, is_identified, is_enriched').eq('user_id', userId).order('last_seen_at', { ascending: false }).limit(5),
    // RPC: average lead score for this user (replaces fetching 1000 rows)
    supabase.rpc('get_avg_lead_score', { p_user_id: userId }),
    // RPC: daily event stats (replaces fetching 10,000 raw rows)
    supabase.rpc('get_event_stats_by_day', { p_pixel_ids: pixelIds, p_days: 7 }),
    // RPC: event type breakdown
    supabase.rpc('get_event_type_counts', { p_pixel_ids: pixelIds, p_days: 7 }),
    // RPC: top pages
    supabase.rpc('get_top_pages', { p_pixel_ids: pixelIds, p_days: 7, p_limit: 5 }),
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
  const eventsByDayMap: Record<string, { events: number; pageviews: number }> = {};
  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    eventsByDayMap[dateStr] = { events: 0, pageviews: 0 };
  }

  if (eventStatsByDayResult.data) {
    for (const row of eventStatsByDayResult.data) {
      const dateStr = String(row.event_date);
      if (eventsByDayMap[dateStr]) {
        eventsByDayMap[dateStr].events = Number(row.total_events);
        eventsByDayMap[dateStr].pageviews = Number(row.pageview_count);
      }
    }
  }

  const totalEventsLastWeek = Object.values(eventsByDayMap).reduce((sum, d) => sum + d.events, 0) || 1;

  const eventTypes = (eventTypeCountsResult.data || []).map((row: { event_type: string; event_count: number }) => ({
    type: row.event_type,
    count: Number(row.event_count),
    percentage: Math.round(Number(row.event_count) / totalEventsLastWeek * 100),
  }));

  const topPages = (topPagesResult.data || []).map((row: { page_path: string; view_count: number }) => ({
    page: row.page_path || '/',
    views: Number(row.view_count),
  }));

  // Calculate visitor change percentage
  const visitorChange = visitorsYesterday > 0
    ? Math.round((visitorsToday - visitorsYesterday) / visitorsYesterday * 100)
    : 0;

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
    },
    charts: {
      eventsByDay: Object.entries(eventsByDayMap).map(([date, data]) => ({
        date,
        day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        events: data.events,
      })),
      pageviewsByDay: Object.entries(eventsByDayMap).map(([date, data]) => ({
        date,
        day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
        pageviews: data.pageviews,
      })),
      eventTypes,
    },
    topPages,
    recentVisitors,
    pixels: pixels || [],
  };
}
