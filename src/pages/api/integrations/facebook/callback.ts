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

  const { code, state, error: fbError } = req.query;

  if (fbError) {
    await logEvent({
      type: 'api',
      event_name: 'facebook_oauth_callback',
      status: 'error',
      message: 'User denied Facebook OAuth authorization',
      error_details: fbError as string,
    });
    return res.redirect('/integrations/facebook?error=oauth_denied');
  }

  if (!code || !state) {
    await logEvent({
      type: 'api',
      event_name: 'facebook_oauth_callback',
      status: 'error',
      message: 'Facebook OAuth callback missing required parameters',
      error_details: `Missing: ${!code ? 'code' : ''} ${!state ? 'state' : ''}`.trim(),
    });
    return res.redirect('/integrations/facebook?error=missing_params');
  }

  let userId: string;
  let stateNonce: string | undefined;
  try {
    const parsed = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    userId = parsed.userId;
    stateNonce = parsed.nonce;
    if (!userId) throw new Error('No userId');
  } catch {
    await logEvent({
      type: 'api',
      event_name: 'facebook_oauth_callback',
      status: 'error',
      message: 'Invalid OAuth state parameter',
      error_details: 'Could not parse state parameter',
    });
    return res.redirect('/integrations/facebook?error=invalid_state');
  }

  // Read app credentials from platform_integrations (no auth session available in OAuth callback)
  const { data: integration } = await supabaseAdmin
    .from('platform_integrations')
    .select('config')
    .eq('user_id', userId)
    .eq('platform', 'facebook')
    .single();

  const existingConfig = (integration?.config || {}) as Record<string, unknown>;
  const appId = existingConfig.app_id as string | undefined;
  const appSecret = existingConfig.app_secret as string | undefined;
  const storedNonce = existingConfig.oauth_nonce as string | undefined;

  if (!appId || !appSecret) {
    await logEvent({
      type: 'api',
      event_name: 'facebook_oauth_callback',
      status: 'error',
      message: 'Facebook OAuth callback failed - no app credentials found',
      user_id: userId,
    });
    return res.redirect('/integrations/facebook?error=no_app_credentials');
  }

  // Verify CSRF nonce
  if (!stateNonce || !storedNonce || stateNonce !== storedNonce) {
    await logEvent({
      type: 'api',
      event_name: 'facebook_oauth_callback',
      status: 'error',
      message: 'Facebook OAuth CSRF validation failed - nonce mismatch',
      user_id: userId,
      error_details: 'State nonce does not match stored nonce',
    });
    return res.redirect('/integrations/facebook?error=invalid_state');
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/facebook/callback`;

  try {
    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || !tokenData.access_token) {
      await logEvent({
        type: 'api',
        event_name: 'facebook_oauth_callback',
        status: 'error',
        message: 'Facebook token exchange failed',
        user_id: userId,
        error_details: tokenData?.error?.message || JSON.stringify(tokenData),
      });
      return res.redirect('/integrations/facebook?error=token_failed');
    }

    const { access_token, expires_in } = tokenData;
    const tokenExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    // Get long-lived token
    let tokenType = 'short-lived';
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${access_token}`;
    const longLivedResp = await fetch(longLivedUrl);
    const longLivedData = await longLivedResp.json();

    let finalToken = access_token;
    let finalExpiry = tokenExpiresAt;

    if (longLivedData.access_token) {
      finalToken = longLivedData.access_token;
      finalExpiry = longLivedData.expires_in
        ? new Date(Date.now() + longLivedData.expires_in * 1000).toISOString()
        : tokenExpiresAt;
      tokenType = 'long-lived';
    }

    // Clear nonce after successful use, update token
    const { oauth_nonce: _removed, ...cleanConfig } = existingConfig;

    await supabaseAdmin
      .from('platform_integrations')
      .update({
        api_key: finalToken,
        is_connected: true,
        config: { ...cleanConfig, oauth_connected: true, token_expires_at: finalExpiry },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', 'facebook');

    await logEvent({
      type: 'api',
      event_name: 'facebook_oauth_callback',
      status: tokenType === 'long-lived' ? 'success' : 'warning',
      message: tokenType === 'long-lived'
        ? `Facebook connected successfully with long-lived token (expires ${finalExpiry ? new Date(finalExpiry).toLocaleDateString() : 'unknown'})`
        : 'Facebook connected with short-lived token - long-lived token exchange failed',
      user_id: userId,
      response_data: {
        token_type: tokenType,
        expires_at: finalExpiry,
      },
    });

    return res.redirect('/integrations/facebook?success=true');
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'facebook_oauth_callback',
      status: 'error',
      message: 'Facebook OAuth callback error',
      user_id: userId,
      error_details: (error as Error).message,
    });
    console.error('Facebook OAuth callback error:', error);
    return res.redirect('/integrations/facebook?error=server_error');
  }
}
