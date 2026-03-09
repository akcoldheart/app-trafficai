import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { api_key } = req.body;

  if (!api_key || typeof api_key !== 'string') {
    return res.status(400).json({ error: 'API key is required' });
  }

  // Test the API key by fetching lists from Klaviyo
  try {
    const testResponse = await fetch('https://a.klaviyo.com/api/lists', {
      headers: {
        'Authorization': `Klaviyo-API-Key ${api_key}`,
        'accept': 'application/json',
        'revision': '2024-10-15',
      },
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => null);
      return res.status(400).json({
        error: 'Invalid Klaviyo API key. Please check your key and try again.',
        details: errorData?.errors?.[0]?.detail || testResponse.statusText,
      });
    }

    // Save the integration
    const { data, error } = await supabaseAdmin
      .from('platform_integrations')
      .upsert(
        {
          user_id: user.id,
          platform: 'klaviyo',
          api_key,
          is_connected: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error saving Klaviyo integration:', error);
      return res.status(500).json({ error: 'Failed to save integration' });
    }

    const config = (data.config || {}) as Record<string, unknown>;
    return res.status(200).json({
      success: true,
      message: 'Klaviyo connected successfully',
      integration: {
        id: data.id,
        is_connected: data.is_connected,
        default_list_id: config.default_list_id || null,
        default_list_name: config.default_list_name || null,
        auto_sync_visitors: config.auto_sync_visitors || false,
        auto_sync_pixel_id: config.auto_sync_pixel_id || null,
        last_synced_at: data.last_synced_at,
        created_at: data.created_at,
      },
    });
  } catch (error) {
    console.error('Error connecting to Klaviyo:', error);
    return res.status(500).json({ error: 'Failed to connect to Klaviyo' });
  }
}
