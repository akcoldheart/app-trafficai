import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, logAuditAction } from '@/lib/api-helpers';
import type { IntegrationType } from '@/lib/supabase/types';

const INTEGRATION_DEFAULTS: Record<IntegrationType, { name: string; description: string }> = {
  facebook: { name: 'Facebook Ads', description: 'Sync audiences to Facebook Custom Audiences' },
  google: { name: 'Google Ads', description: 'Export to Google Ads Customer Match' },
  email: { name: 'Email Platform', description: 'Send contacts to your email marketing tool' },
  crm: { name: 'CRM', description: 'Sync visitor data to your CRM' },
  webhook: { name: 'Webhook', description: 'Send data to your custom endpoint' },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // List user's integrations with defaults
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching integrations:', error);
        return res.status(500).json({ error: 'Failed to fetch integrations' });
      }

      // Build response with all integration types, showing connected status
      const integrations = Object.entries(INTEGRATION_DEFAULTS).map(([type, defaults]) => {
        const existing = data?.find(i => i.type === type);
        return {
          type,
          name: defaults.name,
          description: defaults.description,
          is_connected: existing?.is_connected || false,
          config: existing?.config || {},
          last_sync_at: existing?.last_sync_at || null,
          id: existing?.id || null,
        };
      });

      return res.status(200).json({ integrations });
    }

    if (req.method === 'POST') {
      // Create or update integration
      const { type, config } = req.body;

      if (!type || !INTEGRATION_DEFAULTS[type as IntegrationType]) {
        return res.status(400).json({ error: 'Invalid integration type' });
      }

      const integrationType = type as IntegrationType;
      const defaults = INTEGRATION_DEFAULTS[integrationType];

      // Upsert integration
      const { data, error } = await supabase
        .from('integrations')
        .upsert({
          user_id: user.id,
          type: integrationType,
          name: defaults.name,
          config: config || {},
          is_connected: true,
        }, {
          onConflict: 'user_id,type',
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating integration:', error);
        return res.status(500).json({ error: 'Failed to create integration' });
      }

      await logAuditAction(user.id, 'connect_integration', req, res, 'integration', data.id, { type });
      return res.status(201).json({ integration: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
