import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'hubspot';

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

  try {
    // Test the API key by fetching contacts from HubSpot
    const testResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
      headers: {
        'Authorization': `Bearer ${api_key}`,
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => null);
      return res.status(400).json({
        error: 'Invalid HubSpot API key. Please check your key and try again.',
        details: errorData?.message || testResponse.statusText,
      });
    }

    // Save the integration
    const result = await saveIntegration(user.id, PLATFORM, { api_key });

    return res.status(200).json({
      success: true,
      message: 'HubSpot connected successfully',
      integration: result,
    });
  } catch (error) {
    console.error('Error connecting to HubSpot:', error);
    return res.status(500).json({ error: 'Failed to connect to HubSpot' });
  }
}
