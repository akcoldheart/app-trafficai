import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const { data: integration } = await supabaseAdmin
      .from('platform_integrations')
      .select('config')
      .eq('user_id', user.id)
      .eq('platform', 'linkedin')
      .eq('is_connected', true)
      .single();

    if (!integration) {
      return res.status(400).json({ error: 'LinkedIn not connected. Connect your account first.' });
    }

    const token = `tai_li_${crypto.randomBytes(32).toString('hex')}`;

    const existingConfig = (integration.config || {}) as Record<string, unknown>;
    await supabaseAdmin
      .from('platform_integrations')
      .update({
        config: { ...existingConfig, extension_token: token },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .eq('platform', 'linkedin');

    return res.status(200).json({ success: true, token });
  } catch (error) {
    console.error('Error generating extension token:', error);
    return res.status(500).json({ error: 'Failed to generate token' });
  }
}
