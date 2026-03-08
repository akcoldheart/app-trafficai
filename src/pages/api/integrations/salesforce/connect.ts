import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'salesforce';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { api_key, instance_url } = req.body;

  if (!api_key || typeof api_key !== 'string') {
    return res.status(400).json({ error: 'Access token (api_key) is required' });
  }

  if (!instance_url || typeof instance_url !== 'string') {
    return res.status(400).json({ error: 'Instance URL is required' });
  }

  if (!instance_url.startsWith('https://')) {
    return res.status(400).json({ error: 'Instance URL must start with https://' });
  }

  try {
    // Test the access token by describing the Contact object
    const testResponse = await fetch(`${instance_url}/services/data/v59.0/sobjects/Contact/describe`, {
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => null);
      return res.status(400).json({
        error: 'Invalid Salesforce credentials. Please check your access token and instance URL.',
        details: errorData?.[0]?.message || testResponse.statusText,
      });
    }

    // Save the integration with instance_url in config
    const result = await saveIntegration(user.id, PLATFORM, {
      api_key,
      config: { instance_url },
    });

    return res.status(200).json({
      success: true,
      message: 'Salesforce connected successfully',
      integration: result,
    });
  } catch (error) {
    console.error('Error connecting to Salesforce:', error);
    return res.status(500).json({ error: 'Failed to connect to Salesforce' });
  }
}
