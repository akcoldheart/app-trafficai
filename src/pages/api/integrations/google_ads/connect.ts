import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';
import { logEvent } from '@/lib/webhook-logger';
import crypto from 'crypto';

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { client_id, client_secret, developer_token } = req.body;

  if (!client_id || !client_secret || !developer_token) {
    return res.status(400).json({ error: 'Client ID, Client Secret, and Developer Token are required' });
  }

  try {
    // Generate CSRF nonce for OAuth state
    const oauthNonce = crypto.randomBytes(32).toString('hex');

    // Store credentials + nonce
    await saveIntegration(effectiveUserId, 'google_ads', {
      config: { client_id, client_secret, developer_token, oauth_nonce: oauthNonce },
    });

    // Build OAuth URL
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/google_ads/callback`;
    const state = Buffer.from(JSON.stringify({ userId: effectiveUserId, nonce: oauthNonce })).toString('base64url');

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(client_id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent('https://www.googleapis.com/auth/adwords')}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${state}`;

    await logEvent({
      type: 'api',
      event_name: 'google_ads_connect',
      status: 'success',
      message: 'Google Ads credentials saved, initiating OAuth flow',
      user_id: user.id,
      ip_address: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'Google Ads credentials saved',
      auth_url: authUrl,
    });
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'google_ads_connect',
      status: 'error',
      message: 'Failed to save Google Ads credentials',
      user_id: user.id,
      ip_address: getClientIp(req),
      error_details: (error as Error).message,
    });

    console.error('Error saving Google Ads credentials:', error);
    return res.status(500).json({ error: 'Failed to save Google Ads credentials' });
  }
}
