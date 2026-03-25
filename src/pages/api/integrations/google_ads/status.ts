import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegrationStatus, disconnectIntegration } from '@/lib/integrations';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'google_ads';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const [integration, importsResult, conversionsResult] = await Promise.all([
        getIntegrationStatus(user.id, PLATFORM),
        supabaseAdmin
          .from('google_ads_audience_imports')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabaseAdmin
          .from('google_ads_conversion_uploads')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const config = (integration?.config || {}) as Record<string, unknown>;
      const expiresAt = config.token_expires_at as string | null;
      const tokenExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;

      return res.status(200).json({
        integration: integration || null,
        token_info: {
          customer_id: config.customer_id || null,
          customer_name: config.customer_name || null,
          token_expires_at: expiresAt || null,
          token_expired: tokenExpired,
        },
        imports: importsResult.data || [],
        conversions: conversionsResult.data || [],
      });
    } catch (error) {
      console.error('Error fetching Google Ads status:', error);
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await disconnectIntegration(user.id, PLATFORM);

      await logEvent({
        type: 'api',
        event_name: 'google_ads_disconnect',
        status: 'success',
        message: 'Google Ads integration disconnected',
        user_id: user.id,
        ip_address: getClientIp(req),
      });

      return res.status(200).json({ success: true, message: 'Google Ads disconnected' });
    } catch (error) {
      console.error('Error disconnecting Google Ads:', error);
      return res.status(500).json({ error: 'Failed to disconnect Google Ads' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
