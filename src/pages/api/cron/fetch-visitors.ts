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

/**
 * Interleave pixels so each user gets one pixel processed before any user
 * gets a second. Within each user, prioritize the pixel synced longest ago.
 * This prevents a user with many pixels from starving other users.
 */
function interleaveByUser(pixels: { id: string; user_id: string; visitors_api_url: string; visitors_api_last_fetched_at: string | null }[]) {
  // Group pixels by user, each group sorted by oldest fetch first
  const byUser = new Map<string, typeof pixels>();
  for (const pixel of pixels) {
    const group = byUser.get(pixel.user_id) || [];
    group.push(pixel);
    byUser.set(pixel.user_id, group);
  }

  // Sort each user's pixels by last fetched (oldest first, nulls first)
  for (const group of Array.from(byUser.values())) {
    group.sort((a, b) => {
      if (!a.visitors_api_last_fetched_at && !b.visitors_api_last_fetched_at) return 0;
      if (!a.visitors_api_last_fetched_at) return -1;
      if (!b.visitors_api_last_fetched_at) return 1;
      return a.visitors_api_last_fetched_at.localeCompare(b.visitors_api_last_fetched_at);
    });
  }

  // Sort users by their oldest pixel's fetch time (so most-stale user goes first)
  const userOrder = Array.from(byUser.entries()).sort((a, b) => {
    const aOldest = a[1][0].visitors_api_last_fetched_at;
    const bOldest = b[1][0].visitors_api_last_fetched_at;
    if (!aOldest && !bOldest) return 0;
    if (!aOldest) return -1;
    if (!bOldest) return 1;
    return aOldest.localeCompare(bOldest);
  });

  // Round-robin: take one pixel from each user per round
  const result: typeof pixels = [];
  let hasMore = true;
  let round = 0;
  while (hasMore) {
    hasMore = false;
    for (const [, group] of userOrder) {
      if (round < group.length) {
        result.push(group[round]);
        hasMore = true;
      }
    }
    round++;
  }

  return result;
}

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
    // Fetch all active pixels with visitors_api_url set
    // Paginate to avoid Supabase default 1000-row limit
    let allPixels: { id: string; user_id: string; visitors_api_url: string; visitors_api_last_fetched_at: string | null }[] = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data: page, error } = await supabaseAdmin
        .from('pixels')
        .select('id, user_id, visitors_api_url, visitors_api_last_fetched_at')
        .eq('status', 'active')
        .not('visitors_api_url', 'is', null)
        .order('visitors_api_last_fetched_at', { ascending: true, nullsFirst: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.error('Error fetching pixels for cron:', error);
        return res.status(500).json({ error: 'Failed to fetch pixels' });
      }
      if (!page || page.length === 0) break;
      allPixels = allPixels.concat(page);
      if (page.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (allPixels.length === 0) {
      return res.status(200).json({ success: true, message: 'No pixels with API URLs configured', results: [] });
    }

    // Interleave pixels across users for fairness
    const pixels = interleaveByUser(allPixels);

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
      total_pixels: allPixels.length,
      results,
    });
  } catch (error) {
    console.error('Cron fetch-visitors error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
