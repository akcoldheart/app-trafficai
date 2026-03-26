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

  // Get all referrals
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('referrer_user_id, status, monthly_revenue, commission_amount');

  const all = referrals || [];
  const totalSignups = all.filter(r => ['signed_up', 'converted', 'churned'].includes(r.status)).length;
  const totalConversions = all.filter(r => r.status === 'converted').length;
  const totalRevenue = all.reduce((sum, r) => sum + Number(r.monthly_revenue || 0), 0);
  const totalCommission = all.filter(r => r.status === 'converted').reduce((sum, r) => sum + Number(r.commission_amount || 0), 0);

  // Total clicks across all codes
  const { data: codes } = await supabaseAdmin
    .from('referral_codes')
    .select('user_id, total_clicks, code, user:user_id(email)');

  const totalClicks = (codes || []).reduce((sum, c) => sum + (c.total_clicks || 0), 0);
  const conversionRate = totalSignups > 0 ? ((totalConversions / totalSignups) * 100).toFixed(1) : '0.0';

  // Top affiliates
  const affiliateMap = new Map<string, { email: string; signups: number; conversions: number; revenue: number; commission: number }>();
  for (const r of all) {
    const existing = affiliateMap.get(r.referrer_user_id) || { email: '', signups: 0, conversions: 0, revenue: 0, commission: 0 };
    if (['signed_up', 'converted', 'churned'].includes(r.status)) existing.signups++;
    if (r.status === 'converted') {
      existing.conversions++;
      existing.revenue += Number(r.monthly_revenue || 0);
      existing.commission += Number(r.commission_amount || 0);
    }
    affiliateMap.set(r.referrer_user_id, existing);
  }

  // Add emails from codes
  for (const code of (codes || [])) {
    const aff = affiliateMap.get(code.user_id);
    if (aff && code.user) {
      const userData = code.user as unknown as { email: string };
      aff.email = userData?.email || '';
    }
  }

  const topAffiliates = Array.from(affiliateMap.entries())
    .map(([user_id, data]) => ({ user_id, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  // Total paid out
  const { data: payouts } = await supabaseAdmin
    .from('referral_payouts')
    .select('amount')
    .eq('status', 'paid');

  const totalPaid = (payouts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return res.status(200).json({
    total_clicks: totalClicks,
    total_signups: totalSignups,
    total_conversions: totalConversions,
    conversion_rate: conversionRate,
    total_revenue: totalRevenue,
    total_commission: totalCommission,
    total_paid: totalPaid,
    outstanding_commission: totalCommission - totalPaid,
    total_codes: (codes || []).length,
    top_affiliates: topAffiliates,
  });
}
