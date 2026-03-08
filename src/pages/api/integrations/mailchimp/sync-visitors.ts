import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getVisitorsForSync, formatPhoneE164, validateEmail, cleanEmail, parseFullName } from '@/lib/integrations';

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

  const { pixel_id, list_id } = req.body;

  const integration = await getIntegration(user.id, 'mailchimp');
  if (!integration) {
    return res.status(400).json({ error: 'Mailchimp not connected' });
  }

  const dc = (integration.config as Record<string, string>).data_center;
  const targetListId = list_id || (integration.config as Record<string, string>).default_list_id;

  if (!targetListId) {
    return res.status(400).json({ error: 'No Mailchimp list selected. Please select a default list or specify a list_id.' });
  }

  const authHeader = `Basic ${Buffer.from(`anystring:${integration.api_key}`).toString('base64')}`;

  try {
    const visitors = await getVisitorsForSync(user.id, pixel_id);

    if (visitors.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No visitors with email to sync' });
    }

    // Transform visitors to Mailchimp members
    const members: MailchimpMember[] = visitors
      .filter((v) => v.email && validateEmail(cleanEmail(v.email)))
      .map((visitor) => {
        const email = cleanEmail(visitor.email!);
        const firstName = visitor.first_name || (visitor.full_name ? parseFullName(visitor.full_name).firstName : '');
        const lastName = visitor.last_name || (visitor.full_name ? parseFullName(visitor.full_name).lastName : '');
        const phone = visitor.phone || ((visitor.metadata as Record<string, unknown>)?.phone as string) || '';

        return {
          email_address: email,
          status: 'subscribed',
          merge_fields: {
            FNAME: firstName || undefined,
            LNAME: lastName || undefined,
            PHONE: phone ? formatPhoneE164(phone) : undefined,
          },
          tags: ['Traffic AI'],
        };
      });

    // Batch add via Mailchimp batch endpoint (limit 500 per request)
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
        throw new Error(errorData?.detail || 'Failed to sync members to Mailchimp');
      }

      const result = await response.json();
      totalSynced += (result.new_members?.length || 0) + (result.updated_members?.length || 0);
    }

    await updateLastSynced(user.id, 'mailchimp');

    return res.status(200).json({
      success: true,
      synced: totalSynced,
      total_submitted: members.length,
      message: `${totalSynced} visitors synced to Mailchimp`,
    });
  } catch (error) {
    console.error('Error syncing visitors to Mailchimp:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync visitors to Mailchimp' });
  }
}
