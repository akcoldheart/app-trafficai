import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration } from '@/lib/integrations';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const integration = await getIntegration(user.id, 'mailchimp');
  if (!integration) {
    return res.status(400).json({ error: 'Mailchimp not connected. Please connect your Mailchimp account first.' });
  }

  const dc = (integration.config as Record<string, string>).data_center;
  const authHeader = `Basic ${Buffer.from(`anystring:${integration.api_key}`).toString('base64')}`;

  if (req.method === 'GET') {
    try {
      const response = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists?count=100`, {
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return res.status(response.status).json({ error: 'Failed to fetch Mailchimp lists' });
      }

      const data = await response.json();
      const lists = (data.lists || []).map((l: { id: string; name: string; stats: { member_count: number } }) => ({
        id: l.id,
        name: l.name,
        member_count: l.stats.member_count,
      }));

      return res.status(200).json({ lists });
    } catch (error) {
      console.error('Error fetching Mailchimp lists:', error);
      return res.status(500).json({ error: 'Failed to fetch Mailchimp lists' });
    }
  }

  if (req.method === 'POST') {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'List name is required' });
    }

    const fromEmail = (integration.config as Record<string, string>).from_email || 'noreply@trafficai.com';

    try {
      const response = await fetch(`https://${dc}.api.mailchimp.com/3.0/lists`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
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

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        return res.status(response.status).json({
          error: errorData?.detail || 'Failed to create Mailchimp list',
        });
      }

      const data = await response.json();
      return res.status(201).json({
        list: {
          id: data.id,
          name: data.name,
          member_count: data.stats?.member_count || 0,
        },
      });
    } catch (error) {
      console.error('Error creating Mailchimp list:', error);
      return res.status(500).json({ error: 'Failed to create Mailchimp list' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
