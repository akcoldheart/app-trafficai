import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getAudienceContactsForSync, formatPhoneE164, validateEmail, cleanEmail, parseFullName } from '@/lib/integrations';

export const config = {
  maxDuration: 300,
};

interface MailchimpMember {
  email_address: string;
  status: string;
  merge_fields: {
    FNAME?: string;
    LNAME?: string;
    PHONE?: string;
  };
  tags: string[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { audience_id, list_id, create_new_list, new_list_name } = req.body;

  if (!audience_id) {
    return res.status(400).json({ error: 'audience_id is required' });
  }

  const integration = await getIntegration(user.id, 'mailchimp');
  if (!integration) {
    return res.status(400).json({ error: 'Mailchimp not connected' });
  }

  const dc = (integration.config as Record<string, string>).data_center;
  const authHeader = `Basic ${Buffer.from(`anystring:${integration.api_key}`).toString('base64')}`;

  try {
    let targetListId = list_id || (integration.config as Record<string, string>).default_list_id;

    // Create a new list if requested
    if (create_new_list && new_list_name) {
      const fromEmail = (integration.config as Record<string, string>).from_email || 'noreply@trafficai.com';

      const createListResponse = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: new_list_name,
          contact: {
            company: 'Traffic AI',
            address1: '',
            city: '',
            state: '',
            zip: '',
            country: 'US',
          },
          permission_reminder: 'You signed up via Traffic AI',
          campaign_defaults: {
            from_name: 'Traffic AI',
            from_email: fromEmail,
            subject: '',
            language: 'en',
          },
          email_type_option: false,
        }),
      });

      if (!createListResponse.ok) {
        const errorData = await createListResponse.json().catch(() => null);
        return res.status(400).json({
          error: errorData?.detail || 'Failed to create Mailchimp list',
        });
      }

      const listData = await createListResponse.json();
      targetListId = listData.id;
    }

    if (!targetListId) {
      return res.status(400).json({ error: 'No list selected. Please select a list or create a new one.' });
    }

    const contacts = await getAudienceContactsForSync(audience_id);

    if (contacts.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No contacts with email found in this audience' });
    }

    // Transform to Mailchimp members
    const members: MailchimpMember[] = contacts
      .filter((c) => c.email && validateEmail(cleanEmail(c.email)))
      .map((contact) => {
        const email = cleanEmail(contact.email!);
        const firstName = contact.first_name || (contact.full_name ? parseFullName(contact.full_name).firstName : '');
        const lastName = contact.last_name || (contact.full_name ? parseFullName(contact.full_name).lastName : '');

        return {
          email_address: email,
          status: 'subscribed',
          merge_fields: {
            FNAME: firstName || undefined,
            LNAME: lastName || undefined,
            PHONE: contact.phone ? formatPhoneE164(contact.phone) : undefined,
          },
          tags: ['Traffic AI'],
        };
      });

    // Batch add (limit 500 per request)
    const batchSize = 500;
    let totalSynced = 0;

    for (let i = 0; i < members.length; i += batchSize) {
      const batch = members.slice(i, i + batchSize);

      const response = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists/${targetListId}`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          members: batch,
          update_existing: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error('Mailchimp batch error:', errorData);
        throw new Error(errorData?.detail || 'Failed to sync contacts to Mailchimp');
      }

      const result = await response.json();
      totalSynced += (result.new_members?.length || 0) + (result.updated_members?.length || 0);
    }

    await updateLastSynced(user.id, 'mailchimp');

    return res.status(200).json({
      success: true,
      synced: totalSynced,
      total_submitted: members.length,
      list_id: targetListId,
      message: `${totalSynced} contacts synced to Mailchimp`,
    });
  } catch (error) {
    console.error('Error syncing audience to Mailchimp:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync audience to Mailchimp' });
  }
}
