import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { api_key } = req.body;

  if (!api_key || typeof api_key !== 'string') {
    return res.status(400).json({ error: 'API key is required' });
  }

  // Extract data center from API key (e.g. "key-us21" -> "us21")
  const dcMatch = api_key.split('-').pop();
  if (!dcMatch) {
    return res.status(400).json({ error: 'Invalid Mailchimp API key format. Expected format: key-us21' });
  }
  const dc = dcMatch;

  try {
    // Test the API key by pinging Mailchimp
    const testResponse = await fetch(`https://${dc}.api.mailchimp.com/3.0/ping`, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`anystring:${api_key}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => null);
      return res.status(400).json({
        error: 'Invalid Mailchimp API key. Please check your key and try again.',
        details: errorData?.detail || testResponse.statusText,
      });
    }

    // Save the integration
    const integration = await saveIntegration(user.id, 'mailchimp', {
      api_key,
      config: { data_center: dc },
    });

    return res.status(200).json({
      success: true,
      message: 'Mailchimp connected successfully',
      integration,
    });
  } catch (error) {
    console.error('Error connecting to Mailchimp:', error);
    return res.status(500).json({ error: 'Failed to connect to Mailchimp' });
  }
}
