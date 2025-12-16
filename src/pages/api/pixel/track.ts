import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Create a service role client for public endpoint (no user auth required)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface TrackPayload {
  pixelIds: string[];
  visitorId: string;
  sessionId: string;
  eventType: string;
  eventData: Record<string, unknown>;
  page: {
    url: string;
    path: string;
    title: string;
    referrer: string;
    host: string;
  };
  fingerprint: {
    userAgent: string;
    language: string;
    platform: string;
    screenWidth: number;
    screenHeight: number;
    screenColorDepth: number;
    timezone: string;
    timezoneOffset: number;
    cookiesEnabled: boolean;
    doNotTrack: string | null;
    canvasHash: string | null;
  };
  timestamp: string;
  version: string;
}

// Simple hash function for fingerprinting
function hashFingerprint(fp: TrackPayload['fingerprint']): string {
  const str = JSON.stringify({
    ua: fp.userAgent,
    lang: fp.language,
    platform: fp.platform,
    screen: `${fp.screenWidth}x${fp.screenHeight}x${fp.screenColorDepth}`,
    tz: fp.timezone,
    canvas: fp.canvasHash,
  });

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return 'fp_' + Math.abs(hash).toString(16);
}

// Calculate lead score based on behavior
function calculateLeadScore(visitor: {
  total_pageviews: number;
  total_sessions: number;
  total_time_on_site: number;
  max_scroll_depth: number;
  total_clicks: number;
  form_submissions: number;
}): number {
  let score = 0;

  // Pageviews (max 20 points)
  score += Math.min(visitor.total_pageviews * 2, 20);

  // Sessions/return visits (max 20 points)
  score += Math.min(visitor.total_sessions * 5, 20);

  // Time on site in seconds (max 20 points)
  score += Math.min(Math.floor(visitor.total_time_on_site / 30), 20);

  // Scroll depth (max 15 points)
  score += Math.floor(visitor.max_scroll_depth / 100 * 15);

  // Clicks (max 15 points)
  score += Math.min(visitor.total_clicks, 15);

  // Form submissions (10 points each, max 10 points)
  score += Math.min(visitor.form_submissions * 10, 10);

  return Math.min(score, 100);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Enable CORS for pixel requests - use specific origin instead of wildcard
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Handle both JSON and text/plain content types (sendBeacon sends text/plain)
    let payload: TrackPayload;
    if (typeof req.body === 'string') {
      try {
        payload = JSON.parse(req.body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
    } else {
      payload = req.body;
    }

    if (!payload.pixelIds || !payload.visitorId || !payload.eventType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get client IP
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
               req.headers['x-real-ip'] as string ||
               req.socket.remoteAddress ||
               'unknown';

    const fingerprintHash = hashFingerprint(payload.fingerprint);

    // Process each pixel
    for (const pixelCode of payload.pixelIds) {
      // Find the pixel
      const { data: pixel, error: pixelError } = await supabaseAdmin
        .from('pixels')
        .select('id, user_id, status')
        .eq('pixel_code', pixelCode)
        .single();

      if (pixelError || !pixel) {
        console.error('Pixel not found:', pixelCode);
        continue;
      }

      // Update pixel status to active if pending
      if (pixel.status === 'pending') {
        await supabaseAdmin
          .from('pixels')
          .update({ status: 'active' })
          .eq('id', pixel.id);
      }

      // Store the event
      const { error: eventError } = await supabaseAdmin
        .from('pixel_events')
        .insert({
          pixel_id: pixel.id,
          event_type: payload.eventType,
          visitor_id: payload.visitorId,
          page_url: payload.page.url,
          referrer: payload.page.referrer,
          user_agent: payload.fingerprint.userAgent,
          ip_address: ip,
          metadata: {
            sessionId: payload.sessionId,
            eventData: payload.eventData,
            page: payload.page,
            fingerprint: {
              hash: fingerprintHash,
              timezone: payload.fingerprint.timezone,
              language: payload.fingerprint.language,
              screen: `${payload.fingerprint.screenWidth}x${payload.fingerprint.screenHeight}`,
            },
          },
        });

      if (eventError) {
        console.error('Error storing event:', eventError);
      }

      // Update pixel events count
      await supabaseAdmin.rpc('increment_pixel_events', { pixel_id: pixel.id });

      // Upsert visitor record
      const { data: existingVisitor } = await supabaseAdmin
        .from('visitors')
        .select('*')
        .eq('pixel_id', pixel.id)
        .eq('visitor_id', payload.visitorId)
        .single();

      const timeOnPage = (payload.eventData.timeOnPage as number) || 0;
      const scrollDepth = (payload.eventData.maxScrollDepth as number) || (payload.eventData.depth as number) || 0;
      const clickCount = (payload.eventData.clickCount as number) || 0;

      if (existingVisitor) {
        // Update existing visitor
        const updates: Record<string, unknown> = {
          last_seen_at: new Date().toISOString(),
          total_pageviews: existingVisitor.total_pageviews + (payload.eventType === 'pageview' ? 1 : 0),
          // For time on site: use the max of current session time (from heartbeat/exit) vs stored time
          // This prevents over-accumulation while still tracking longest session
          total_time_on_site: payload.eventType === 'heartbeat' || payload.eventType === 'exit'
            ? Math.max(existingVisitor.total_time_on_site || 0, timeOnPage)
            : existingVisitor.total_time_on_site,
          max_scroll_depth: Math.max(existingVisitor.max_scroll_depth || 0, scrollDepth),
          total_clicks: existingVisitor.total_clicks + (payload.eventType === 'click' ? 1 : 0),
          form_submissions: existingVisitor.form_submissions + (payload.eventType === 'form_submit' ? 1 : 0),
          ip_address: ip,
          user_agent: payload.fingerprint.userAgent,
        };

        // Check for new session
        const lastSeen = new Date(existingVisitor.last_seen_at).getTime();
        const now = Date.now();
        if (now - lastSeen > 30 * 60 * 1000) { // 30 min session timeout
          updates.total_sessions = existingVisitor.total_sessions + 1;
        }

        // Recalculate lead score
        updates.lead_score = calculateLeadScore({
          total_pageviews: updates.total_pageviews as number,
          total_sessions: (updates.total_sessions as number) || existingVisitor.total_sessions,
          total_time_on_site: updates.total_time_on_site as number,
          max_scroll_depth: updates.max_scroll_depth as number,
          total_clicks: updates.total_clicks as number,
          form_submissions: updates.form_submissions as number,
        });

        await supabaseAdmin
          .from('visitors')
          .update(updates)
          .eq('id', existingVisitor.id);

        // If identify event, update email
        if (payload.eventType === 'identify' && payload.eventData.email) {
          await supabaseAdmin
            .from('visitors')
            .update({
              email: payload.eventData.email as string,
              is_identified: true,
              identified_at: new Date().toISOString(),
            })
            .eq('id', existingVisitor.id);
        }

        // Try to enrich if not yet enriched and we have IP
        if (!existingVisitor.is_enriched && ip !== 'unknown') {
          // Queue for enrichment (async, don't wait)
          enrichVisitor(existingVisitor.id, pixel.user_id, ip, payload.fingerprint.userAgent);
        }
      } else {
        // Create new visitor
        const newVisitor = {
          pixel_id: pixel.id,
          user_id: pixel.user_id,
          visitor_id: payload.visitorId,
          fingerprint_hash: fingerprintHash,
          ip_address: ip,
          user_agent: payload.fingerprint.userAgent,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
          first_page_url: payload.page.url,
          first_referrer: payload.page.referrer,
          total_pageviews: payload.eventType === 'pageview' ? 1 : 0,
          total_sessions: 1,
          total_time_on_site: timeOnPage,
          max_scroll_depth: scrollDepth,
          total_clicks: payload.eventType === 'click' ? 1 : 0,
          form_submissions: payload.eventType === 'form_submit' ? 1 : 0,
          lead_score: 5, // Base score for new visitor
          is_identified: false,
          is_enriched: false,
          metadata: {
            timezone: payload.fingerprint.timezone,
            language: payload.fingerprint.language,
            screen: `${payload.fingerprint.screenWidth}x${payload.fingerprint.screenHeight}`,
          },
        };

        const { data: insertedVisitor } = await supabaseAdmin
          .from('visitors')
          .insert(newVisitor)
          .select()
          .single();

        // Try to enrich new visitor
        if (insertedVisitor && ip !== 'unknown') {
          enrichVisitor(insertedVisitor.id, pixel.user_id, ip, payload.fingerprint.userAgent);
        }
      }
    }

    // Return 1x1 transparent pixel for compatibility
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Track API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Async function to enrich visitor data using Traffic AI API
async function enrichVisitor(visitorId: string, userId: string, ip: string, userAgent: string) {
  try {
    // Get user's API key
    const { data: apiKeyData } = await supabaseAdmin
      .from('user_api_keys')
      .select('api_key')
      .eq('user_id', userId)
      .single();

    if (!apiKeyData?.api_key) {
      console.log('No API key for user:', userId);
      return;
    }

    // Call Traffic AI enrichment API
    const enrichResponse = await fetch(`${process.env.TRAFFIC_AI_API_URL || 'https://api.trafficai.io'}/v1/enrich`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeyData.api_key}`,
      },
      body: JSON.stringify({
        ip: ip,
        userAgent: userAgent,
      }),
    });

    if (!enrichResponse.ok) {
      console.log('Enrichment failed:', enrichResponse.status);
      return;
    }

    const enrichData = await enrichResponse.json();

    if (enrichData.email || enrichData.name || enrichData.company) {
      // Update visitor with enriched data
      await supabaseAdmin
        .from('visitors')
        .update({
          email: enrichData.email || null,
          first_name: enrichData.firstName || enrichData.first_name || null,
          last_name: enrichData.lastName || enrichData.last_name || null,
          full_name: enrichData.name || enrichData.fullName || null,
          company: enrichData.company || enrichData.organization || null,
          job_title: enrichData.jobTitle || enrichData.title || null,
          linkedin_url: enrichData.linkedinUrl || enrichData.linkedin || null,
          city: enrichData.city || null,
          state: enrichData.state || enrichData.region || null,
          country: enrichData.country || null,
          is_enriched: true,
          enriched_at: new Date().toISOString(),
          is_identified: !!enrichData.email,
          identified_at: enrichData.email ? new Date().toISOString() : null,
          enrichment_source: 'traffic_ai',
          enrichment_data: enrichData,
        })
        .eq('id', visitorId);

      console.log('Visitor enriched:', visitorId);
    }
  } catch (error) {
    console.error('Enrichment error:', error);
  }
}

// Disable body parser size limit for this endpoint
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
