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
      .from('referral_payouts')
      .select('*, user:user_id(email)')
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ payouts: data || [] });
  }

  if (req.method === 'POST') {
    const { user_id, amount, payout_method, notes, period_start, period_end } = req.body;

    if (!user_id || !amount) {
      return res.status(400).json({ error: 'user_id and amount are required' });
    }

    const { data, error } = await supabaseAdmin
      .from('referral_payouts')
      .insert({
        user_id,
        amount,
        payout_method: payout_method || 'manual',
        notes,
        period_start,
        period_end,
        status: 'pending',
      })
      .select('*, user:user_id(email)')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json(data);
  }

  if (req.method === 'PUT') {
    const { id, status, payout_reference, notes } = req.body;

    if (!id || !status) {
      return res.status(400).json({ error: 'id and status are required' });
    }

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (payout_reference) updates.payout_reference = payout_reference;
    if (notes !== undefined) updates.notes = notes;

    const { data, error } = await supabaseAdmin
      .from('referral_payouts')
      .update(updates)
      .eq('id', id)
      .select('*, user:user_id(email)')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
