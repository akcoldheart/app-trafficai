import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';

export const config = { maxDuration: 60 };

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PAGE_SIZE = 50;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;
  const userId = await getEffectiveUserId(user.id);

  const {
    page = '1',
    pixel_id,
    match_status,         // 'matched' | 'unmatched'
    days = '30',
    search,               // free-text on email / order number
  } = req.query;

  const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
  const daysBack = Math.max(1, Math.min(365, parseInt(String(days), 10) || 30));
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysBack);

  let query = supabaseAdmin
    .from('conversions')
    .select(`
      id,
      pixel_id,
      platform,
      external_order_number,
      order_url,
      customer_email,
      customer_first_name,
      customer_last_name,
      total_price,
      currency,
      financial_status,
      ordered_at,
      matched_visitor_id,
      matched_contact_id,
      match_method,
      identified_before_order
    `, { count: 'exact' })
    .eq('user_id', userId)
    .gte('ordered_at', sinceDate.toISOString())
    .order('ordered_at', { ascending: false });

  if (pixel_id && typeof pixel_id === 'string') {
    query = query.eq('pixel_id', pixel_id);
  }

  if (match_status === 'matched') {
    query = query.or('matched_visitor_id.not.is.null,matched_contact_id.not.is.null');
  } else if (match_status === 'unmatched') {
    query = query.is('matched_visitor_id', null).is('matched_contact_id', null);
  }

  if (search && typeof search === 'string' && search.trim()) {
    const term = search.trim();
    query = query.or(`customer_email.ilike.%${term}%,external_order_number.ilike.%${term}%`);
  }

  const from = (pageNum - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await query;
  if (error) {
    console.error('conversions list error:', error);
    return res.status(500).json({ error: error.message });
  }

  // Hydrate visitor + contact display names in one round-trip each
  const visitorIds = Array.from(new Set((data || []).map(c => c.matched_visitor_id).filter(Boolean))) as string[];
  const contactIds = Array.from(new Set((data || []).map(c => c.matched_contact_id).filter(Boolean))) as string[];

  const [visitorsRes, contactsRes] = await Promise.all([
    visitorIds.length > 0
      ? supabaseAdmin.from('visitors').select('id, full_name, email, company').in('id', visitorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null; company: string | null }> }),
    contactIds.length > 0
      ? supabaseAdmin.from('audience_contacts').select('id, full_name, email, company').in('id', contactIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null; company: string | null }> }),
  ]);

  const visitorById = new Map((visitorsRes.data || []).map(v => [v.id, v]));
  const contactById = new Map((contactsRes.data || []).map(c => [c.id, c]));

  const conversions = (data || []).map(c => ({
    ...c,
    matched_visitor: c.matched_visitor_id ? visitorById.get(c.matched_visitor_id) || null : null,
    matched_contact: c.matched_contact_id ? contactById.get(c.matched_contact_id) || null : null,
  }));

  return res.status(200).json({
    conversions,
    pagination: {
      page: pageNum,
      pageSize: PAGE_SIZE,
      total: count || 0,
      totalPages: Math.ceil((count || 0) / PAGE_SIZE),
    },
  });
}
