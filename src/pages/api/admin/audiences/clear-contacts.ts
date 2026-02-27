import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { audience_id } = req.body;

  if (!audience_id) {
    return res.status(400).json({ error: 'audience_id is required' });
  }

  const { error } = await supabaseAdmin
    .from('audience_contacts')
    .delete()
    .eq('audience_id', audience_id);

  if (error) {
    console.error('[ClearContacts] Error:', error);
    return res.status(500).json({ error: 'Failed to clear contacts' });
  }

  console.log(`[ClearContacts] Cleared contacts for audience ${audience_id}`);
  return res.status(200).json({ success: true });
}
