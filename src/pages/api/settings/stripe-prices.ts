import type { NextApiRequest, NextApiResponse } from 'next';
import { getStripeConfig, getPlanPricing } from '@/lib/settings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const config = await getStripeConfig();
    const pricing = await getPlanPricing();

    // Return price IDs and pricing info (not the secret key)
    return res.status(200).json({
      prices: config.prices,
      pricing: pricing,
      appUrl: config.appUrl,
    });
  } catch (error) {
    console.error('Error fetching Stripe prices:', error);
    return res.status(500).json({ error: 'Failed to fetch Stripe configuration' });
  }
}
