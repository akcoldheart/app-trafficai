import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, getUserProfile } from '@/lib/api-helpers';
import { fetchVisitorsFromApi } from '@/lib/visitors-api-fetcher';

// Allow up to 5 minutes for large syncs (3000+ contacts)
export const config = {
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid pixel ID' });
  }

  const supabase = createClient(req, res);
  const profile = await getUserProfile(user.id, req, res);
  const isAdmin = profile.role === 'admin';

  try {
    // Get the pixel - users can only sync their own, admins can sync any
    let query = supabase
      .from('pixels')
      .select('id, user_id, visitors_api_url')
      .eq('id', id);

    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { data: pixel, error: pixelError } = await query.single();

    if (pixelError || !pixel) {
      return res.status(404).json({ error: 'Pixel not found' });
    }

    if (!pixel.visitors_api_url) {
      // No API URL configured - just return success with 0 counts
      return res.status(200).json({
        success: true,
        totalFetched: 0,
        totalUpserted: 0,
        message: 'No visitors API URL configured for this pixel',
      });
    }

    const result = await fetchVisitorsFromApi({
      id: pixel.id,
      user_id: pixel.user_id,
      visitors_api_url: pixel.visitors_api_url,
    });

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
    console.error('Sync visitors error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
