import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
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

  const { client_id, client_secret } = req.body;

  if (!client_id || !client_secret) {
    return res.status(400).json({ error: 'Client ID and Client Secret are required' });
  }

  try {
    const oauthNonce = crypto.randomBytes(32).toString('hex');

    await saveIntegration(user.id, 'ringcentral', {
      config: { client_id, client_secret, oauth_nonce: oauthNonce },
    });

    const apiBase = 'https://platform.ringcentral.com';

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/ringcentral/callback`;
    const state = Buffer.from(JSON.stringify({ userId: user.id, nonce: oauthNonce })).toString('base64url');

    const authUrl = `${apiBase}/restapi/oauth/authorize?` +
      `response_type=code` +
      `&client_id=${encodeURIComponent(client_id)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&state=${state}`;

    await logEvent({
      type: 'api',
      event_name: 'ringcentral_connect',
      status: 'success',
      message: 'RingCentral credentials saved, initiating OAuth flow',
      user_id: user.id,
      ip_address: getClientIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'RingCentral credentials saved',
      auth_url: authUrl,
    });
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'ringcentral_connect',
      status: 'error',
      message: 'Failed to save RingCentral credentials',
      user_id: user.id,
      ip_address: getClientIp(req),
      error_details: (error as Error).message,
    });

    console.error('Error saving RingCentral credentials:', error);
    return res.status(500).json({ error: 'Failed to save RingCentral credentials' });
  }
}
