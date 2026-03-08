import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'slack';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const integration = await getIntegration(user.id, PLATFORM);
    if (!integration) {
      return res.status(400).json({ error: 'Slack not connected' });
    }

    const response = await fetch(integration.webhook_url!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blocks: [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: 'Traffic AI Test Notification',
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: "*This is a test notification from Traffic AI.*\n\nWhen real visitors are identified, you'll see their details here including:\n- Name & Email\n- Company & Job Title\n- Location\n- Pages visited",
            },
          },
        ],
      }),
    });

    if (!response.ok) {
      return res.status(400).json({
        error: 'Failed to send test notification to Slack',
        details: response.statusText,
      });
    }

    return res.status(200).json({ success: true, message: 'Test notification sent' });
  } catch (error) {
    console.error('Error sending Slack test notification:', error);
    return res.status(500).json({ error: 'Failed to send test notification' });
  }
}
