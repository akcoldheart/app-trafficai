import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getVisitorsForSync, formatPhoneE164, validateEmail, cleanEmail, parseFullName } from '@/lib/integrations';

export const config = {
  maxDuration: 300,
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { pixel_id, list_id } = req.body;

  const integration = await getIntegration(user.id, 'activecampaign');
  if (!integration) {
    return res.status(400).json({ error: 'ActiveCampaign not connected' });
  }

  const apiUrl = (integration.config as Record<string, string>).api_url;
  const apiToken = integration.api_key!;

  try {
    const visitors = await getVisitorsForSync(user.id, pixel_id);

    if (visitors.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No visitors with email to sync' });
    }

    let synced = 0;
    let errors = 0;

    for (const visitor of visitors) {
      if (!visitor.email || !validateEmail(cleanEmail(visitor.email))) continue;

      const email = cleanEmail(visitor.email);
      const firstName = visitor.first_name || (visitor.full_name ? parseFullName(visitor.full_name).firstName : '');
      const lastName = visitor.last_name || (visitor.full_name ? parseFullName(visitor.full_name).lastName : '');
      const phone = visitor.phone || ((visitor.metadata as Record<string, unknown>)?.phone as string) || '';

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
              phone: phone ? formatPhoneE164(phone) : undefined,
            },
          }),
        });

        if (!syncResponse.ok) {
          errors++;
          continue;
        }

        const syncData = await syncResponse.json();
        const contactId = syncData.contact?.id;

        // Add to list if list_id provided and contact was created/updated
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
      message: `${synced} visitors synced to ActiveCampaign`,
    });
  } catch (error) {
    console.error('Error syncing visitors to ActiveCampaign:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync visitors to ActiveCampaign' });
  }
}
