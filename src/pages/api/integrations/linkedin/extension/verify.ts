import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getIntegrationByToken(token: string) {
  const { data } = await supabaseAdmin
    .from('platform_integrations')
    .select('user_id, config, is_connected')
    .eq('platform', 'linkedin')
    .eq('is_connected', true);

  if (!data) return null;

  for (const row of data) {
    const config = (row.config || {}) as Record<string, unknown>;
    if (config.extension_token === token) {
      return { user_id: row.user_id, config };
    }
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'Extension token required' });
  }

  const integration = await getIntegrationByToken(token);
  if (!integration) {
    return res.status(401).json({ error: 'Invalid extension token' });
  }

  return res.status(200).json({
    success: true,
    user_id: integration.user_id,
    account_name: (integration.config as any).account_name || null,
  });
}
