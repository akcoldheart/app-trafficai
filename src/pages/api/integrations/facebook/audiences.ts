import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';
import { logEvent } from '@/lib/webhook-logger';

function getClientIp(req: NextApiRequest): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || '';
}

function isTokenExpired(config: Record<string, unknown>): boolean {
  const expiresAt = config.token_expires_at as string | undefined;
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { ad_account_id } = req.query;
  if (!ad_account_id) {
    return res.status(400).json({ error: 'ad_account_id is required' });
  }

  try {
    const integration = await getIntegration(user.id, 'facebook');

    if (!integration) {
      return res.status(401).json({ error: 'Facebook not connected' });
    }

    // Check token expiry
    const config = (integration.config || {}) as Record<string, unknown>;
    if (isTokenExpired(config)) {
      await logEvent({
        type: 'api',
        event_name: 'facebook_audiences',
        status: 'error',
        message: 'Facebook access token has expired - reconnection required',
        user_id: user.id,
        ip_address: getClientIp(req),
      });
      return res.status(401).json({
        error: 'Facebook access token has expired. Please reconnect your Facebook account.',
        token_expired: true,
      });
    }

    // Fetch all audiences with pagination
    let allAudiences: any[] = [];
    let nextUrl: string | null = `https://graph.facebook.com/v19.0/${ad_account_id}/customaudiences?fields=id,name,approximate_count,delivery_status&limit=100&access_token=${integration.api_key}`;

    while (nextUrl) {
      const fbResp: Response = await fetch(nextUrl);
      const fbData: any = await fbResp.json();

      if (!fbResp.ok) {
        await logEvent({
          type: 'api',
          event_name: 'facebook_audiences',
          status: 'error',
          message: 'Failed to fetch Facebook audiences',
          user_id: user.id,
          ip_address: getClientIp(req),
          request_data: { ad_account_id: ad_account_id as string },
          error_details: fbData.error?.message,
        });
        return res.status(400).json({ error: 'Failed to fetch audiences', details: fbData.error?.message });
      }

      const pageAudiences = (fbData.data || []).map((a: any) => ({
        id: a.id,
        name: a.name,
        approximate_count: a.approximate_count,
        delivery_status: a.delivery_status,
      }));

      allAudiences = allAudiences.concat(pageAudiences);
      nextUrl = fbData.paging?.next || null;
    }

    return res.status(200).json({ audiences: allAudiences });
  } catch (error) {
    console.error('Error fetching Facebook audiences:', error);
    return res.status(500).json({ error: 'Failed to fetch audiences' });
  }
}
