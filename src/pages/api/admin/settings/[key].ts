import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';

// Determine the category based on the key prefix
function getCategoryForKey(key: string): string | null {
  if (key.startsWith('stripe_') || key === 'app_url') {
    return 'stripe';
  }
  if (key.startsWith('plan_')) {
    return 'pricing';
  }
  return null;
}

// Determine if a key should be marked as secret
function isSecretKey(key: string): boolean {
  return key === 'stripe_secret_key' || key === 'stripe_webhook_secret';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can access settings
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const { key } = req.query;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ error: 'Setting key is required' });
  }

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', key)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Setting not found' });
        }
        return res.status(500).json({ error: 'Failed to fetch setting' });
      }

      return res.status(200).json({ setting: data });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { value, description } = req.body;

      if (value === undefined) {
        return res.status(400).json({ error: 'Value is required' });
      }

      // Build the upsert data with category and is_secret based on key
      const category = getCategoryForKey(key);
      const is_secret = isSecretKey(key);

      const upsertData: {
        key: string;
        value: string;
        description?: string;
        category?: string;
        is_secret?: boolean;
        updated_at: string;
      } = {
        key,
        value,
        updated_at: new Date().toISOString(),
      };

      if (description !== undefined) {
        upsertData.description = description;
      }

      if (category) {
        upsertData.category = category;
      }

      if (is_secret) {
        upsertData.is_secret = true;
      }

      // Use upsert to create or update the setting
      const { data, error } = await supabase
        .from('app_settings')
        .upsert(upsertData, { onConflict: 'key' })
        .select()
        .single();

      if (error) {
        console.error('Error upserting setting:', error);
        return res.status(500).json({ error: 'Failed to save setting' });
      }

      await logAuditAction(authResult.user.id, 'update_app_setting', req, res, 'app_setting', data.id, { key });
      return res.status(200).json({ setting: data });
    }

    if (req.method === 'DELETE') {
      // Prevent deletion of core settings
      if (['api_base_url', 'api_endpoints'].includes(key)) {
        return res.status(400).json({ error: 'Cannot delete core settings' });
      }

      const { data, error } = await supabase
        .from('app_settings')
        .delete()
        .eq('key', key)
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({ error: 'Setting not found' });
        }
        console.error('Error deleting setting:', error);
        return res.status(500).json({ error: 'Failed to delete setting' });
      }

      await logAuditAction(authResult.user.id, 'delete_app_setting', req, res, 'app_setting', data.id, { key });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
