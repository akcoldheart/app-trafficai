import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

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
      return res.status(400).json({
        error: 'Invalid Facebook App credentials. Please verify your App ID and App Secret.',
        details: errorData?.error?.message || validateResp.statusText,
      });
    }

    // Store app credentials in platform_integrations
    await saveIntegration(user.id, 'facebook', {
      config: { app_id, app_secret },
    });

    // Build the OAuth URL for the frontend to redirect to
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/facebook/callback`;
    const scopes = 'ads_management,ads_read';
    const state = Buffer.from(JSON.stringify({ userId: user.id })).toString('base64url');

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${app_id}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;

    return res.status(200).json({
      success: true,
      message: 'Facebook app credentials saved',
      auth_url: authUrl,
    });
  } catch (error) {
    console.error('Error saving Facebook credentials:', error);
    return res.status(500).json({ error: 'Failed to save Facebook credentials' });
  }
}
