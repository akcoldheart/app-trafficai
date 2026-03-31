import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function countVisitors(userId: string, filters: Record<string, unknown> = {}): Promise<number> {
  let query = supabaseAdmin
    .from('visitors')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  for (const [key, value] of Object.entries(filters)) {
    if (key === 'not_null') {
      query = query.not(value as string, 'is', null);
    } else if (key === 'in') {
      const [col, vals] = value as [string, string[]];
      query = query.in(col, vals);
    } else {
      query = query.eq(key, value);
    }
  }

  const { count } = await query;
  return count || 0;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const [totalWithEmail, verified, valid, invalid, catchAll, unknown] = await Promise.all([
      // Total visitors with email
      supabaseAdmin
        .from('visitors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('email', 'is', null)
        .then(r => r.count || 0),
      // Verified visitors
      supabaseAdmin
        .from('visitors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .not('email', 'is', null)
        .not('email_verified_at', 'is', null)
        .then(r => r.count || 0),
      // Valid
      supabaseAdmin
        .from('visitors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('email_status', 'valid')
        .then(r => r.count || 0),
      // Invalid (all bad statuses)
      supabaseAdmin
        .from('visitors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .in('email_status', ['invalid', 'spamtrap', 'abuse', 'do_not_mail'])
        .then(r => r.count || 0),
      // Catch-all
      supabaseAdmin
        .from('visitors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('email_status', 'catch-all')
        .then(r => r.count || 0),
      // Unknown
      supabaseAdmin
        .from('visitors')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('email_status', 'unknown')
        .then(r => r.count || 0),
    ]);

    return res.status(200).json({
      total_with_email: totalWithEmail,
      verified,
      unverified: totalWithEmail - verified,
      valid,
      invalid,
      catch_all: catchAll,
      unknown,
    });
  } catch (error) {
    return res.status(500).json({ error: (error as Error).message });
  }
}
