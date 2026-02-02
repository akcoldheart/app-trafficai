import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Valid plans
const VALID_PLANS = ['trial', 'starter', 'growth', 'professional', 'enterprise'];

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
