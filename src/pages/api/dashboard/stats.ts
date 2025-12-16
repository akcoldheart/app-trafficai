import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

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

    // Get user's pixels
    const { data: pixels } = await supabase
      .from('pixels')
      .select('id, name, domain, status, events_count')
      .eq('user_id', user.id);

    const pixelIds = pixels?.map(p => p.id) || [];
    const activePixels = pixels?.filter(p => p.status === 'active').length || 0;
    const totalEvents = pixels?.reduce((sum, p) => sum + (p.events_count || 0), 0) || 0;

    // Get visitor stats
    const { count: totalVisitors } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    const { count: identifiedVisitors } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_identified', true);

    const { count: enrichedVisitors } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_enriched', true);

    // Get visitors today
    const { count: visitorsToday } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('last_seen_at', today.toISOString());

    // Get visitors yesterday (for comparison)
    const { count: visitorsYesterday } = await supabase
      .from('visitors')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('last_seen_at', yesterday.toISOString())
      .lt('last_seen_at', today.toISOString());

    // Get events today
    const { count: eventsToday } = await supabase
      .from('pixel_events')
      .select('*', { count: 'exact', head: true })
      .in('pixel_id', pixelIds.length > 0 ? pixelIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', today.toISOString());

    // Get events last 7 days by day
    const { data: eventsLastWeek } = await supabase
      .from('pixel_events')
      .select('created_at, event_type')
      .in('pixel_id', pixelIds.length > 0 ? pixelIds : ['00000000-0000-0000-0000-000000000000'])
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
      .in('pixel_id', pixelIds.length > 0 ? pixelIds : ['00000000-0000-0000-0000-000000000000'])
      .gte('created_at', lastWeek.toISOString());

    const eventTypeCount: Record<string, number> = {};
    eventTypes?.forEach(e => {
      eventTypeCount[e.event_type] = (eventTypeCount[e.event_type] || 0) + 1;
    });

    // Get top pages
    const { data: topPagesData } = await supabase
      .from('pixel_events')
      .select('page_url')
      .in('pixel_id', pixelIds.length > 0 ? pixelIds : ['00000000-0000-0000-0000-000000000000'])
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

    // Get recent visitors
    const { data: recentVisitors } = await supabase
      .from('visitors')
      .select('id, full_name, email, company, lead_score, last_seen_at, is_identified, is_enriched')
      .eq('user_id', user.id)
      .order('last_seen_at', { ascending: false })
      .limit(5);

    // Calculate visitor change percentage
    const visitorChange = visitorsYesterday && visitorsYesterday > 0
      ? Math.round(((visitorsToday || 0) - visitorsYesterday) / visitorsYesterday * 100)
      : 0;

    // Get average lead score
    const { data: leadScoreData } = await supabase
      .from('visitors')
      .select('lead_score')
      .eq('user_id', user.id);

    const avgLeadScore = leadScoreData && leadScoreData.length > 0
      ? Math.round(leadScoreData.reduce((sum, v) => sum + v.lead_score, 0) / leadScoreData.length)
      : 0;

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
      pixels: pixels || [],
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return res.status(500).json({ error: 'Failed to load dashboard stats' });
  }
}
