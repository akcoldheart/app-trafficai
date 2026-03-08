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

  const { pixel_id } = req.body;

  const integration = await getIntegration(user.id, 'pipedrive');
  if (!integration) {
    return res.status(400).json({ error: 'Pipedrive not connected' });
  }

  const apiKey = integration.api_key!;

  try {
    const visitors = await getVisitorsForSync(user.id, pixel_id);

    if (visitors.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No visitors with email to sync' });
    }

    // Build person payloads
    const persons = visitors
      .filter((v) => v.email && validateEmail(cleanEmail(v.email)))
      .map((visitor) => {
        const email = cleanEmail(visitor.email!);
        const firstName = visitor.first_name || (visitor.full_name ? parseFullName(visitor.full_name).firstName : '');
        const lastName = visitor.last_name || (visitor.full_name ? parseFullName(visitor.full_name).lastName : '');
        const phone = visitor.phone || ((visitor.metadata as Record<string, unknown>)?.phone as string) || '';
        const name = `${firstName} ${lastName}`.trim() || email;

        return {
          name,
          email: [{ value: email, primary: true }],
          phone: phone ? [{ value: formatPhoneE164(phone), primary: true }] : [],
          org_name: visitor.company || undefined,
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
      message: `${synced} visitors synced to Pipedrive`,
    });
  } catch (error) {
    console.error('Error syncing visitors to Pipedrive:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync visitors to Pipedrive' });
  }
}
