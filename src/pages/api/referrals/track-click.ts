import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Code is required' });
  }

  // Look up code, increment clicks, and return cookie duration
  const { data: codeRow } = await supabaseAdmin
    .from('referral_codes')
    .select('id, total_clicks, cookie_duration_days')
    .ilike('code', code)
    .eq('is_active', true)
    .single();

  if (!codeRow) {
    return res.status(200).json({ success: false, valid: false });
  }

  await supabaseAdmin
    .from('referral_codes')
    .update({
      total_clicks: (codeRow.total_clicks || 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('id', codeRow.id);

  return res.status(200).json({
    success: true,
    valid: true,
    cookie_duration_days: codeRow.cookie_duration_days || 30,
  });
}
