import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { fetchVisitorsFromApi } from '@/lib/visitors-api-fetcher';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
    const { data: pixels, error } = await supabaseAdmin
      .from('pixels')
      .select('id, user_id, visitors_api_url')
      .eq('status', 'active')
      .not('visitors_api_url', 'is', null);

    if (error) {
      console.error('Error fetching pixels for cron:', error);
      return res.status(500).json({ error: 'Failed to fetch pixels' });
    }

    if (!pixels || pixels.length === 0) {
      return res.status(200).json({ success: true, message: 'No pixels with API URLs configured', results: [] });
    }

    const results = [];

    for (const pixel of pixels) {
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
      results,
    });
  } catch (error) {
    console.error('Cron fetch-visitors error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
