import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Valid extension periods in days
const VALID_PERIODS = [7, 15];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can extend trials
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const { user } = auth;
  const { id } = req.query;

  if (typeof id !== 'string') {
    return res.status(400).json({ error: 'Invalid user ID' });
  }

  try {
    if (req.method === 'POST') {
      const { days } = req.body;

      if (!days || !VALID_PERIODS.includes(days)) {
        return res.status(400).json({
          error: `Invalid period. Must be one of: ${VALID_PERIODS.join(', ')} days`
        });
      }

      // Get current user to check their trial status
      const { data: targetUser, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('id, email, plan, trial_ends_at')
        .eq('id', id)
        .single();

      if (fetchError || !targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Calculate new trial end date
      // If user has an existing trial_ends_at, extend from that date (or now if expired)
      // Otherwise, extend from now
      const currentTrialEnd = targetUser.trial_ends_at
        ? new Date(targetUser.trial_ends_at)
        : new Date();

      // Use the later of current trial end or now as the base
      const baseDate = currentTrialEnd > new Date() ? currentTrialEnd : new Date();
      const newTrialEnd = new Date(baseDate);
      newTrialEnd.setDate(newTrialEnd.getDate() + days);

      // Update user's trial_ends_at and ensure plan is set to trial
      const { data: updatedUser, error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          trial_ends_at: newTrialEnd.toISOString(),
          plan: 'trial',
          trial_notified: false, // Reset notification flag
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, email, plan, trial_ends_at')
        .single();

      if (updateError) {
        console.error('Error extending trial:', updateError);
        return res.status(500).json({ error: 'Failed to extend trial' });
      }

      await logAuditAction(user.id, 'extend_trial', req, res, 'user', id, {
        days,
        new_trial_ends_at: newTrialEnd.toISOString()
      });

      return res.status(200).json({
        success: true,
        user: updatedUser,
        message: `Trial extended by ${days} days until ${newTrialEnd.toLocaleDateString()}`
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
