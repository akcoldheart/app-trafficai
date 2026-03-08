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

  try {
    // Test the API key by fetching current user
    const testResponse = await fetch(`https://api.pipedrive.com/v1/users/me?api_token=${api_key}`, {
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => null);
      return res.status(400).json({
        error: 'Invalid Pipedrive API key. Please check your key and try again.',
        details: errorData?.error || testResponse.statusText,
      });
    }

    // Save the integration
    const integration = await saveIntegration(user.id, 'pipedrive', {
      api_key,
    });

    return res.status(200).json({
      success: true,
      message: 'Pipedrive connected successfully',
      integration,
    });
  } catch (error) {
    console.error('Error connecting to Pipedrive:', error);
    return res.status(500).json({ error: 'Failed to connect to Pipedrive' });
  }
}
