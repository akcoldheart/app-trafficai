import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getUserProfile } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const profile = await getUserProfile(user.id, req, res);
  if (profile.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabaseAdmin
      .from('referral_codes')
      .select('*, user:user_id(email)')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ codes: data || [] });
  }

  if (req.method === 'PUT') {
    const { id, code, commission_rate, is_active, cookie_duration_days } = req.body;

    if (!id) return res.status(400).json({ error: 'ID is required' });

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (code !== undefined) {
      // Validate code
      if (!/^[a-zA-Z0-9-]{3,20}$/.test(code)) {
        return res.status(400).json({ error: 'Code must be 3-20 characters, alphanumeric and hyphens only' });
      }
      // Check uniqueness
      const { data: existing } = await supabaseAdmin
        .from('referral_codes')
        .select('id')
        .ilike('code', code)
        .neq('id', id)
        .limit(1);

      if (existing && existing.length > 0) {
        return res.status(409).json({ error: 'This code is already taken' });
      }
      updates.code = code;
      updates.is_custom = true;
    }

    if (commission_rate !== undefined) updates.commission_rate = commission_rate;
    if (is_active !== undefined) updates.is_active = is_active;
    if (cookie_duration_days !== undefined) updates.cookie_duration_days = cookie_duration_days;

    const { data, error } = await supabaseAdmin
      .from('referral_codes')
      .update(updates)
      .eq('id', id)
      .select('*, user:user_id(email)')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
