import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { api_key, api_url } = req.body;

  if (!api_key || typeof api_key !== 'string') {
    return res.status(400).json({ error: 'API key is required' });
  }

  if (!api_url || typeof api_url !== 'string') {
    return res.status(400).json({ error: 'API URL is required' });
  }

  // Clean the API URL (remove trailing slash)
  const cleanUrl = api_url.replace(/\/+$/, '');

  try {
    // Test the API key by fetching contacts
    const testResponse = await fetch(`${cleanUrl}/api/3/contacts?limit=1`, {
      headers: {
        'Api-Token': api_key,
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => null);
      return res.status(400).json({
        error: 'Invalid ActiveCampaign credentials. Please check your API key and URL.',
        details: errorData?.message || testResponse.statusText,
      });
    }

    // Save the integration
    const integration = await saveIntegration(user.id, 'activecampaign', {
      api_key,
      config: { api_url: cleanUrl },
    });

    return res.status(200).json({
      success: true,
      message: 'ActiveCampaign connected successfully',
      integration,
    });
  } catch (error) {
    console.error('Error connecting to ActiveCampaign:', error);
    return res.status(500).json({ error: 'Failed to connect to ActiveCampaign' });
  }
}
