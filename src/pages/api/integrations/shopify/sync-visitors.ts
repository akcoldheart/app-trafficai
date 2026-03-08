import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getVisitorsForSync, formatPhoneE164, parseFullName } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

export const config = {
  maxDuration: 300,
};

const PLATFORM: PlatformType = 'shopify';

interface ShopifyCustomer {
  customer: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone?: string;
    tags: string;
    addresses?: Array<{
      city?: string;
      province?: string;
      country?: string;
    }>;
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const integration = await getIntegration(user.id, PLATFORM);
  if (!integration) {
    return res.status(400).json({ error: 'Shopify not connected' });
  }

  const shopDomain = (integration.config as Record<string, string>).shop_domain;
  if (!shopDomain) {
    return res.status(400).json({ error: 'Shop domain not configured' });
  }

  const { pixel_id } = req.body;

  try {
    const visitors = await getVisitorsForSync(user.id, pixel_id);

    if (!visitors || visitors.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No visitors with email to sync' });
    }

    let totalSynced = 0;
    const errors: Array<{ email: string; error: string }> = [];

    for (const visitor of visitors) {
      if (!visitor.email) continue;

      const firstName = visitor.first_name || (visitor.full_name ? parseFullName(visitor.full_name).firstName : undefined);
      const lastName = visitor.last_name || (visitor.full_name ? parseFullName(visitor.full_name).lastName : undefined);

      const customerPayload: ShopifyCustomer = {
        customer: {
          email: visitor.email,
          tags: 'traffic-ai',
        },
      };

      if (firstName) customerPayload.customer.first_name = firstName;
      if (lastName) customerPayload.customer.last_name = lastName;
      if (visitor.phone) customerPayload.customer.phone = formatPhoneE164(visitor.phone);

      if (visitor.city || visitor.state || visitor.country) {
        customerPayload.customer.addresses = [
          {
            ...(visitor.city && { city: visitor.city }),
            ...(visitor.state && { province: visitor.state }),
            ...(visitor.country && { country: visitor.country }),
          },
        ];
      }

      try {
        const response = await fetch(`https://${shopDomain}/admin/api/2024-01/customers.json`, {
          method: 'POST',
          headers: {
            'X-Shopify-Access-Token': integration.api_key!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(customerPayload),
        });

        if (response.ok) {
          totalSynced++;
        } else if (response.status === 422) {
          // Customer may already exist, skip gracefully
          const errorData = await response.json().catch(() => null);
          errors.push({
            email: visitor.email,
            error: errorData?.errors?.email?.[0] || 'Customer already exists',
          });
        } else {
          const errorData = await response.json().catch(() => null);
          errors.push({
            email: visitor.email,
            error: errorData?.errors || response.statusText,
          });
        }
      } catch (err) {
        errors.push({
          email: visitor.email,
          error: (err as Error).message,
        });
      }
    }

    // Update last synced timestamp
    await updateLastSynced(user.id, PLATFORM);

    return res.status(200).json({
      success: true,
      synced: totalSynced,
      skipped: errors.length,
      message: `${totalSynced} visitors synced to Shopify`,
    });
  } catch (error) {
    console.error('Error syncing visitors to Shopify:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync visitors to Shopify' });
  }
}
