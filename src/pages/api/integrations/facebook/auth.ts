import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    // Read app_id from platform_integrations config
    const integration = await getIntegration(user.id, 'facebook');

    const appId = (integration?.config as Record<string, unknown>)?.app_id as string | undefined;

    if (!appId) {
      return res.redirect('/integrations/facebook?error=no_app_credentials');
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/facebook/callback`;
    const scopes = 'ads_management,ads_read';
    const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64url');

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;

    return res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Facebook auth:', error);
    return res.redirect('/integrations/facebook?error=server_error');
  }
}
