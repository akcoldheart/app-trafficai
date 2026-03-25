import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { updateIntegrationConfig, getIntegration } from '@/lib/integrations';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  // GET: List templates
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabaseAdmin
        .from('ringcentral_sms_templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ templates: data || [] });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch templates' });
    }
  }

  // POST: Create/Update template
  if (req.method === 'POST') {
    const { id, pixel_id, name, message_template, is_active, filters } = req.body;

    if (!pixel_id || !message_template) {
      return res.status(400).json({ error: 'pixel_id and message_template are required' });
    }

    try {
      if (id) {
        // Update
        const { data, error } = await supabaseAdmin
          .from('ringcentral_sms_templates')
          .update({
            name: name || 'Default Template',
            message_template,
            is_active: is_active !== undefined ? is_active : true,
            filters: filters || { new_visitors_only: true, frequency_cap_hours: 24, time_window_start: '09:00', time_window_end: '18:00', time_window_tz: 'America/New_York', min_lead_score: 0 },
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .eq('user_id', user.id)
          .select()
          .single();

        if (error) throw error;
        return res.status(200).json({ template: data });
      } else {
        // Create
        const { data, error } = await supabaseAdmin
          .from('ringcentral_sms_templates')
          .insert({
            user_id: user.id,
            pixel_id,
            name: name || 'Default Template',
            message_template,
            is_active: is_active !== undefined ? is_active : true,
            filters: filters || { new_visitors_only: true, frequency_cap_hours: 24, time_window_start: '09:00', time_window_end: '18:00', time_window_tz: 'America/New_York', min_lead_score: 0 },
          })
          .select()
          .single();

        if (error) throw error;
        return res.status(201).json({ template: data });
      }
    } catch (error) {
      console.error('Error saving template:', error);
      return res.status(500).json({ error: 'Failed to save template' });
    }
  }

  // DELETE: Remove template
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) {
      return res.status(400).json({ error: 'Template id is required' });
    }

    try {
      const { error } = await supabaseAdmin
        .from('ringcentral_sms_templates')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to delete template' });
    }
  }

  // PATCH: Update from_number
  if (req.method === 'PATCH') {
    const { from_number } = req.body;
    if (!from_number) {
      return res.status(400).json({ error: 'from_number is required' });
    }

    try {
      const integration = await getIntegration(user.id, 'ringcentral');
      if (!integration) {
        return res.status(401).json({ error: 'RingCentral not connected' });
      }

      const config = (integration.config || {}) as Record<string, unknown>;
      await updateIntegrationConfig(user.id, 'ringcentral', {
        ...config,
        rc_from_number: from_number,
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update from number' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
