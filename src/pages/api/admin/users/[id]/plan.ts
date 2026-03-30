import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Valid plans
const VALID_PLANS = ['trial', 'starter', 'growth', 'professional', 'enterprise'];

// Monthly prices for referral commission calculation (in dollars)
const PLAN_MONTHLY_PRICES: Record<string, number> = {
  trial: 0,
  starter: 500,
  growth: 800,
  professional: 1200,
  enterprise: 0, // custom pricing
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can change user plans
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user } = auth;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    if (req.method === 'PUT') {
      const { plan } = req.body;

      if (!plan || !VALID_PLANS.includes(plan)) {
        return res.status(400).json({
          error: `Invalid plan. Must be one of: ${VALID_PLANS.join(', ')}`
        });
      }

      // Update user's plan
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          plan,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, email, plan')
        .single();

      if (updateError) {
        console.error('Error updating user plan:', updateError);
        return res.status(500).json({ error: 'Failed to update user plan' });
      }

      await logAuditAction(user.id, 'update_user_plan', req, res, 'user', id, { plan });

      // Track referral conversion/update when admin changes plan
      try {
        const monthlyRevenue = PLAN_MONTHLY_PRICES[plan] || 0;
        const isPaidPlan = monthlyRevenue > 0;

        // Check if this user was referred
        const { data: referralRow } = await supabaseAdmin
          .from('referrals')
          .select('id, status, commission_rate')
          .eq('referred_user_id', id)
          .in('status', ['signed_up', 'converted'])
          .single();

        if (referralRow) {
          if (isPaidPlan) {
            // Convert or update the referral
            const commissionAmount = monthlyRevenue * ((referralRow.commission_rate || 20) / 100);
            await supabaseAdmin
              .from('referrals')
              .update({
                status: 'converted',
                converted_at: referralRow.status === 'signed_up' ? new Date().toISOString() : undefined,
                plan_id: plan,
                monthly_revenue: monthlyRevenue,
                commission_amount: commissionAmount,
                updated_at: new Date().toISOString(),
              })
              .eq('id', referralRow.id);
          } else if (plan === 'trial' && referralRow.status === 'converted') {
            // Downgraded back to trial — mark as churned
            await supabaseAdmin
              .from('referrals')
              .update({
                status: 'churned',
                monthly_revenue: 0,
                commission_amount: 0,
                updated_at: new Date().toISOString(),
              })
              .eq('id', referralRow.id);
          }
        }
      } catch (refErr) {
        console.error('Referral tracking on plan change error:', refErr);
      }

      return res.status(200).json({
        success: true,
        user: updatedUser,
        message: `Plan updated to ${plan}`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
