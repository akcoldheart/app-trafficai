import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';
import { logEvent } from '@/lib/webhook-logger';

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

function isTokenExpired(config: Record<string, unknown>): boolean {
  const expiresAt = config.token_expires_at as string | undefined;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    const integration = await getIntegration(effectiveUserId, 'facebook');

    if (!integration) {
      return res.status(401).json({ error: 'Facebook not connected' });
    }

    // Check token expiry
    const config = (integration.config || {}) as Record<string, unknown>;
    if (isTokenExpired(config)) {
      await logEvent({
        type: 'api',
        event_name: 'facebook_ad_accounts',
        status: 'error',
        message: 'Facebook access token has expired - reconnection required',
        user_id: user.id,
        ip_address: getClientIp(req),
      });
      return res.status(401).json({
        error: 'Facebook access token has expired. Please reconnect your Facebook account.',
        token_expired: true,
      });
    }

    const fbResp = await fetch(
      `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${integration.api_key}`
    );
    const fbData = await fbResp.json();

    if (!fbResp.ok) {
      const fbErrorMsg = fbData.error?.message || '';
      const isTokenInvalid = fbData.error?.type === 'OAuthException' ||
        fbErrorMsg.toLowerCase().includes('access token') ||
        fbData.error?.code === 190;

      await logEvent({
        type: 'api',
        event_name: 'facebook_ad_accounts',
        status: 'error',
        message: 'Failed to fetch Facebook ad accounts',
        user_id: user.id,
        ip_address: getClientIp(req),
        error_details: fbErrorMsg,
      });

      if (isTokenInvalid) {
        return res.status(401).json({
          error: 'Your Facebook access token is invalid or has expired. Please reconnect your Facebook account.',
          token_expired: true,
          details: fbErrorMsg,
        });
      }

      return res.status(400).json({ error: 'Failed to fetch ad accounts', details: fbErrorMsg });
    }

    const accounts = (fbData.data || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      account_status: a.account_status,
    }));

    return res.status(200).json({ ad_accounts: accounts });
  } catch (error) {
    console.error('Error fetching Facebook ad accounts:', error);
    return res.status(500).json({ error: 'Failed to fetch ad accounts' });
  }
}
