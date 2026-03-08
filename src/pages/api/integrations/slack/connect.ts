import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'slack';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { webhook_url } = req.body;

  if (!webhook_url || typeof webhook_url !== 'string') {
    return res.status(400).json({ error: 'Webhook URL is required' });
  }

  if (!webhook_url.startsWith('https://hooks.slack.com/')) {
    return res.status(400).json({ error: 'Invalid Slack webhook URL. Must start with https://hooks.slack.com/' });
  }

  try {
    // Test the webhook by sending a connection message
    const testResponse = await fetch(webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: "Traffic AI connected successfully! You'll receive visitor notifications here.",
      }),
    });

    if (!testResponse.ok) {
      return res.status(400).json({
        error: 'Failed to send test message to Slack webhook. Please check the URL and try again.',
        details: testResponse.statusText,
      });
    }

    // Save the integration
    const result = await saveIntegration(user.id, PLATFORM, {
      webhook_url,
      config: {
        notify_new_visitors: true,
        notify_audience_sync: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Slack connected successfully',
      integration: result,
    });
  } catch (error) {
    console.error('Error connecting to Slack:', error);
    return res.status(500).json({ error: 'Failed to connect to Slack' });
  }
}
