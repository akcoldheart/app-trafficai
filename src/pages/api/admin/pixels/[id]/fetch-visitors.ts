import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { fetchVisitorsFromApi } from '@/lib/visitors-api-fetcher';

export const config = { maxDuration: 300 };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid pixel ID' });
  }

  const supabase = createClient(req, res);

  try {
    // Get the pixel and verify it has a visitors API URL
    const { data: pixel, error: pixelError } = await supabase
      .from('pixels')
      .select('id, user_id, visitors_api_url')
      .eq('id', id)
      .single();

    if (pixelError || !pixel) {
      return res.status(404).json({ error: 'Pixel not found' });
    }

    if (!pixel.visitors_api_url) {
      return res.status(400).json({ error: 'No visitors API URL configured for this pixel' });
    }

    const result = await fetchVisitorsFromApi({
      id: pixel.id,
      user_id: pixel.user_id,
      visitors_api_url: pixel.visitors_api_url,
    });

    await logAuditAction(
      authResult.user.id,
      'fetch_visitors_api',
      req,
      res,
      'pixel',
      id,
      { totalFetched: result.totalFetched, totalUpserted: result.totalUpserted }
    );

    if (result.error) {
      return res.status(500).json({
        error: result.error,
        totalFetched: result.totalFetched,
        totalUpserted: result.totalUpserted,
      });
    }

    return res.status(200).json({
      success: true,
      totalFetched: result.totalFetched,
      totalUpserted: result.totalUpserted,
    });
  } catch (error) {
    console.error('Fetch visitors API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
