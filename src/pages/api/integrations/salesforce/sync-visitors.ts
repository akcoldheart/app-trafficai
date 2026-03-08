import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getVisitorsForSync, formatPhoneE164, parseFullName } from '@/lib/integrations';
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
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const integration = await getIntegration(user.id, PLATFORM);
  if (!integration) {
    return res.status(400).json({ error: 'Salesforce not connected' });
  }

  const instanceUrl = (integration.config as Record<string, unknown>)?.instance_url as string;
  if (!instanceUrl) {
    return res.status(400).json({ error: 'Salesforce instance URL not configured' });
  }

  const { pixel_id } = req.body;

  try {
    const visitors = await getVisitorsForSync(user.id, pixel_id);

    if (!visitors || visitors.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No visitors with email to sync' });
    }

    // Transform visitors to Salesforce Contact format
    const contacts: SalesforceContact[] = visitors
      .filter((v) => v.email)
      .map((visitor) => {
        const firstName = visitor.first_name || (visitor.full_name ? parseFullName(visitor.full_name).firstName : undefined);
        const lastName = visitor.last_name || (visitor.full_name ? parseFullName(visitor.full_name).lastName : undefined);

        const record: SalesforceContact = {
          attributes: { type: 'Contact' },
          Email: visitor.email!,
          LastName: lastName || visitor.email!.split('@')[0], // Salesforce requires LastName
          Description: 'Synced from Traffic AI',
        };

        if (firstName) record.FirstName = firstName;
        if (visitor.job_title) record.Title = visitor.job_title;
        if (visitor.phone) record.Phone = formatPhoneE164(visitor.phone);
        if (visitor.city) record.MailingCity = visitor.city;
        if (visitor.state) record.MailingState = visitor.state;
        if (visitor.country) record.MailingCountry = visitor.country;

        return record;
      });

    // Batch create using Salesforce Composite API (batch size 200)
    const batchSize = 200;
    let totalSynced = 0;

    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);

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
      message: `${totalSynced} visitors synced to Salesforce`,
    });
  } catch (error) {
    console.error('Error syncing visitors to Salesforce:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync visitors to Salesforce' });
  }
}
