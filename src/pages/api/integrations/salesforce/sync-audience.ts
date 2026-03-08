import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getAudienceContactsForSync, formatPhoneE164, validateEmail, cleanEmail, parseFullName } from '@/lib/integrations';
import type { PlatformType } from '@/lib/integrations';

export const config = {
  maxDuration: 300,
};

const PLATFORM: PlatformType = 'salesforce';

interface SalesforceContact {
  attributes: { type: 'Contact' };
  Email: string;
  FirstName?: string;
  LastName?: string;
  Title?: string;
  Phone?: string;
  MailingCity?: string;
  MailingState?: string;
  MailingCountry?: string;
  Description: string;
  LeadSource: string;
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
    return res.status(400).json({ error: 'Salesforce not connected' });
  }

  const instanceUrl = (integration.config as Record<string, unknown>)?.instance_url as string;
  if (!instanceUrl) {
    return res.status(400).json({ error: 'Salesforce instance URL not configured' });
  }

  try {
    const contacts = await getAudienceContactsForSync(audience_id);

    if (!contacts || contacts.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No contacts with email found in this audience' });
    }

    // Filter valid emails and transform to Salesforce Contact format
    const salesforceContacts: SalesforceContact[] = contacts
      .filter((c) => {
        if (!c.email) return false;
        const email = cleanEmail(c.email);
        return validateEmail(email);
      })
      .map((contact) => {
        const email = cleanEmail(contact.email!);
        const firstName = contact.first_name || (contact.full_name ? parseFullName(contact.full_name).firstName : undefined);
        const lastName = contact.last_name || (contact.full_name ? parseFullName(contact.full_name).lastName : undefined);

        const record: SalesforceContact = {
          attributes: { type: 'Contact' },
          Email: email,
          LastName: lastName || email.split('@')[0], // Salesforce requires LastName
          Description: 'Synced from Traffic AI',
          LeadSource: 'Traffic AI',
        };

        if (firstName) record.FirstName = firstName;
        if (contact.job_title) record.Title = contact.job_title;
        if (contact.phone) record.Phone = formatPhoneE164(contact.phone);
        if (contact.city) record.MailingCity = contact.city;
        if (contact.state) record.MailingState = contact.state;
        if (contact.country) record.MailingCountry = contact.country;

        return record;
      });

    // Batch create using Salesforce Composite API (batch size 200)
    const batchSize = 200;
    let totalSynced = 0;

    for (let i = 0; i < salesforceContacts.length; i += batchSize) {
      const batch = salesforceContacts.slice(i, i + batchSize);

      const response = await fetch(`${instanceUrl}/services/data/v59.0/composite/sobjects`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${integration.api_key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          allOrNone: false,
          records: batch,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Salesforce composite API error:', errorData);
        throw new Error(Array.isArray(errorData) ? errorData[0]?.message : 'Failed to create contacts in Salesforce');
      }

      const results = await response.json();
      if (Array.isArray(results)) {
        totalSynced += results.filter((r: { success: boolean }) => r.success).length;
      }
    }

    // Update last synced timestamp
    await updateLastSynced(user.id, PLATFORM);

    return res.status(200).json({
      success: true,
      synced: totalSynced,
      message: `${totalSynced} contacts synced to Salesforce`,
    });
  } catch (error) {
    console.error('Error syncing audience to Salesforce:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync audience to Salesforce' });
  }
}
