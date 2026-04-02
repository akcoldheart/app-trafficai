import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'google_sheets';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { api_key: clientId, secondary_key: clientSecret } = req.body;

  if (!clientId || !clientSecret) {
    return res.status(400).json({ error: 'Client ID and Client Secret are required' });
  }

  try {
    // Save credentials first (before OAuth redirect)
    await supabaseAdmin
      .from('platform_integrations')
      .upsert({
        user_id: effectiveUserId,
        platform: PLATFORM,
        api_key: clientId,
        config: { client_secret: clientSecret },
        is_connected: false,
      }, { onConflict: 'user_id,platform' });

    // Build Google OAuth URL
    const baseUrl = req.headers.origin || `https://${req.headers.host}`;
    const redirectUri = `${baseUrl}/api/integrations/google_sheets/callback`;
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ];

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', scopes.join(' '));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', effectiveUserId);

    return res.status(200).json({
      success: true,
      redirect_url: authUrl.toString(),
      message: 'Redirecting to Google authorization...',
    });
  } catch (error) {
    console.error('Error connecting Google Sheets:', error);
    return res.status(500).json({ error: 'Failed to start Google Sheets connection' });
  }
}
