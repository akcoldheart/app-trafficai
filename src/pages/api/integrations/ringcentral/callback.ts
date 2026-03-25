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
      event_name: 'ringcentral_oauth_callback',
      status: 'error',
      message: 'User denied RingCentral OAuth authorization',
      error_details: oauthError as string,
    });
    return res.redirect('/integrations/ringcentral?error=oauth_denied');
  }

  if (!code || !state) {
    return res.redirect('/integrations/ringcentral?error=missing_params');
  }

  let userId: string;
  let stateNonce: string | undefined;
  try {
    const parsed = JSON.parse(Buffer.from(state as string, 'base64url').toString());
    userId = parsed.userId;
    stateNonce = parsed.nonce;
    if (!userId) throw new Error('No userId');
  } catch {
    return res.redirect('/integrations/ringcentral?error=invalid_state');
  }

  const { data: integration } = await supabaseAdmin
    .from('platform_integrations')
    .select('config')
    .eq('user_id', userId)
    .eq('platform', 'ringcentral')
    .single();

  const existingConfig = (integration?.config || {}) as Record<string, unknown>;
  const clientId = existingConfig.client_id as string | undefined;
  const clientSecret = existingConfig.client_secret as string | undefined;
  const storedNonce = existingConfig.oauth_nonce as string | undefined;

  if (!clientId || !clientSecret) {
    return res.redirect('/integrations/ringcentral?error=no_credentials');
  }

  if (!stateNonce || !storedNonce || stateNonce !== storedNonce) {
    await logEvent({
      type: 'api',
      event_name: 'ringcentral_oauth_callback',
      status: 'error',
      message: 'RingCentral OAuth CSRF validation failed',
      user_id: userId,
    });
    return res.redirect('/integrations/ringcentral?error=invalid_state');
  }

  const apiBase = process.env.RINGCENTRAL_SANDBOX === 'true'
    ? 'https://platform.devtest.ringcentral.com'
    : 'https://platform.ringcentral.com';

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/ringcentral/callback`;

  try {
    // Exchange code for tokens
    const tokenResp = await fetch(`${apiBase}/restapi/oauth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResp.json();

    if (!tokenResp.ok || !tokenData.access_token) {
      await logEvent({
        type: 'api',
        event_name: 'ringcentral_oauth_callback',
        status: 'error',
        message: 'RingCentral token exchange failed',
        user_id: userId,
        error_details: tokenData.error_description || tokenData.error,
      });
      return res.redirect('/integrations/ringcentral?error=token_failed');
    }

    const { access_token, refresh_token, expires_in } = tokenData;
    const tokenExpiresAt = expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null;

    // Fetch SMS-capable phone numbers
    let phoneNumbers: string[] = [];
    try {
      const phoneResp = await fetch(
        `${apiBase}/restapi/v1.0/account/~/extension/~/phone-number?usageType=DirectNumber&perPage=100`,
        { headers: { 'Authorization': `Bearer ${access_token}` } }
      );
      const phoneData = await phoneResp.json();
      if (phoneResp.ok) {
        phoneNumbers = (phoneData.records || [])
          .filter((r: any) => (r.features || []).includes('SmsSender'))
          .map((r: any) => r.phoneNumber);
      }
    } catch (e) {
      console.error('Failed to fetch RC phone numbers:', e);
    }

    const { oauth_nonce: _removed, ...cleanConfig } = existingConfig;

    await supabaseAdmin
      .from('platform_integrations')
      .update({
        api_key: access_token,
        is_connected: true,
        config: {
          ...cleanConfig,
          rc_access_token: access_token,
          rc_refresh_token: refresh_token,
          rc_token_expires_at: tokenExpiresAt,
          rc_phone_numbers: phoneNumbers,
          rc_from_number: phoneNumbers[0] || null,
          oauth_connected: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('platform', 'ringcentral');

    await logEvent({
      type: 'api',
      event_name: 'ringcentral_oauth_callback',
      status: 'success',
      message: `RingCentral connected with ${phoneNumbers.length} SMS-capable number(s)`,
      user_id: userId,
    });

    return res.redirect('/integrations/ringcentral?success=true');
  } catch (error) {
    await logEvent({
      type: 'api',
      event_name: 'ringcentral_oauth_callback',
      status: 'error',
      message: 'RingCentral OAuth callback error',
      user_id: userId,
      error_details: (error as Error).message,
    });
    console.error('RingCentral OAuth callback error:', error);
    return res.redirect('/integrations/ringcentral?error=server_error');
  }
}
