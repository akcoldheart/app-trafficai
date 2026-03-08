import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getAudienceContactsForSync, formatPhoneE164, validateEmail, cleanEmail, parseFullName } from '@/lib/integrations';

export const config = {
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { audience_id, list_id } = req.body;

  if (!audience_id) {
    return res.status(400).json({ error: 'audience_id is required' });
  }

  const integration = await getIntegration(user.id, 'activecampaign');
  if (!integration) {
    return res.status(400).json({ error: 'ActiveCampaign not connected' });
  }

  const apiUrl = (integration.config as Record<string, string>).api_url;
  const apiToken = integration.api_key!;

  try {
    const contacts = await getAudienceContactsForSync(audience_id);

    if (contacts.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No contacts with email found in this audience' });
    }

    let synced = 0;
    let errors = 0;

    for (const contact of contacts) {
      if (!contact.email || !validateEmail(cleanEmail(contact.email))) continue;

      const email = cleanEmail(contact.email);
      const firstName = contact.first_name || (contact.full_name ? parseFullName(contact.full_name).firstName : '');
      const lastName = contact.last_name || (contact.full_name ? parseFullName(contact.full_name).lastName : '');

      try {
        // Create or update contact via sync endpoint
        const syncResponse = await fetch(`${apiUrl}/api/3/contact/sync`, {
          method: 'POST',
          headers: {
            'Api-Token': apiToken,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contact: {
              email,
              firstName: firstName || undefined,
              lastName: lastName || undefined,
              phone: contact.phone ? formatPhoneE164(contact.phone) : undefined,
            },
          }),
        });

        if (!syncResponse.ok) {
          errors++;
          continue;
        }

        const syncData = await syncResponse.json();
        const contactId = syncData.contact?.id;

        // Add to list if list_id provided
        if (list_id && contactId) {
          await fetch(`${apiUrl}/api/3/contactLists`, {
            method: 'POST',
            headers: {
              'Api-Token': apiToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contactList: {
                list: list_id,
                contact: contactId,
                status: 1,
              },
            }),
          });
        }

        synced++;
      } catch {
        errors++;
      }
    }

    await updateLastSynced(user.id, 'activecampaign');

    return res.status(200).json({
      success: true,
      synced,
      errors,
      message: `${synced} contacts synced to ActiveCampaign`,
    });
  } catch (error) {
    console.error('Error syncing audience to ActiveCampaign:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync audience to ActiveCampaign' });
  }
}
