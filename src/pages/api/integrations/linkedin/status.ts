import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegrationStatus, disconnectIntegration } from '@/lib/integrations';
import { createClient } from '@supabase/supabase-js';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'linkedin';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const integration = await getIntegrationStatus(user.id, PLATFORM);
      const config = (integration as any)?.config || {};

      return res.status(200).json({
        integration: integration || null,
        account: integration ? {
          email: config.account_email || null,
          name: config.account_name || null,
        } : null,
      });
    } catch (error) {
      console.error('Error fetching LinkedIn status:', error);
      return res.status(500).json({ error: 'Failed to fetch integration status' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await Promise.all([
        disconnectIntegration(user.id, PLATFORM),
        supabaseAdmin.from('linkedin_campaigns').update({ status: 'paused' }).eq('user_id', user.id).eq('status', 'active'),
      ]);
      return res.status(200).json({ success: true, message: 'LinkedIn disconnected' });
    } catch (error) {
      console.error('Error disconnecting LinkedIn:', error);
      return res.status(500).json({ error: 'Failed to disconnect LinkedIn' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
