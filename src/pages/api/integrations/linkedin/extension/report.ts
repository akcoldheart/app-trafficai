import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getIntegrationByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('user_id, config, is_connected')
    .eq('platform', 'linkedin')
    .eq('is_connected', true);

  if (!data) return null;
  for (const row of data) {
    const config = (row.config || {}) as Record<string, unknown>;
    if (config.extension_token === token) return { user_id: row.user_id, config };
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Extension token required' });

  const integration = await getIntegrationByToken(token);
  if (!integration) return res.status(401).json({ error: 'Invalid extension token' });

  const { contact_id, campaign_id, status, error_message } = req.body;

  if (!contact_id || !campaign_id || !status) {
    return res.status(400).json({ error: 'contact_id, campaign_id, and status are required' });
  }

  try {
    const { data: campaign } = await supabaseAdmin
      .from('linkedin_campaigns')
      .select('id, user_id, name, total_sent')
      .eq('id', campaign_id)
      .eq('user_id', integration.user_id)
      .single();

    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }

    const updateData: Record<string, unknown> = { status };
    if (status === 'sent') {
      updateData.sent_at = new Date().toISOString();
    }
    if (error_message) {
      updateData.error_message = error_message;
    }

    await supabaseAdmin
      .from('linkedin_campaign_contacts')
      .update(updateData)
      .eq('id', contact_id)
      .eq('campaign_id', campaign_id);

    if (status === 'sent') {
      await supabaseAdmin
        .from('linkedin_campaigns')
        .update({
          total_sent: (campaign.total_sent || 0) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign_id);
    }

    await logEvent({
      type: 'api',
      event_name: 'linkedin_extension_send',
      status: status === 'sent' ? 'success' : 'error',
      message: status === 'sent'
        ? `LinkedIn connection request sent via extension (campaign: ${campaign.name})`
        : `LinkedIn connection request failed via extension: ${error_message}`,
      user_id: integration.user_id,
      response_data: { contact_id, campaign_id, status, error_message },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Extension report error:', error);
    return res.status(500).json({ error: 'Failed to report result' });
  }
}
