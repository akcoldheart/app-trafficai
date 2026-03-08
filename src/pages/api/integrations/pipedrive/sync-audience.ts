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

  const { audience_id } = req.body;

  if (!audience_id) {
    return res.status(400).json({ error: 'audience_id is required' });
  }

  const integration = await getIntegration(user.id, 'pipedrive');
  if (!integration) {
    return res.status(400).json({ error: 'Pipedrive not connected' });
  }

  const apiKey = integration.api_key!;

  try {
    const contacts = await getAudienceContactsForSync(audience_id);

    if (contacts.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No contacts with email found in this audience' });
    }

    // Build person payloads
    const persons = contacts
      .filter((c) => c.email && validateEmail(cleanEmail(c.email)))
      .map((contact) => {
        const email = cleanEmail(contact.email!);
        const firstName = contact.first_name || (contact.full_name ? parseFullName(contact.full_name).firstName : '');
        const lastName = contact.last_name || (contact.full_name ? parseFullName(contact.full_name).lastName : '');
        const name = `${firstName} ${lastName}`.trim() || email;

        return {
          name,
          email: [{ value: email, primary: true }],
          phone: contact.phone ? [{ value: formatPhoneE164(contact.phone), primary: true }] : [],
          org_name: contact.company || undefined,
          visible_to: 3,
        };
      });

    // Create persons in chunks of 10 (rate limit friendly)
    const chunkSize = 10;
    let synced = 0;
    let errors = 0;

    for (let i = 0; i < persons.length; i += chunkSize) {
      const chunk = persons.slice(i, i + chunkSize);

      const results = await Promise.all(
        chunk.map(async (person) => {
          try {
            const response = await fetch(`https://api.pipedrive.com/v1/persons?api_token=${apiKey}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(person),
            });

            if (!response.ok) {
              return { success: false };
            }

            return { success: true };
          } catch {
            return { success: false };
          }
        })
      );

      for (const result of results) {
        if (result.success) {
          synced++;
        } else {
          errors++;
        }
      }
    }

    await updateLastSynced(user.id, 'pipedrive');

    return res.status(200).json({
      success: true,
      synced,
      errors,
      message: `${synced} contacts synced to Pipedrive`,
    });
  } catch (error) {
    console.error('Error syncing audience to Pipedrive:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync audience to Pipedrive' });
  }
}
