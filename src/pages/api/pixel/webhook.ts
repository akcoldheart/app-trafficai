import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Create a service role client for public endpoint (no user auth required)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Resolution data from identitypxl.app
interface ResolutionData {
  UUID?: string;
  FIRST_NAME?: string;
  LAST_NAME?: string;
  PERSONAL_EMAILS?: string;
  BUSINESS_EMAIL?: string;
  COMPANY_NAME?: string;
  JOB_TITLE?: string;
  COMPANY_LINKEDIN_URL?: string;
  PERSONAL_ADDRESS?: string;
  PERSONAL_CITY?: string;
  PERSONAL_STATE?: string;
  PERSONAL_ZIP?: string;
  COMPANY_ADDRESS?: string;
  COMPANY_CITY?: string;
  COMPANY_STATE?: string;
  COMPANY_ZIP?: string;
  COMPANY_DOMAIN?: string;
  COMPANY_DESCRIPTION?: string;
  COMPANY_EMPLOYEE_COUNT?: string;
  COMPANY_INDUSTRY?: string;
  COMPANY_REVENUE?: string;
  SENIORITY_LEVEL?: string;
  DEPARTMENT?: string;
  MOBILE_PHONE?: string;
  DIRECT_NUMBER?: string;
  PERSONAL_PHONE?: string;
  GENDER?: string;
  AGE_RANGE?: string;
  INCOME_RANGE?: string;
  HOMEOWNER?: string;
  MARRIED?: string;
  CHILDREN?: string;
  NET_WORTH?: string;
  [key: string]: string | null | undefined;
}

// Event from identitypxl.app
interface PixelEvent {
  pixel_id: string;
  hem_sha256?: string;
  event_timestamp?: string;
  event_type?: string;
  ip_address?: string;
  activity_start_date?: string;
  activity_end_date?: string;
  referrer_url?: string;
  event_data?: {
    url?: string;
    timestamp?: string;
    coordinates?: { x: number; y: number };
    element?: Record<string, unknown>;
    [key: string]: unknown;
  };
  resolution?: ResolutionData;
}

interface WebhookPayload {
  events: PixelEvent[];
}

// Validate API key against stored webhook key
async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey) return false;

  const { data: setting } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'webhook_api_key')
    .single();

  return setting?.value === apiKey;
}

// Get first email from comma-separated list
function getFirstEmail(emails: string | null | undefined): string | null {
  if (!emails) return null;
  const emailList = emails.split(',').map(e => e.trim()).filter(Boolean);
  return emailList[0] || null;
}

// Get first phone from comma-separated list
function getFirstPhone(phones: string | null | undefined): string | null {
  if (!phones) return null;
  const phoneList = phones.split(',').map(p => p.trim()).filter(Boolean);
  return phoneList[0] || null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Validate API key from header
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      return res.status(401).json({ error: 'Missing API key' });
    }

    const isValidKey = await validateApiKey(apiKey);
    if (!isValidKey) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Parse payload
    let payload: WebhookPayload;
    if (typeof req.body === 'string') {
      try {
        payload = JSON.parse(req.body);
      } catch {
        return res.status(400).json({ error: 'Invalid JSON payload' });
      }
    } else {
      payload = req.body;
    }

    // Validate required fields
    if (!payload.events || !Array.isArray(payload.events) || payload.events.length === 0) {
      return res.status(400).json({ error: 'Missing or empty events array' });
    }

    const results: { pixel_id: string; visitor_id: string | null; success: boolean; error?: string }[] = [];

    // Process each event
    for (const event of payload.events) {
      try {
        const result = await processEvent(event);
        results.push(result);
      } catch (error) {
        console.error('Error processing event:', error);
        results.push({
          pixel_id: event.pixel_id,
          visitor_id: null,
          success: false,
          error: (error as Error).message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return res.status(200).json({
      success: failCount === 0,
      processed: results.length,
      succeeded: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function processEvent(event: PixelEvent): Promise<{ pixel_id: string; visitor_id: string | null; success: boolean; error?: string }> {
  if (!event.pixel_id) {
    return { pixel_id: '', visitor_id: null, success: false, error: 'Missing pixel_id' };
  }

  // Find the pixel by pixel_code (which is the UUID pixel_id from identitypxl.app)
  const { data: pixel, error: pixelError } = await supabaseAdmin
    .from('pixels')
    .select('id, user_id, status')
    .eq('pixel_code', event.pixel_id)
    .single();

  if (pixelError || !pixel) {
    return { pixel_id: event.pixel_id, visitor_id: null, success: false, error: 'Pixel not found' };
  }

  // Check if pixel is active
  if (pixel.status !== 'active') {
    // Activate the pixel if it's pending
    if (pixel.status === 'pending') {
      await supabaseAdmin
        .from('pixels')
        .update({ status: 'active' })
        .eq('id', pixel.id);
    } else {
      return { pixel_id: event.pixel_id, visitor_id: null, success: false, error: 'Pixel is not active' };
    }
  }

  const resolution = event.resolution || {};

  // Generate or use provided visitor ID
  const visitorId = resolution.UUID || `webhook_${crypto.randomUUID()}`;

  // Get IP address
  const ipAddress = event.ip_address || 'unknown';

  // Extract visitor data from resolution
  const email = getFirstEmail(resolution.PERSONAL_EMAILS) || getFirstEmail(resolution.BUSINESS_EMAIL);
  const firstName = resolution.FIRST_NAME || null;
  const lastName = resolution.LAST_NAME || null;
  const fullName = [firstName, lastName].filter(Boolean).join(' ') || null;
  const company = resolution.COMPANY_NAME || null;
  const jobTitle = resolution.JOB_TITLE || null;
  const linkedinUrl = resolution.COMPANY_LINKEDIN_URL ?
    (resolution.COMPANY_LINKEDIN_URL.startsWith('http') ? resolution.COMPANY_LINKEDIN_URL : `https://${resolution.COMPANY_LINKEDIN_URL}`) :
    null;
  const city = resolution.PERSONAL_CITY || resolution.COMPANY_CITY || null;
  const state = resolution.PERSONAL_STATE || resolution.COMPANY_STATE || null;
  const country = 'US'; // Default to US based on the data format

  // Check for existing visitor by email or visitor_id
  let existingVisitor = null;

  if (email) {
    const { data: visitorByEmail } = await supabaseAdmin
      .from('visitors')
      .select('*')
      .eq('pixel_id', pixel.id)
      .eq('email', email)
      .single();
    existingVisitor = visitorByEmail;
  }

  if (!existingVisitor && visitorId) {
    const { data: visitorById } = await supabaseAdmin
      .from('visitors')
      .select('*')
      .eq('pixel_id', pixel.id)
      .eq('visitor_id', visitorId)
      .single();
    existingVisitor = visitorById;
  }

  let visitorRecordId: string;

  if (existingVisitor) {
    // Update existing visitor with new data
    const updates: Record<string, unknown> = {
      last_seen_at: new Date().toISOString(),
      ip_address: ipAddress,
    };

    // Update visitor details if provided (don't overwrite with null)
    if (email) updates.email = email;
    if (firstName) updates.first_name = firstName;
    if (lastName) updates.last_name = lastName;
    if (fullName) updates.full_name = fullName;
    if (company) updates.company = company;
    if (jobTitle) updates.job_title = jobTitle;
    if (linkedinUrl) updates.linkedin_url = linkedinUrl;
    if (city) updates.city = city;
    if (state) updates.state = state;
    if (country) updates.country = country;

    // Mark as identified if email provided
    if (email && !existingVisitor.is_identified) {
      updates.is_identified = true;
      updates.identified_at = new Date().toISOString();
    }

    // Mark as enriched if we have resolution data
    if (Object.keys(resolution).length > 0 && !existingVisitor.is_enriched) {
      updates.is_enriched = true;
      updates.enriched_at = new Date().toISOString();
      updates.enrichment_source = 'identitypxl';
    }

    // Store full resolution data
    updates.enrichment_data = {
      ...existingVisitor.enrichment_data,
      ...resolution,
    };

    // Increment pageviews
    updates.total_pageviews = (existingVisitor.total_pageviews || 0) + 1;

    // Check for new session (30 min timeout)
    const lastSeen = new Date(existingVisitor.last_seen_at).getTime();
    const now = Date.now();
    if (now - lastSeen > 30 * 60 * 1000) {
      updates.total_sessions = (existingVisitor.total_sessions || 0) + 1;
    }

    // Recalculate lead score
    updates.lead_score = calculateLeadScore({
      total_pageviews: updates.total_pageviews as number,
      total_sessions: (updates.total_sessions as number) || existingVisitor.total_sessions || 1,
      total_time_on_site: existingVisitor.total_time_on_site || 0,
      max_scroll_depth: existingVisitor.max_scroll_depth || 0,
      total_clicks: existingVisitor.total_clicks || 0,
      form_submissions: existingVisitor.form_submissions || 0,
      is_identified: (updates.is_identified as boolean) || existingVisitor.is_identified,
      is_enriched: (updates.is_enriched as boolean) || existingVisitor.is_enriched,
    });

    await supabaseAdmin
      .from('visitors')
      .update(updates)
      .eq('id', existingVisitor.id);

    visitorRecordId = existingVisitor.id;
  } else {
    // Create new visitor record
    const isIdentified = !!email;
    const isEnriched = Object.keys(resolution).length > 0;

    const newVisitor = {
      pixel_id: pixel.id,
      user_id: pixel.user_id,
      visitor_id: visitorId,
      ip_address: ipAddress,
      user_agent: null,
      email: email,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      company: company,
      job_title: jobTitle,
      linkedin_url: linkedinUrl,
      city: city,
      state: state,
      country: country,
      first_seen_at: event.event_timestamp || new Date().toISOString(),
      last_seen_at: new Date().toISOString(),
      first_page_url: event.event_data?.url || event.referrer_url || null,
      first_referrer: event.referrer_url || null,
      total_pageviews: 1,
      total_sessions: 1,
      total_time_on_site: 0,
      max_scroll_depth: 0,
      total_clicks: event.event_type === 'click' ? 1 : 0,
      form_submissions: 0,
      lead_score: calculateLeadScore({
        total_pageviews: 1,
        total_sessions: 1,
        total_time_on_site: 0,
        max_scroll_depth: 0,
        total_clicks: event.event_type === 'click' ? 1 : 0,
        form_submissions: 0,
        is_identified: isIdentified,
        is_enriched: isEnriched,
      }),
      is_identified: isIdentified,
      identified_at: isIdentified ? new Date().toISOString() : null,
      is_enriched: isEnriched,
      enriched_at: isEnriched ? new Date().toISOString() : null,
      enrichment_source: isEnriched ? 'identitypxl' : null,
      enrichment_data: resolution,
      metadata: {
        phone: getFirstPhone(resolution.MOBILE_PHONE) || getFirstPhone(resolution.DIRECT_NUMBER) || getFirstPhone(resolution.PERSONAL_PHONE) || null,
        gender: resolution.GENDER || null,
        age_range: resolution.AGE_RANGE || null,
        income_range: resolution.INCOME_RANGE || null,
        homeowner: resolution.HOMEOWNER || null,
        married: resolution.MARRIED || null,
        children: resolution.CHILDREN || null,
        seniority_level: resolution.SENIORITY_LEVEL || null,
        department: resolution.DEPARTMENT || null,
        company_industry: resolution.COMPANY_INDUSTRY || null,
        company_employee_count: resolution.COMPANY_EMPLOYEE_COUNT || null,
        company_revenue: resolution.COMPANY_REVENUE || null,
      },
    };

    const { data: insertedVisitor, error: insertError } = await supabaseAdmin
      .from('visitors')
      .insert(newVisitor)
      .select('id')
      .single();

    if (insertError) {
      console.error('Error creating visitor:', insertError);
      return { pixel_id: event.pixel_id, visitor_id: null, success: false, error: 'Failed to create visitor' };
    }

    visitorRecordId = insertedVisitor.id;
  }

  // Create pixel event
  const eventType = event.event_type || 'pageview';
  const eventTimestamp = event.event_timestamp || new Date().toISOString();

  const { error: eventError } = await supabaseAdmin
    .from('pixel_events')
    .insert({
      pixel_id: pixel.id,
      event_type: eventType,
      visitor_id: visitorId,
      page_url: event.event_data?.url || null,
      referrer: event.referrer_url || null,
      user_agent: null,
      ip_address: ipAddress,
      metadata: {
        source: 'identitypxl_webhook',
        hem_sha256: event.hem_sha256,
        activity_start_date: event.activity_start_date,
        activity_end_date: event.activity_end_date,
        event_data: event.event_data,
        has_resolution: !!resolution && Object.keys(resolution).length > 0,
      },
      created_at: eventTimestamp,
    });

  if (eventError) {
    console.error('Error creating pixel event:', eventError);
    // Don't fail the request if event creation fails
  }

  // Update pixel events count
  await supabaseAdmin.rpc('increment_pixel_events', { pixel_id: pixel.id });

  return {
    pixel_id: event.pixel_id,
    visitor_id: visitorRecordId,
    success: true,
  };
}

// Calculate lead score based on behavior and identification
function calculateLeadScore(visitor: {
  total_pageviews: number;
  total_sessions: number;
  total_time_on_site: number;
  max_scroll_depth: number;
  total_clicks: number;
  form_submissions: number;
  is_identified?: boolean;
  is_enriched?: boolean;
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

  // Bonus for identified visitors
  if (visitor.is_identified) {
    score += 15;
  }

  // Bonus for enriched visitors
  if (visitor.is_enriched) {
    score += 10;
  }

  return Math.min(score, 100);
}

// Disable body parser size limit for this endpoint
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb', // Larger limit for batch events
    },
  },
};
