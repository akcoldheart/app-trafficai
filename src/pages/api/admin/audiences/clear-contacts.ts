import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/api-helpers';
import { logEvent } from '@/lib/webhook-logger';

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

  // Reset total_records in form_data so list page doesn't show stale count
  const { data: reqRow } = await supabaseAdmin
    .from('audience_requests')
    .select('id, form_data')
    .eq('audience_id', audience_id)
    .single();

  if (reqRow) {
    const formData = (reqRow.form_data || {}) as Record<string, unknown>;
    const manualAudience = (formData.manual_audience || {}) as Record<string, unknown>;
    await supabaseAdmin
      .from('audience_requests')
      .update({
        admin_notes: 'Re-importing...',
        form_data: {
          ...formData,
          manual_audience: {
            ...manualAudience,
            total_records: 0,
          },
        },
      })
      .eq('id', reqRow.id);
  }

  await logEvent({
    type: 'audience',
    event_name: 'audience_contacts_cleared',
    status: 'info',
    message: `Audience contacts cleared for re-import: ${audience_id}`,
    user_id: authResult.user.id,
    request_data: { audience_id },
  });

  console.log(`[ClearContacts] Cleared contacts for audience ${audience_id}`);
  return res.status(200).json({ success: true });
}
