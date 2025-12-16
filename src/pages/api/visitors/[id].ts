import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;
  const visitorId = Array.isArray(id) ? id[0] : id;
  const supabase = createClient(req, res);

  if (!visitorId) {
    return res.status(400).json({ error: 'Visitor ID is required' });
  }

  try {
    if (req.method === 'GET') {
      // Get visitor details
      const { data: visitor, error: visitorError } = await supabase
        .from('visitors')
        .select('*')
        .eq('id', visitorId)
        .eq('user_id', user.id)
        .single();

      if (visitorError || !visitor) {
        return res.status(404).json({ error: 'Visitor not found' });
      }

      // Get visitor's journey (recent events)
      const { data: events, error: eventsError } = await supabase
        .from('pixel_events')
        .select('*')
        .eq('visitor_id', visitor.visitor_id)
        .eq('pixel_id', visitor.pixel_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (eventsError) {
        console.error('Error fetching events:', eventsError);
      }

      // Group events by type for journey summary
      const journeySummary = {
        pageviews: 0,
        clicks: 0,
        scrolls: 0,
        forms: 0,
        totalTime: 0,
      };

      const journey: Array<{
        type: string;
        url?: string;
        data?: Record<string, unknown>;
        timestamp: string;
      }> = [];

      (events || []).forEach((event) => {
        const metadata = event.metadata as Record<string, unknown> | null;
        const eventData = metadata?.eventData as Record<string, unknown> | undefined;

        switch (event.event_type) {
          case 'pageview':
            journeySummary.pageviews++;
            journey.push({
              type: 'Opened Page',
              url: event.page_url || undefined,
              timestamp: event.created_at,
            });
            break;
          case 'click':
            journeySummary.clicks++;
            if (eventData?.href) {
              journey.push({
                type: 'Clicked Link',
                url: eventData.href as string,
                data: { text: eventData.text },
                timestamp: event.created_at,
              });
            }
            break;
          case 'scroll':
            journeySummary.scrolls++;
            break;
          case 'form_submit':
            journeySummary.forms++;
            journey.push({
              type: 'Submitted Form',
              data: { formId: eventData?.formId },
              timestamp: event.created_at,
            });
            break;
          case 'heartbeat':
          case 'exit':
            if (eventData?.timeOnPage) {
              journeySummary.totalTime = Math.max(
                journeySummary.totalTime,
                eventData.timeOnPage as number
              );
            }
            break;
        }
      });

      return res.status(200).json({
        visitor,
        journey: journey.slice(0, 20), // Return last 20 journey events
        summary: journeySummary,
      });
    }

    if (req.method === 'DELETE') {
      // Delete visitor and their events
      const { error } = await supabase
        .from('visitors')
        .delete()
        .eq('id', visitorId)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error deleting visitor:', error);
        return res.status(500).json({ error: 'Failed to delete visitor' });
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
