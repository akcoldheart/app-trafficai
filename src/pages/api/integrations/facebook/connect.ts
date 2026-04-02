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

  const { app_id, app_secret } = req.body;

  if (!app_id || !app_secret) {
    return res.status(400).json({ error: 'Facebook App ID and App Secret are required' });
  }

  try {
    // Validate by checking if the app exists
    const validateResp = await fetch(
      `https://graph.facebook.com/v19.0/${app_id}?fields=name&access_token=${app_id}|${app_secret}`
    );

    if (!validateResp.ok) {
      const errorData = await validateResp.json().catch(() => null);

      await logEvent({
        type: 'api',
        event_name: 'facebook_connect',
        status: 'error',
        message: 'Invalid Facebook App credentials provided',
        user_id: user.id,
        ip_address: getClientIp(req),
        request_data: { app_id },
        error_details: errorData?.error?.message || validateResp.statusText,
      });

      return res.status(400).json({
        error: 'Invalid Facebook App credentials. Please verify your App ID and App Secret.',
        details: errorData?.error?.message || validateResp.statusText,
      });
    }

    // Generate CSRF nonce for OAuth state
    const oauthNonce = crypto.randomBytes(32).toString('hex');

    // Store app credentials + nonce in platform_integrations
    await saveIntegration(effectiveUserId, 'facebook', {
      config: { app_id, app_secret, oauth_nonce: oauthNonce },
    });

    // Build the OAuth URL for the frontend to redirect to
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/facebook/callback`;
    const scopes = 'ads_management,ads_read';
    const state = Buffer.from(JSON.stringify({ userId: effectiveUserId, nonce: oauthNonce })).toString('base64url');

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${app_id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;

    await logEvent({
      type: 'api',
      event_name: 'facebook_connect',
      status: 'success',
      message: 'Facebook App credentials validated, initiating OAuth flow',
      user_id: user.id,
      ip_address: getClientIp(req),
      request_data: { app_id },
    });

    return res.status(200).json({
      success: true,
      message: 'Facebook app credentials saved',
      auth_url: authUrl,
    });
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'facebook_connect',
      status: 'error',
      message: 'Failed to save Facebook credentials',
      user_id: user.id,
      ip_address: getClientIp(req),
      error_details: (error as Error).message,
    });

    console.error('Error saving Facebook credentials:', error);
    return res.status(500).json({ error: 'Failed to save Facebook credentials' });
  }
}
