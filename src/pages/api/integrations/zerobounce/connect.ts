import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { getZeroBounceCredits } from '@/lib/email-verification';
import { logEvent } from '@/lib/webhook-logger';

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

  try {
    // Validate the API key by checking credits
    const credits = await getZeroBounceCredits(api_key);

    // Save the integration
    const { data, error } = await supabaseAdmin
      .from('platform_integrations')
      .upsert(
        {
          user_id: user.id,
          platform: 'zerobounce',
          api_key,
          is_connected: true,
          config: {
            auto_verify: true,
            allow_catch_all: true,
            allow_unknown: true,
            verify_on_sync: true,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,platform' }
      )
      .select()
      .single();

    if (error) {
      console.error('Error saving ZeroBounce integration:', error);
      return res.status(500).json({ error: 'Failed to save integration' });
    }

    await logEvent({
      type: 'api',
      event_name: 'zerobounce_connect',
      status: 'success',
      message: `ZeroBounce connected successfully (${credits} credits available)`,
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      response_data: { credits },
    });

    return res.status(200).json({
      success: true,
      message: 'ZeroBounce connected successfully',
      integration: {
        id: data.id,
        is_connected: data.is_connected,
        config: data.config,
        credits,
      },
    });
  } catch (error) {
    console.error('Error connecting to ZeroBounce:', error);

    await logEvent({
      type: 'api',
      event_name: 'zerobounce_connect',
      status: 'error',
      message: 'Failed to connect ZeroBounce',
      user_id: user.id,
      ip_address: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || undefined,
      error_details: (error as Error).message,
    });

    return res.status(400).json({
      error: 'Invalid ZeroBounce API key. Please check your key and try again.',
      details: (error as Error).message,
    });
  }
}
