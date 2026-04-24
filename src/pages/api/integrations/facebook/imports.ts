import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);
  const scope = (req.query.scope as string) === 'all' ? 'all' : 'failed';

  try {
    let query = supabaseAdmin
      .from('facebook_audience_imports')
      .delete({ count: 'exact' })
      .eq('user_id', effectiveUserId);

    if (scope === 'failed') {
      query = query.eq('status', 'failed');
    }

    const { error, count } = await query;
    if (error) throw error;

    await logEvent({
      type: 'api',
      event_name: 'facebook_imports_clear',
      status: 'success',
      message: `Cleared ${count ?? 0} Facebook import history rows (scope=${scope})`,
      user_id: user.id,
      ip_address: getClientIp(req),
    });

    return res.status(200).json({ success: true, deleted: count ?? 0, scope });
  } catch (error) {
    console.error('Error clearing Facebook import history:', error);
    await logEvent({
      type: 'api',
      event_name: 'facebook_imports_clear',
      status: 'error',
      message: 'Failed to clear Facebook import history',
      user_id: user.id,
      ip_address: getClientIp(req),
      error_details: (error as Error).message,
    });
    return res.status(500).json({ error: 'Failed to clear import history' });
  }
}
