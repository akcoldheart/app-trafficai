import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getAudienceContactsForSync, formatPhoneE164, validateEmail, cleanEmail, parseFullName } from '@/lib/integrations';
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
  source?: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { audience_id } = req.body;

  if (!audience_id) {
    return res.status(400).json({ error: 'audience_id is required' });
  }

  const integration = await getIntegration(user.id, PLATFORM);
  if (!integration) {
    return res.status(400).json({ error: 'HubSpot not connected' });
  }

  try {
    const contacts = await getAudienceContactsForSync(audience_id);

    if (!contacts || contacts.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No contacts with email found in this audience' });
    }

    // Filter valid emails and transform to HubSpot contact format
    const hubspotContacts = contacts
      .filter((c) => {
        if (!c.email) return false;
        const email = cleanEmail(c.email);
        return validateEmail(email);
      })
      .map((contact) => {
        const email = cleanEmail(contact.email!);
        const firstName = contact.first_name || (contact.full_name ? parseFullName(contact.full_name).firstName : undefined);
        const lastName = contact.last_name || (contact.full_name ? parseFullName(contact.full_name).lastName : undefined);

        const properties: HubSpotContactProperties = {
          email,
          lifecyclestage: 'lead',
          source: 'Traffic AI Audience',
        };

        if (firstName) properties.firstname = firstName;
        if (lastName) properties.lastname = lastName;
        if (contact.company) properties.company = contact.company;
        if (contact.job_title) properties.jobtitle = contact.job_title;
        if (contact.city) properties.city = contact.city;
        if (contact.state) properties.state = contact.state;
        if (contact.country) properties.country = contact.country;
        if (contact.phone) properties.phone = formatPhoneE164(contact.phone);
        if (contact.linkedin_url) properties.website = contact.linkedin_url;

        return { properties };
      });

    // Batch create contacts in HubSpot (batch size 100)
    const batchSize = 100;
    let totalSynced = 0;

    for (let i = 0; i < hubspotContacts.length; i += batchSize) {
      const batch = hubspotContacts.slice(i, i + batchSize);

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
      message: `${totalSynced} contacts synced to HubSpot`,
    });
  } catch (error) {
    console.error('Error syncing audience to HubSpot:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync audience to HubSpot' });
  }
}
