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

  // Get current click count and increment
  const { data: codeRow } = await supabaseAdmin
    .from('referral_codes')
    .select('id, total_clicks')
    .ilike('code', code)
    .eq('is_active', true)
    .single();

  if (codeRow) {
    await supabaseAdmin
      .from('referral_codes')
      .update({ total_clicks: (codeRow.total_clicks || 0) + 1 })
      .eq('id', codeRow.id);
  }

  return res.status(200).json({ success: true });
}
