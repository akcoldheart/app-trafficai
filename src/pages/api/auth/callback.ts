import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Attribute a referral: link the new user to the referrer who shared the code.
 */
async function attributeReferral(userId: string, userEmail: string, refCode: string) {
  try {
    // Look up the referral code
    const { data: codeRow } = await supabaseAdmin
      .from('referral_codes')
      .select('id, user_id, commission_rate, cookie_duration_days')
      .eq('is_active', true)
      .ilike('code', refCode)
      .single();

    if (!codeRow) return;

    // Don't let users refer themselves
    if (codeRow.user_id === userId) return;

    // Check if this user was already referred (prevent duplicates)
    const { data: existing } = await supabaseAdmin
      .from('referrals')
      .select('id')
      .eq('referred_user_id', userId)
      .limit(1);

    if (existing && existing.length > 0) return;

    // Create referral record
    const attributionExpires = new Date();
    attributionExpires.setDate(attributionExpires.getDate() + (codeRow.cookie_duration_days || 30));

    await supabaseAdmin.from('referrals').insert({
      referrer_user_id: codeRow.user_id,
      referred_user_id: userId,
      referral_code_id: codeRow.id,
      status: 'signed_up',
      referred_email: userEmail,
      signed_up_at: new Date().toISOString(),
      commission_rate: codeRow.commission_rate,
      attribution_expires_at: attributionExpires.toISOString(),
    });

    // Update users.referred_by
    await supabaseAdmin
      .from('users')
      .update({ referred_by: codeRow.user_id })
      .eq('id', userId);

  } catch (err) {
    // Don't fail auth if referral attribution fails
    console.error('Referral attribution error:', err);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, redirect: redirectTo, ref_code } = req.query;

  if (!code || typeof code !== 'string') {
    return res.redirect('/auth/login?error=No+authorization+code+provided');
  }

  try {
    const supabase = createClient(req, res);

    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Code exchange error:', error.message);

      // Check if we have a session despite the error
      const { data: sessionAfterError } = await supabase.auth.getSession();
      if (sessionAfterError?.session) {
        const finalRedirect = typeof redirectTo === 'string' ? redirectTo : '/';
        return res.redirect(finalRedirect);
      }

      return res.redirect('/auth/login?error=Authentication+failed');
    }

    if (!data.session) {
      return res.redirect('/auth/login?error=Authentication+failed');
    }

    // Attribute referral if ref_code is present
    // Priority: 1) query param (OAuth redirect), 2) cookie (most reliable, survives OAuth chain), 3) user metadata (email signup)
    const refCodeFromCookie = req.cookies.ref_code || null;
    const refCodeValue = (typeof ref_code === 'string' ? ref_code : null)
      || refCodeFromCookie
      || data.session.user.user_metadata?.ref_code
      || null;

    if (refCodeValue && data.session.user.id && data.session.user.email) {
      console.log(`[Referral] Attributing ref_code="${refCodeValue}" to user=${data.session.user.email} (source: ${typeof ref_code === 'string' ? 'query' : refCodeFromCookie ? 'cookie' : 'metadata'})`);
      await attributeReferral(data.session.user.id, data.session.user.email, refCodeValue);

      // Clear the ref_code cookie after successful attribution
      res.setHeader('Set-Cookie', 'ref_code=; Path=/; Max-Age=0; SameSite=Lax');
    }

    // Successfully authenticated, redirect to the requested page or home
    const finalRedirect = typeof redirectTo === 'string' ? redirectTo : '/';
    return res.redirect(finalRedirect);
  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect('/auth/login?error=Authentication+failed');
  }
}
