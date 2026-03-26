import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateCode(email: string): string {
  const prefix = email.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toLowerCase();
  const suffix = Math.random().toString(36).substring(2, 6);
  return `${prefix}${suffix}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    // Get or auto-create referral code for user
    let { data: codeRow } = await supabaseAdmin
      .from('referral_codes')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!codeRow) {
      // Auto-generate a unique code
      let code = generateCode(user.email || 'user');
      let attempts = 0;
      while (attempts < 10) {
        const { data: exists } = await supabaseAdmin
          .from('referral_codes')
          .select('id')
          .ilike('code', code)
          .limit(1);

        if (!exists || exists.length === 0) break;
        code = generateCode(user.email || 'user');
        attempts++;
      }

      const { data: newCode, error } = await supabaseAdmin
        .from('referral_codes')
        .insert({
          user_id: user.id,
          code,
          is_custom: false,
          commission_rate: 20.00,
        })
        .select('*')
        .single();

      if (error) {
        return res.status(500).json({ error: 'Failed to create referral code' });
      }
      codeRow = newCode;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.trafficai.io';
    return res.status(200).json({
      ...codeRow,
      referral_url: `${appUrl}/?ref=${codeRow.code}`,
    });
  }

  if (req.method === 'PUT') {
    // Update custom code
    const { code } = req.body;

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Code is required' });
    }

    // Validate: 3-20 chars, alphanumeric + hyphens
    if (!/^[a-zA-Z0-9-]{3,20}$/.test(code)) {
      return res.status(400).json({ error: 'Code must be 3-20 characters, alphanumeric and hyphens only' });
    }

    // Check uniqueness (case-insensitive)
    const { data: existing } = await supabaseAdmin
      .from('referral_codes')
      .select('id, user_id')
      .ilike('code', code)
      .limit(1);

    if (existing && existing.length > 0 && existing[0].user_id !== user.id) {
      return res.status(409).json({ error: 'This code is already taken' });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('referral_codes')
      .update({ code, is_custom: true, updated_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      return res.status(500).json({ error: 'Failed to update referral code' });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.trafficai.io';
    return res.status(200).json({
      ...updated,
      referral_url: `${appUrl}/?ref=${updated.code}`,
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
