import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ref_code } = req.body;
  if (!ref_code || typeof ref_code !== 'string') {
    return res.status(400).json({ error: 'ref_code is required' });
  }

  // Get authenticated user
  const supabase = createClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || !user.email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    // Look up the referral code
    const { data: codeRow } = await supabaseAdmin
      .from('referral_codes')
      .select('id, user_id, commission_rate, cookie_duration_days')
      .eq('is_active', true)
      .ilike('code', ref_code)
      .single();

    if (!codeRow) {
      return res.status(200).json({ success: false, reason: 'invalid_code' });
    }

    // Don't let users refer themselves
    if (codeRow.user_id === user.id) {
      return res.status(200).json({ success: false, reason: 'self_referral' });
    }

    // Check if this user was already referred (prevent duplicates)
    const { data: existing } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referred_user_id', user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return res.status(200).json({ success: false, reason: 'already_referred' });
    }

    // Create referral record
    const attributionExpires = new Date();
    attributionExpires.setDate(attributionExpires.getDate() + (codeRow.cookie_duration_days || 30));

    await supabaseAdmin.from('referrals').insert({
      referrer_user_id: codeRow.user_id,
      referred_user_id: user.id,
      referral_code_id: codeRow.id,
      status: 'signed_up',
      referred_email: user.email,
      signed_up_at: new Date().toISOString(),
      commission_rate: codeRow.commission_rate,
      attribution_expires_at: attributionExpires.toISOString(),
    });

    // Update users.referred_by
    await supabaseAdmin
      .from('users')
      .update({ referred_by: codeRow.user_id })
      .eq('id', user.id);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Referral attribution error:', err);
    return res.status(500).json({ error: 'Attribution failed' });
  }
}
