import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { saveIntegration } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

const PLATFORM: PlatformType = 'shopify';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { api_key, shop_domain } = req.body;

  if (!api_key || typeof api_key !== 'string') {
    return res.status(400).json({ error: 'Access token is required' });
  }

  if (!shop_domain || typeof shop_domain !== 'string') {
    return res.status(400).json({ error: 'Shop domain is required' });
  }

  // Clean the shop domain
  const cleanDomain = shop_domain
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');

  try {
    // Test the access token by fetching shop info
    const testResponse = await fetch(`https://${cleanDomain}/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': api_key,
        'Content-Type': 'application/json',
      },
    });

    if (!testResponse.ok) {
      const errorData = await testResponse.json().catch(() => null);
      return res.status(400).json({
        error: 'Invalid Shopify credentials. Please check your access token and shop domain.',
        details: errorData?.errors || testResponse.statusText,
      });
    }

    // Save the integration
    const result = await saveIntegration(user.id, PLATFORM, {
      api_key,
      config: {
        shop_domain: cleanDomain,
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Shopify connected successfully',
      integration: result,
    });
  } catch (error) {
    console.error('Error connecting to Shopify:', error);
    return res.status(500).json({ error: 'Failed to connect to Shopify' });
  }
}
