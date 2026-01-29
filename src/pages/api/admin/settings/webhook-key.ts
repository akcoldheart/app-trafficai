import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import crypto from 'crypto';

// Generate a secure random API key
function generateApiKey(): string {
  return `whk_${crypto.randomBytes(32).toString('hex')}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can manage webhook keys
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      // Get current webhook key
      const { data: setting, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('key', 'webhook_api_key')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching webhook key:', error);
        return res.status(500).json({ error: 'Failed to fetch webhook key' });
      }

      // Return masked key if it exists
      if (setting?.value) {
        const maskedKey = setting.value.substring(0, 8) + '••••••••' + setting.value.slice(-8);
        return res.status(200).json({
          exists: true,
          maskedKey,
          createdAt: setting.created_at,
          updatedAt: setting.updated_at,
        });
      }

      return res.status(200).json({ exists: false });
    }

    if (req.method === 'POST') {
      // Generate new webhook key
      const newKey = generateApiKey();

      // Check if key already exists
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', 'webhook_api_key')
        .single();

      if (existing) {
        // Update existing key
        const { error: updateError } = await supabase
          .from('app_settings')
          .update({
            value: newKey,
            updated_at: new Date().toISOString(),
          })
          .eq('key', 'webhook_api_key');

        if (updateError) {
          console.error('Error updating webhook key:', updateError);
          return res.status(500).json({ error: 'Failed to update webhook key' });
        }

        await logAuditAction(authResult.user.id, 'regenerate_webhook_key', req, res, 'app_setting', existing.id);
      } else {
        // Create new key
        const { data: newSetting, error: createError } = await supabase
          .from('app_settings')
          .insert({
            key: 'webhook_api_key',
            value: newKey,
            description: 'API key for webhook authentication from identitypxl.app',
          })
          .select()
          .single();

        if (createError) {
          console.error('Error creating webhook key:', createError);
          return res.status(500).json({ error: 'Failed to create webhook key' });
        }

        await logAuditAction(authResult.user.id, 'create_webhook_key', req, res, 'app_setting', newSetting.id);
      }

      // Return the full key (only shown once on creation/regeneration)
      return res.status(200).json({
        success: true,
        apiKey: newKey,
        message: 'Webhook API key generated. Copy it now as it won\'t be shown again.',
      });
    }

    if (req.method === 'DELETE') {
      // Delete webhook key
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', 'webhook_api_key')
        .single();

      if (!existing) {
        return res.status(404).json({ error: 'Webhook key not found' });
      }

      const { error: deleteError } = await supabase
        .from('app_settings')
        .delete()
        .eq('key', 'webhook_api_key');

      if (deleteError) {
        console.error('Error deleting webhook key:', deleteError);
        return res.status(500).json({ error: 'Failed to delete webhook key' });
      }

      await logAuditAction(authResult.user.id, 'delete_webhook_key', req, res, 'app_setting', existing.id);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
