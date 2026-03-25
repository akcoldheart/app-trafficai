import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { logEvent } from '@/lib/webhook-logger';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { code, state, error: oauthError } = req.query;

  if (oauthError) {
    await logEvent({
      type: 'api',
      event_name: 'google_ads_oauth_callback',
      status: 'error',
      message: 'User denied Google Ads OAuth authorization',
      error_details: oauthError as string,
    });
    return res.redirect('/integrations/google_ads?error=oauth_denied');
  }

  if (!code || !state) {
    return res.redirect('/integrations/google_ads?error=missing_params');
  }

  let userId: string;
  let stateNonce: string | undefined;
  try {
    const parsed = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    userId = parsed.userId;
    stateNonce = parsed.nonce;
    if (!userId) throw new Error('No userId');
  } catch {
    return res.redirect('/integrations/google_ads?error=invalid_state');
  }

  // Read stored credentials
  const { data: integration } = await supabaseAdmin
    .from('platform_integrations')
    .select('config')
    .eq('user_id', userId)
    .eq('platform', 'google_ads')
    .single();

  const existingConfig = (integration?.config || {}) as Record<string, unknown>;
  const clientId = existingConfig.client_id as string | undefined;
  const clientSecret = existingConfig.client_secret as string | undefined;
  const storedNonce = existingConfig.oauth_nonce as string | undefined;

  if (!clientId || !clientSecret) {
    return res.redirect('/integrations/google_ads?error=no_credentials');
  }

  // Verify CSRF nonce
  if (!stateNonce || !storedNonce || stateNonce !== storedNonce) {
    await logEvent({
      type: 'api',
      event_name: 'google_ads_oauth_callback',
      status: 'error',
      message: 'Google Ads OAuth CSRF validation failed',
      user_id: userId,
    });
    return res.redirect('/integrations/google_ads?error=invalid_state');
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/google_ads/callback`;

  try {
    // Exchange code for tokens
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: code as string,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || !tokenData.access_token) {
      await logEvent({
        type: 'api',
        event_name: 'google_ads_oauth_callback',
        status: 'error',
        message: 'Google Ads token exchange failed',
        user_id: userId,
        error_details: tokenData.error_description || tokenData.error,
      });
      return res.redirect('/integrations/google_ads?error=token_failed');
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const tokenExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    // Clear nonce, store tokens
    const { oauth_nonce: _removed, ...cleanConfig } = existingConfig;

    await supabaseAdmin
      .from('platform_integrations')
      .update({
        api_key: access_token,
        is_connected: true,
        config: {
          ...cleanConfig,
          google_access_token: access_token,
          refresh_token: refresh_token || cleanConfig.refresh_token,
          token_expires_at: tokenExpiresAt,
          oauth_connected: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', 'google_ads');

    await logEvent({
      type: 'api',
      event_name: 'google_ads_oauth_callback',
      status: 'success',
      message: 'Google Ads connected successfully',
      user_id: userId,
    });

    return res.redirect('/integrations/google_ads?success=true');
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'google_ads_oauth_callback',
      status: 'error',
      message: 'Google Ads OAuth callback error',
      user_id: userId,
      error_details: (error as Error).message,
    });
    console.error('Google Ads OAuth callback error:', error);
    return res.redirect('/integrations/google_ads?error=server_error');
  }
}
