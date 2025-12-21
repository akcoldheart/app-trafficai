import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can access all-partners data
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const supabase = createClient(req, res);

  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(today);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    // Get ALL pixels (not filtered by user)
    const { data: allPixels } = await supabase
      .from('pixels')
      .select('id, name, domain, status, events_count, user_id');

    const allPixelIds = allPixels?.map(p => p.id) || [];
    const activePixels = allPixels?.filter(p => p.status === 'active').length || 0;
    const totalEvents = allPixels?.reduce((sum, p) => sum + (p.events_count || 0), 0) || 0;

    // Get ALL visitor stats
    const { count: totalVisitors } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true });

    const { count: identifiedVisitors } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .eq('is_identified', true);

    const { count: enrichedVisitors } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .eq('is_enriched', true);

    // Get visitors today
    const { count: visitorsToday } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', today.toISOString());

    // Get visitors yesterday (for comparison)
    const { count: visitorsYesterday } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .gte('last_seen_at', yesterday.toISOString())
      .lt('last_seen_at', today.toISOString());

    // Get events today
    const { count: eventsToday } = await supabase
      .from('pixel_events')
      .select('*', { count: 'exact', head: true })
      .in('pixel_id', allPixelIds.length > 0 ? allPixelIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', today.toISOString());

    // Get events last 7 days by day
    const { data: eventsLastWeek } = await supabase
      .from('pixel_events')
      .select('created_at, event_type')
      .in('pixel_id', allPixelIds.length > 0 ? allPixelIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', lastWeek.toISOString())
      .order('created_at', { ascending: true });

    // Aggregate events by day
    const eventsByDay: Record<string, number> = {};
    const pageviewsByDay: Record<string, number> = {};
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
    });

    // Get event types distribution
    const { data: eventTypes } = await supabase
      .from('pixel_events')
      .select('event_type')
      .in('pixel_id', allPixelIds.length > 0 ? allPixelIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', lastWeek.toISOString());

    const eventTypeCount: Record<string, number> = {};
    eventTypes?.forEach(e => {
      eventTypeCount[e.event_type] = (eventTypeCount[e.event_type] || 0) + 1;
    });

    // Get top pages
    const { data: topPagesData } = await supabase
      .from('pixel_events')
      .select('page_url')
      .in('pixel_id', allPixelIds.length > 0 ? allPixelIds : ['00000000-0000-0000-0000-000000000000'])
      .eq('event_type', 'pageview')
      .gte('created_at', lastWeek.toISOString());

    const pageCount: Record<string, number> = {};
    topPagesData?.forEach(e => {
      if (!e.page_url) return;
      try {
        const url = new URL(e.page_url);
        const path = url.pathname;
        pageCount[path] = (pageCount[path] || 0) + 1;
      } catch {
        // Skip invalid URLs
      }
    });

    const topPages = Object.entries(pageCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([page, views]) => ({ page, views }));

    // Get recent visitors (all users)
    const { data: recentVisitors } = await supabase
      .from('visitors')
      .select('id, full_name, email, company, lead_score, last_seen_at, is_identified, is_enriched, user_id')
      .order('last_seen_at', { ascending: false })
      .limit(10);

    // Calculate visitor change percentage
    const visitorChange = visitorsYesterday && visitorsYesterday > 0
      ? Math.round(((visitorsToday || 0) - visitorsYesterday) / visitorsYesterday * 100)
      : 0;

    // Get average lead score
    const { data: leadScoreData } = await supabase
      .from('visitors')
      .select('lead_score');

    const avgLeadScore = leadScoreData && leadScoreData.length > 0
      ? Math.round(leadScoreData.reduce((sum, v) => sum + v.lead_score, 0) / leadScoreData.length)
      : 0;

    // Get ALL users for partner breakdown
    const { data: allUsers } = await supabase
      .from('users')
      .select('id, email, role, company_website, created_at');

    // Get visitor counts per user
    const { data: visitorsByUser } = await supabase
      .from('visitors')
      .select('user_id');

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
    const partnerCount = allUsers?.filter(u => u.role === 'partner').length || 0;

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
        partnerCount,
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
          percentage: Math.round(count / (eventTypes?.length || 1) * 100),
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
