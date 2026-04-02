import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { getIntegrationStatus, disconnectIntegration } from '@/lib/integrations';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'facebook';

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

  const effectiveUserId = await getEffectiveUserId(user.id);

  if (req.method === 'GET') {
    try {
      const [integration, importsResult] = await Promise.all([
        getIntegrationStatus(effectiveUserId, PLATFORM),
        supabaseAdmin
          .from('facebook_audience_imports')
          .select('*')
          .eq('user_id', effectiveUserId)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      // Extract token info from integration config
      const config = (integration?.config || {}) as Record<string, unknown>;
      const expiresAt = config.token_expires_at as string | null;
      const tokenExpired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;

      const token_info = {
        ad_account_id: config.ad_account_id || null,
        ad_account_name: config.ad_account_name || null,
        token_expires_at: expiresAt || null,
        token_expired: tokenExpired,
      };

      return res.status(200).json({
        integration: integration || null,
        token_info,
        imports: importsResult.data || [],
      });
    } catch (error) {
      console.error('Error fetching Facebook status:', error);
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await disconnectIntegration(effectiveUserId, PLATFORM);

      await logEvent({
        type: 'api',
        event_name: 'facebook_disconnect',
        status: 'success',
        message: 'Facebook integration disconnected',
        user_id: user.id,
        ip_address: getClientIp(req),
      });

      return res.status(200).json({ success: true, message: 'Facebook disconnected' });
    } catch (error) {
      await logEvent({
        type: 'api',
        event_name: 'facebook_disconnect',
        status: 'error',
        message: 'Failed to disconnect Facebook integration',
        user_id: user.id,
        ip_address: getClientIp(req),
        error_details: (error as Error).message,
      });

      console.error('Error disconnecting Facebook:', error);
      return res.status(500).json({ error: 'Failed to disconnect Facebook' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
