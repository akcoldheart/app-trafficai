import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

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
    return res.redirect('/integrations/facebook?error=oauth_denied');
  }

  if (!code || !state) {
    return res.redirect('/integrations/facebook?error=missing_params');
  }

  let userId: string;
  try {
    const parsed = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    userId = parsed.userId;
    if (!userId) throw new Error('No userId');
  } catch {
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

  if (!appId || !appSecret) {
    return res.redirect('/integrations/facebook?error=no_app_credentials');
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/facebook/callback`;

  try {
    // Exchange code for access token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenResp = await fetch(tokenUrl);
    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || !tokenData.access_token) {
      console.error('Facebook token exchange failed:', tokenData);
      return res.redirect('/integrations/facebook?error=token_failed');
    }

    const { access_token, expires_in } = tokenData;
    const tokenExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    // Get long-lived token
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${access_token}`;
    const longLivedResp = await fetch(longLivedUrl);
    const longLivedData = await longLivedResp.json();

    const finalToken = longLivedData.access_token || access_token;
    const finalExpiry = longLivedData.expires_in
      ? new Date(Date.now() + longLivedData.expires_in * 1000).toISOString()
      : tokenExpiresAt;

    // Update platform_integrations with access token and config
    await supabaseAdmin
      .from('platform_integrations')
      .update({
        api_key: finalToken,
        config: { ...existingConfig, oauth_connected: true, token_expires_at: finalExpiry },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', 'facebook');

    return res.redirect('/integrations/facebook?success=true');
  } catch (error) {
    console.error('Facebook OAuth callback error:', error);
    return res.redirect('/integrations/facebook?error=server_error');
  }
}
