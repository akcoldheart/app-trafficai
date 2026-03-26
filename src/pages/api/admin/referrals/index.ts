import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getUserProfile } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const profile = await getUserProfile(user.id, req, res);
  if (profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { status, page = '1', limit = '50' } = req.query;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.min(100, parseInt(limit as string));
  const from = (pageNum - 1) * limitNum;

  let query = supabaseAdmin
    .from('referrals')
    .select('*, referrer:referrer_user_id(email), referred:referred_user_id(email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limitNum - 1);

  if (status && typeof status === 'string') {
    query = query.eq('status', status);
  }

  const { data, error, count } = await query;

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  return res.status(200).json({
    referrals: data || [],
    total: count || 0,
    page: pageNum,
    total_pages: Math.ceil((count || 0) / limitNum),
  });
}
