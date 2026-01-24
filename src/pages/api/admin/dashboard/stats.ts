import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/api-helpers';

// Service role client to bypass RLS - admins need to see ALL data
const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can access all-partners data
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const supabase = supabaseAdmin;

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    // Run independent queries in parallel for better performance
    const [
      pixelsResult,
      totalVisitorsResult,
      identifiedVisitorsResult,
      enrichedVisitorsResult,
      visitorsTodayResult,
      visitorsYesterdayResult,
      recentVisitorsResult,
      allUsersResult,
      visitorsByUserResult,
    ] = await Promise.all([
      // Get ALL pixels
      supabase.from('pixels').select('id, name, domain, status, events_count, user_id'),
      // Visitor counts
      supabase.from('visitors').select('*', { count: 'exact', head: true }),
      supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('is_identified', true),
      supabase.from('visitors').select('*', { count: 'exact', head: true }).eq('is_enriched', true),
      supabase.from('visitors').select('*', { count: 'exact', head: true }).gte('last_seen_at', today.toISOString()),
      supabase.from('visitors').select('*', { count: 'exact', head: true }).gte('last_seen_at', yesterday.toISOString()).lt('last_seen_at', today.toISOString()),
      // Recent visitors
      supabase.from('visitors').select('id, full_name, email, company, lead_score, last_seen_at, is_identified, is_enriched, user_id').order('last_seen_at', { ascending: false }).limit(10),
      // Users
      supabase.from('users').select('id, email, role, company_website, created_at'),
      // Visitor counts by user
      supabase.from('visitors').select('user_id'),
    ]);

    const allPixels = pixelsResult.data;
    const totalVisitors = totalVisitorsResult.count;
    const identifiedVisitors = identifiedVisitorsResult.count;
    const enrichedVisitors = enrichedVisitorsResult.count;
    const visitorsToday = visitorsTodayResult.count;
    const visitorsYesterday = visitorsYesterdayResult.count;
    const recentVisitors = recentVisitorsResult.data;
    const allUsers = allUsersResult.data;
    const visitorsByUser = visitorsByUserResult.data;

    const allPixelIds = allPixels?.map(p => p.id) || [];
    const activePixels = allPixels?.filter(p => p.status === 'active').length || 0;
    const totalEvents = allPixels?.reduce((sum, p) => sum + (p.events_count || 0), 0) || 0;
    const pixelFilter = allPixelIds.length > 0 ? allPixelIds : ['00000000-0000-0000-0000-000000000000'];

    // Run event queries in parallel (these depend on pixel IDs)
    const [
      eventsTodayResult,
      eventsLastWeekResult,
      avgLeadScoreResult,
    ] = await Promise.all([
      supabase.from('pixel_events').select('*', { count: 'exact', head: true }).in('pixel_id', pixelFilter).gte('created_at', today.toISOString()),
      supabase.from('pixel_events').select('created_at, event_type, page_url').in('pixel_id', pixelFilter).gte('created_at', lastWeek.toISOString()).order('created_at', { ascending: true }).limit(10000),
      supabase.from('visitors').select('lead_score').not('lead_score', 'is', null).limit(1000),
    ]);

    const eventsToday = eventsTodayResult.count;
    const eventsLastWeek = eventsLastWeekResult.data;
    const leadScoreData = avgLeadScoreResult.data;

    // Aggregate events by day and type in one pass
    const eventsByDay: Record<string, number> = {};
    const pageviewsByDay: Record<string, number> = {};
    const eventTypeCount: Record<string, number> = {};
    const pageCount: Record<string, number> = {};

    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      eventsByDay[dateStr] = 0;
      pageviewsByDay[dateStr] = 0;
    }

    eventsLastWeek?.forEach(event => {
      const dateStr = event.created_at.split('T')[0];
      if (eventsByDay[dateStr] !== undefined) {
        eventsByDay[dateStr]++;
        if (event.event_type === 'pageview') {
          pageviewsByDay[dateStr]++;
        }
      }
      // Count event types
      eventTypeCount[event.event_type] = (eventTypeCount[event.event_type] || 0) + 1;
      // Count pages for pageviews
      if (event.event_type === 'pageview' && event.page_url) {
        try {
          const url = new URL(event.page_url);
          pageCount[url.pathname] = (pageCount[url.pathname] || 0) + 1;
        } catch {
          // Skip invalid URLs
        }
      }
    });

    const topPages = Object.entries(pageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([page, views]) => ({ page, views }));

    // Calculate visitor change percentage
    const visitorChange = visitorsYesterday && visitorsYesterday > 0
      ? Math.round(((visitorsToday || 0) - visitorsYesterday) / visitorsYesterday * 100)
      : 0;

    // Calculate average lead score
    const avgLeadScore = leadScoreData && leadScoreData.length > 0
      ? Math.round(leadScoreData.reduce((sum, v) => sum + (v.lead_score || 0), 0) / leadScoreData.length)
      : 0;

    // Count visitors by user
    const visitorCountByUser: Record<string, number> = {};
    visitorsByUser?.forEach(v => {
      if (v.user_id) {
        visitorCountByUser[v.user_id] = (visitorCountByUser[v.user_id] || 0) + 1;
      }
    });

    // Build partner performance data
    const partnerPerformance = allUsers?.map(user => {
      const userPixels = allPixels?.filter(p => p.user_id === user.id) || [];
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
    }).sort((a, b) => b.stats.events - a.stats.events) || [];

    // Get total counts
    const totalUsers = allUsers?.length || 0;
    const adminCount = allUsers?.filter(u => u.role === 'admin').length || 0;
    const teamCount = allUsers?.filter(u => u.role === 'team').length || 0;
    const userCount = allUsers?.filter(u => u.role === 'user').length || 0;
    const totalEventTypes = eventsLastWeek?.length || 1;

    return res.status(200).json({
      overview: {
        totalVisitors: totalVisitors || 0,
        identifiedVisitors: identifiedVisitors || 0,
        enrichedVisitors: enrichedVisitors || 0,
        visitorsToday: visitorsToday || 0,
        visitorChange,
        totalEvents,
        eventsToday: eventsToday || 0,
        activePixels,
        avgLeadScore,
        totalUsers,
        adminCount,
        teamCount,
        userCount,
      },
      charts: {
        eventsByDay: Object.entries(eventsByDay).map(([date, count]) => ({
          date,
          day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
          events: count,
        })),
        pageviewsByDay: Object.entries(pageviewsByDay).map(([date, count]) => ({
          date,
          day: new Date(date).toLocaleDateString('en-US', { weekday: 'short' }),
          pageviews: count,
        })),
        eventTypes: Object.entries(eventTypeCount).map(([type, count]) => ({
          type,
          count,
          percentage: Math.round(count / totalEventTypes * 100),
        })),
      },
      topPages,
      recentVisitors: recentVisitors || [],
      pixels: allPixels || [],
      partnerPerformance,
    });
  } catch (error) {
    console.error('Admin dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to load admin dashboard stats' });
  }
}
