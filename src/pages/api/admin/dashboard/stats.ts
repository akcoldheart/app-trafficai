import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/api-helpers';
import { cached } from '@/lib/api-cache';

// Service role client to bypass RLS - admins need to see ALL data
const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Cache TTL: 30 seconds — dashboard data doesn't need to be real-time
const CACHE_TTL = 30_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can access all-partners data
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  try {
    const data = await cached('admin-dashboard-stats', CACHE_TTL, fetchAdminStats);

    // Tell browser to cache for 30 seconds too
    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    return res.status(200).json(data);
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to load admin dashboard stats' });
  }
}

async function fetchAdminStats() {
  const supabase = supabaseAdmin;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Run ALL independent queries in a single Promise.all
  const [
    pixelsResult,
    totalVisitorsResult,
    identifiedVisitorsResult,
    enrichedVisitorsResult,
    visitorsTodayResult,
    visitorsYesterdayResult,
    recentVisitorsResult,
    allUsersResult,
    // DB aggregate functions — replace fetching raw rows
    visitorCountsByUserResult,
    avgLeadScoreResult,
    pixelPerformanceResult,
  ] = await Promise.all([
    // Pixels
    supabase.from('pixels').select('id, name, domain, status, events_count, user_id'),
    // Visitor counts (head-only — just returns count, no row data)
    supabase.from('visitors').select('*', { count: 'exact', head: true }),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('is_identified', true),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('is_enriched', true),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).gte('last_seen_at', today.toISOString()),
    supabase.from('visitors').select('*', { count: 'exact', head: true }).gte('last_seen_at', yesterday.toISOString()).lt('last_seen_at', today.toISOString()),
    // Recent visitors (just 10 rows)
    supabase.from('visitors').select('id, full_name, email, company, lead_score, last_seen_at, is_identified, is_enriched, user_id').order('last_seen_at', { ascending: false }).limit(10),
    // Users
    supabase.from('users').select('id, email, role, company_website, created_at'),
    // RPC: visitor counts grouped by user (replaces fetching ALL visitor rows)
    supabase.rpc('get_visitor_counts_by_user'),
    // RPC: average lead score (replaces fetching 1000 rows)
    supabase.rpc('get_avg_lead_score'),
    // RPC: pixel-level performance stats
    supabase.rpc('get_pixel_performance'),
  ]);

  const allPixels = pixelsResult.data || [];
  const allUsers = allUsersResult.data || [];
  const recentVisitors = recentVisitorsResult.data || [];
  const totalVisitors = totalVisitorsResult.count || 0;
  const identifiedVisitors = identifiedVisitorsResult.count || 0;
  const enrichedVisitors = enrichedVisitorsResult.count || 0;
  const visitorsToday = visitorsTodayResult.count || 0;
  const visitorsYesterday = visitorsYesterdayResult.count || 0;

  const activePixels = allPixels.filter(p => p.status === 'active').length;
  const totalEvents = allPixels.reduce((sum, p) => sum + (p.events_count || 0), 0);
  const allPixelIds = allPixels.map(p => p.id);

  // Build visitor count lookup from RPC result
  const visitorCountByUser: Record<string, number> = {};
  if (visitorCountsByUserResult.data) {
    for (const row of visitorCountsByUserResult.data) {
      visitorCountByUser[row.user_id] = Number(row.visitor_count);
    }
  }

  const avgLeadScore = typeof avgLeadScoreResult.data === 'number'
    ? avgLeadScoreResult.data
    : 0;

  // Build top pixels from RPC + pixel/user lookups
  const pixelLookup = new Map(allPixels.map(p => [p.id, p]));
  const userLookup = new Map(allUsers.map(u => [u.id, u]));
  const topPixels = (pixelPerformanceResult.data || []).map((row: { pixel_id: string; visitor_count: number; identified_count: number; avg_lead_score: number }) => {
    const pixel = pixelLookup.get(row.pixel_id);
    const owner = pixel ? userLookup.get(pixel.user_id) : null;
    return {
      pixelId: row.pixel_id,
      name: pixel?.name || 'Unknown',
      domain: pixel?.domain || '',
      status: pixel?.status || 'unknown',
      eventsCount: pixel?.events_count || 0,
      ownerEmail: owner?.email || 'Unknown',
      visitorCount: Number(row.visitor_count),
      identifiedCount: Number(row.identified_count),
      avgLeadScore: Number(row.avg_lead_score),
    };
  });

  // Run event aggregate RPCs (depend on pixel IDs)
  const [
    eventsTodayResult,
    eventStatsByDayResult,
    eventTypeCountsResult,
    topPagesResult,
  ] = await Promise.all([
    supabase.from('pixel_events').select('*', { count: 'exact', head: true })
      .in('pixel_id', allPixelIds.length > 0 ? allPixelIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', today.toISOString()),
    // RPC: daily event stats (replaces fetching 10,000 raw rows)
    supabase.rpc('get_event_stats_by_day', { p_pixel_ids: allPixelIds, p_days: 7 }),
    // RPC: event type breakdown
    supabase.rpc('get_event_type_counts', { p_pixel_ids: allPixelIds, p_days: 7 }),
    // RPC: top pages
    supabase.rpc('get_top_pages', { p_pixel_ids: allPixelIds, p_days: 7, p_limit: 5 }),
  ]);

  const eventsToday = eventsTodayResult.count || 0;

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

  // Build partner performance data
  const partnerPerformance = allUsers.map(user => {
    const userPixels = allPixels.filter(p => p.user_id === user.id);
    const userEvents = userPixels.reduce((sum, p) => sum + (p.events_count || 0), 0);
    const userActivePixels = userPixels.filter(p => p.status === 'active').length;
    const userVisitors = visitorCountByUser[user.id] || 0;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      company: user.company_website,
      joinedAt: user.created_at,
      stats: {
        pixels: userPixels.length,
        activePixels: userActivePixels,
        visitors: userVisitors,
        events: userEvents,
      }
    };
  }).sort((a, b) => b.stats.events - a.stats.events);

  // User role counts
  const totalUsers = allUsers.length;
  const adminCount = allUsers.filter(u => u.role === 'admin').length;
  const teamCount = allUsers.filter(u => u.role === 'team').length;
  const userCount = allUsers.filter(u => (u.role as string) === 'user').length;

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
      totalUsers,
      adminCount,
      teamCount,
      userCount,
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
    pixels: allPixels,
    topPixels,
    partnerPerformance,
  };
}
