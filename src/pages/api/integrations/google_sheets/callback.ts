import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state: userId, error: oauthError } = req.query;

  if (oauthError) {
    return res.redirect('/integrations/google_sheets?error=access_denied');
  }

  if (!code || !userId || typeof code !== 'string' || typeof userId !== 'string') {
    return res.redirect('/integrations/google_sheets?error=invalid_callback');
  }

  try {
    // Get stored credentials
    const { data: integration } = await supabaseAdmin
      .from('platform_integrations')
      .select('api_key, config')
      .eq('user_id', userId)
      .eq('platform', 'google_sheets')
      .single();

    if (!integration) {
      return res.redirect('/integrations/google_sheets?error=no_integration');
    }

    const clientId = integration.api_key;
    const config = integration.config as Record<string, unknown>;
    const clientSecret = config?.client_secret as string;

    if (!clientId || !clientSecret) {
      return res.redirect('/integrations/google_sheets?error=missing_credentials');
    }

    // Exchange authorization code for tokens
    const baseUrl = req.headers.origin || `https://${req.headers.host}`;
    const redirectUri = `${baseUrl}/api/integrations/google_sheets/callback`;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return res.redirect('/integrations/google_sheets?error=token_exchange_failed');
    }

    // Get user email from Google
    let googleEmail = '';
    try {
      const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const userInfo = await userInfoResp.json();
      googleEmail = userInfo.email || '';
    } catch { /* ignore */ }

    // Save tokens
    await supabaseAdmin
      .from('platform_integrations')
      .update({
        is_connected: true,
        config: {
          ...config,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expiry: Date.now() + (tokenData.expires_in * 1000),
          google_email: googleEmail,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', 'google_sheets');

    return res.redirect('/integrations/google_sheets?connected=true');
  } catch (error) {
    console.error('Google Sheets callback error:', error);
    return res.redirect('/integrations/google_sheets?error=server_error');
  }
}
