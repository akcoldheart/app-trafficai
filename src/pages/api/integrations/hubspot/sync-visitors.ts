import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getVisitorsForSync, formatPhoneE164, parseFullName } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

export const config = {
  maxDuration: 300,
};

const PLATFORM: PlatformType = 'hubspot';

interface HubSpotContactProperties {
  email: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  jobtitle?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  website?: string;
  lifecyclestage: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const integration = await getIntegration(user.id, PLATFORM);
  if (!integration) {
    return res.status(400).json({ error: 'HubSpot not connected' });
  }

  const { pixel_id } = req.body;

  try {
    const visitors = await getVisitorsForSync(user.id, pixel_id);

    if (!visitors || visitors.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No visitors with email to sync' });
    }

    // Transform visitors to HubSpot contact format
    const contacts = visitors
      .filter((v) => v.email)
      .map((visitor) => {
        const firstName = visitor.first_name || (visitor.full_name ? parseFullName(visitor.full_name).firstName : undefined);
        const lastName = visitor.last_name || (visitor.full_name ? parseFullName(visitor.full_name).lastName : undefined);

        const properties: HubSpotContactProperties = {
          email: visitor.email!,
          lifecyclestage: 'lead',
        };

        if (firstName) properties.firstname = firstName;
        if (lastName) properties.lastname = lastName;
        if (visitor.company) properties.company = visitor.company;
        if (visitor.job_title) properties.jobtitle = visitor.job_title;
        if (visitor.city) properties.city = visitor.city;
        if (visitor.state) properties.state = visitor.state;
        if (visitor.country) properties.country = visitor.country;
        if (visitor.phone) properties.phone = formatPhoneE164(visitor.phone);
        if (visitor.linkedin_url) properties.website = visitor.linkedin_url;

        return { properties };
      });

    // Batch create contacts in HubSpot (batch size 100)
    const batchSize = 100;
    let totalSynced = 0;

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

      const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/create', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${integration.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs: batch }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('HubSpot batch create error:', errorData);
        // Continue with remaining batches even if one fails (some contacts may already exist)
        if (response.status !== 409) {
          throw new Error(errorData?.message || 'Failed to create contacts in HubSpot');
        }
      } else {
        const result = await response.json();
        totalSynced += result.results?.length || batch.length;
      }
    }

    // Update last synced timestamp
    await updateLastSynced(user.id, PLATFORM);

    return res.status(200).json({
      success: true,
      synced: totalSynced,
      message: `${totalSynced} visitors synced to HubSpot`,
    });
  } catch (error) {
    console.error('Error syncing visitors to HubSpot:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync visitors to HubSpot' });
  }
}
