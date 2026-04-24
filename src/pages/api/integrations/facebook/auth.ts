import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';
import { logEvent } from '@/lib/webhook-logger';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  try {
    const integration = await getIntegration(effectiveUserId, 'facebook');
    const config = (integration?.config || {}) as Record<string, unknown>;
    const appId = config.app_id as string | undefined;

    if (!appId) {
      return res.redirect('/integrations/facebook?error=no_app_credentials');
    }

    // Generate CSRF nonce and store it
    const oauthNonce = crypto.randomBytes(32).toString('hex');
    await supabaseAdmin
      .from('platform_integrations')
      .update({ config: { ...config, oauth_nonce: oauthNonce }, updated_at: new Date().toISOString() })
      .eq('user_id', effectiveUserId)
      .eq('platform', 'facebook');

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'https://' + req.headers.host}/api/integrations/facebook/callback`;
    const scopes = 'ads_management,ads_read,business_management';
    const state = Buffer.from(JSON.stringify({ userId: effectiveUserId, nonce: oauthNonce })).toString('base64url');

    const authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;

    await logEvent({
      type: 'api',
      event_name: 'facebook_auth_redirect',
      status: 'info',
      message: 'User redirected to Facebook OAuth',
      user_id: user.id,
    });

    return res.redirect(authUrl);
  } catch (error) {
    console.error('Error initiating Facebook auth:', error);
    return res.redirect('/integrations/facebook?error=server_error');
  }
}
