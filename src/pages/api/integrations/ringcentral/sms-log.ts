import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = 50;
    const from = (page - 1) * pageSize;

    const { data, error, count } = await supabaseAdmin
      .from('ringcentral_sms_log')
      .select('*', { count: 'exact' })
      .eq('user_id', effectiveUserId)
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    return res.status(200).json({
      sms_log: data || [],
      total: count || 0,
      page,
      page_size: pageSize,
    });
  } catch (error) {
    console.error('Error fetching SMS log:', error);
    return res.status(500).json({ error: 'Failed to fetch SMS log' });
  }
}
