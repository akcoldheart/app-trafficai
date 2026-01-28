import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can access settings
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .order('key');

      if (error) {
        console.error('Error fetching app settings:', error);
        return res.status(500).json({ error: 'Failed to fetch settings' });
      }

      // Convert array to object for easier access
      const settings: Record<string, { id: string; value: string; description: string | null }> = {};
      data?.forEach((setting) => {
        settings[setting.key] = {
          id: setting.id,
          value: setting.value,
          description: setting.description,
        };
      });

      return res.status(200).json({ settings, raw: data });
    }

    if (req.method === 'POST') {
      const { key, value, description } = req.body;

      if (!key || value === undefined) {
        return res.status(400).json({ error: 'Key and value are required' });
      }

      const { data, error } = await supabase
        .from('app_settings')
        .insert({ key, value, description })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          return res.status(400).json({ error: 'Setting with this key already exists' });
        }
        console.error('Error creating setting:', error);
        return res.status(500).json({ error: 'Failed to create setting' });
      }

      await logAuditAction(authResult.user.id, 'create_app_setting', req, res, 'app_setting', data.id, { key });
      return res.status(201).json({ setting: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
