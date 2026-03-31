import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { verifyAndUpdateVisitors } from '@/lib/email-verification';
import { logEvent } from '@/lib/webhook-logger';

export const config = {
  maxDuration: 300,
};

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { pixel_id, reverify } = req.body;

  try {
    // Fetch visitors that need verification
    let query = supabaseAdmin
      .from('visitors')
      .select('id, email')
      .eq('user_id', user.id)
      .not('email', 'is', null);

    if (pixel_id) {
      query = query.eq('pixel_id', pixel_id);
    }

    // Only unverified unless reverify is requested
    if (!reverify) {
      query = query.is('email_verified_at', null);
    }

    const { data: visitors, error } = await query.limit(5000);
    if (error) throw error;

    if (!visitors || visitors.length === 0) {
      return res.status(200).json({ message: 'No visitors to verify', verified: 0 });
    }

    const result = await verifyAndUpdateVisitors(
      visitors.map(v => ({ id: v.id, email: v.email! })),
      user.id
    );

    await logEvent({
      type: 'api',
      event_name: 'zerobounce_manual_verify',
      status: result.invalid > 0 ? 'warning' : 'success',
      message: `Verified ${result.verified} emails: ${result.valid} valid, ${result.invalid} invalid, ${result.unknown} unknown`,
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      request_data: { pixel_id: pixel_id || 'all', reverify: !!reverify, total_queued: visitors.length },
      response_data: result,
    });

    return res.status(200).json({
      success: true,
      ...result,
      message: `Verified ${result.verified} emails: ${result.valid} valid, ${result.invalid} invalid, ${result.unknown} unknown`,
    });
  } catch (error) {
    console.error('Email verification error:', error);

    await logEvent({
      type: 'api',
      event_name: 'zerobounce_manual_verify',
      status: 'error',
      message: 'Manual email verification failed',
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      error_details: (error as Error).message,
    });

    return res.status(500).json({ error: (error as Error).message });
  }
}
