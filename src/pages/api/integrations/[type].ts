import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, logAuditAction } from '@/lib/api-helpers';
import type { IntegrationType, Database } from '@/lib/supabase/types';

type IntegrationUpdate = Database['public']['Tables']['integrations']['Update'];

const VALID_TYPES: IntegrationType[] = ['facebook', 'google', 'email', 'crm', 'webhook'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { type } = req.query;
  if (!type || typeof type !== 'string' || !VALID_TYPES.includes(type as IntegrationType)) {
    return res.status(400).json({ error: 'Invalid integration type' });
  }

  const integrationType = type as IntegrationType;
  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // Get single integration
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', user.id)
        .eq('type', integrationType)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Integration not found', is_connected: false });
      }

      return res.status(200).json({ integration: data });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      // Update integration config
      const { config, is_connected } = req.body;
      const updates: IntegrationUpdate = {};

      if (config !== undefined) updates.config = config;
      if (is_connected !== undefined) updates.is_connected = is_connected;

      const { data, error } = await supabase
        .from('integrations')
        .update(updates)
        .eq('user_id', user.id)
        .eq('type', integrationType)
        .select()
        .single();

      if (error || !data) {
        return res.status(404).json({ error: 'Integration not found' });
      }

      await logAuditAction(user.id, 'update_integration', req, res, 'integration', data.id, { type: integrationType });
      return res.status(200).json({ integration: data });
    }

    if (req.method === 'DELETE') {
      // Disconnect integration
      const disconnectUpdate: IntegrationUpdate = { is_connected: false, config: {} };
      const { error } = await supabase
        .from('integrations')
        .update(disconnectUpdate)
        .eq('user_id', user.id)
        .eq('type', integrationType);

      if (error) {
        console.error('Error disconnecting integration:', error);
        return res.status(500).json({ error: 'Failed to disconnect integration' });
      }

      await logAuditAction(user.id, 'disconnect_integration', req, res, 'integration', integrationType);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
