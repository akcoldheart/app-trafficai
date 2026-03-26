import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/api-helpers';

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

  // Get referral code
  const { data: codeRow } = await supabaseAdmin
    .from('referral_codes')
    .select('id, total_clicks')
    .eq('user_id', user.id)
    .single();

  if (!codeRow) {
    return res.status(200).json({
      total_clicks: 0,
      total_signups: 0,
      total_conversions: 0,
      total_revenue: 0,
      total_commission: 0,
      pending_commission: 0,
      referrals: [],
    });
  }

  // Get all referrals
  const { data: referrals } = await supabaseAdmin
    .from('referrals')
    .select('id, status, referred_email, signed_up_at, converted_at, plan_id, monthly_revenue, commission_amount, created_at')
    .eq('referrer_user_id', user.id)
    .order('created_at', { ascending: false });

  const allReferrals = referrals || [];
  const totalSignups = allReferrals.filter(r => ['signed_up', 'converted', 'churned'].includes(r.status)).length;
  const totalConversions = allReferrals.filter(r => r.status === 'converted').length;
  const totalRevenue = allReferrals.reduce((sum, r) => sum + Number(r.monthly_revenue || 0), 0);
  const totalCommission = allReferrals.filter(r => r.status === 'converted').reduce((sum, r) => sum + Number(r.commission_amount || 0), 0);

  // Calculate paid commissions
  const { data: payouts } = await supabaseAdmin
    .from('referral_payouts')
    .select('amount')
    .eq('user_id', user.id)
    .eq('status', 'paid');

  const totalPaid = (payouts || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return res.status(200).json({
    total_clicks: codeRow.total_clicks || 0,
    total_signups: totalSignups,
    total_conversions: totalConversions,
    total_revenue: totalRevenue,
    total_commission: totalCommission,
    pending_commission: totalCommission - totalPaid,
    referrals: allReferrals,
  });
}
