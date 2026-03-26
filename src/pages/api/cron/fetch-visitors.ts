import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { fetchVisitorsFromApi } from '@/lib/visitors-api-fetcher';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Max time to spend processing pixels (leave 30s buffer for response)
const MAX_PROCESSING_MS = 270_000; // 4.5 minutes

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Fetch all active pixels with visitors_api_url set, ordered by last fetch time
    // so that pixels that haven't been synced recently get priority (round-robin)
    const { data: pixels, error } = await supabaseAdmin
      .from('pixels')
      .select('id, user_id, visitors_api_url')
      .eq('status', 'active')
      .not('visitors_api_url', 'is', null)
      .order('visitors_api_last_fetched_at', { ascending: true, nullsFirst: true });

    if (error) {
      console.error('Error fetching pixels for cron:', error);
      return res.status(500).json({ error: 'Failed to fetch pixels' });
    }

    if (!pixels || pixels.length === 0) {
      return res.status(200).json({ success: true, message: 'No pixels with API URLs configured', results: [] });
    }

    const results = [];
    const startTime = Date.now();
    let skippedDueToTimeout = 0;

    // Stagger pixel syncs with a 3-second delay between each to avoid
    // overwhelming the AudienceLab API and hitting rate limits (429s)
    for (let i = 0; i < pixels.length; i++) {
      // Check if we're running low on time before starting next pixel
      if (Date.now() - startTime > MAX_PROCESSING_MS) {
        skippedDueToTimeout = pixels.length - i;
        console.warn(`[cron/fetch-visitors] Timeout approaching after ${i} pixels, skipping remaining ${skippedDueToTimeout}. They will be prioritized in the next run.`);
        break;
      }

      const pixel = pixels[i];

      // Wait between pixels (skip delay for the first one)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 3000));
      }

      const result = await fetchVisitorsFromApi({
        id: pixel.id,
        user_id: pixel.user_id,
        visitors_api_url: pixel.visitors_api_url!,
      });

      results.push({
        pixel_id: pixel.id,
        ...result,
      });
    }

    const totalSuccess = results.filter(r => !r.error).length;
    const totalFailed = results.filter(r => r.error).length;

    return res.status(200).json({
      success: totalFailed === 0,
      processed: results.length,
      succeeded: totalSuccess,
      failed: totalFailed,
      skipped_timeout: skippedDueToTimeout,
      total_pixels: pixels.length,
      results,
    });
  } catch (error) {
    console.error('Cron fetch-visitors error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
