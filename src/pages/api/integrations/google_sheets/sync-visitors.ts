import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getVisitorsForSync, parseFullName } from '@/lib/integrations';
import { getAccessToken, createSpreadsheet } from '@/lib/google-sheets';
import type { PlatformType } from '@/lib/integrations';

export const config = {
  maxDuration: 300,
};

const PLATFORM: PlatformType = 'google_sheets';

const HEADERS = [
  'Email', 'First Name', 'Last Name', 'Company', 'Job Title',
  'City', 'State', 'Country', 'Lead Score', 'Total Pageviews',
  'Total Sessions', 'First Seen', 'Last Seen', 'LinkedIn URL',
];

function visitorToRow(visitor: Record<string, unknown>): string[] {
  const firstName = (visitor.first_name as string) || (visitor.full_name ? parseFullName(visitor.full_name as string).firstName : '') || '';
  const lastName = (visitor.last_name as string) || (visitor.full_name ? parseFullName(visitor.full_name as string).lastName : '') || '';

  return [
    (visitor.email as string) || '',
    firstName,
    lastName,
    (visitor.company as string) || '',
    (visitor.job_title as string) || '',
    (visitor.city as string) || '',
    (visitor.state as string) || '',
    (visitor.country as string) || '',
    String(visitor.lead_score || 0),
    String(visitor.total_pageviews || 0),
    String(visitor.total_sessions || 0),
    visitor.first_seen_at ? new Date(visitor.first_seen_at as string).toLocaleDateString() : '',
    visitor.last_seen_at ? new Date(visitor.last_seen_at as string).toLocaleDateString() : '',
    (visitor.linkedin_url as string) || '',
  ];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const integration = await getIntegration(user.id, PLATFORM);
  if (!integration) {
    return res.status(400).json({ error: 'Google Sheets not connected' });
  }

  const { pixel_id } = req.body;

  try {
    const accessToken = await getAccessToken(user.id);
    const visitors = await getVisitorsForSync(user.id, pixel_id);

    if (!visitors || visitors.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No visitors with email to sync' });
    }

    const rows = visitors.map(visitorToRow);
    const title = `TrafficAI Visitors - ${new Date().toLocaleDateString()}`;

    const { spreadsheetUrl } = await createSpreadsheet(accessToken, title, HEADERS, rows);

    await updateLastSynced(user.id, PLATFORM);

    return res.status(200).json({
      success: true,
      synced: visitors.length,
      message: `${visitors.length} visitors synced to Google Sheets`,
      spreadsheet_url: spreadsheetUrl,
    });
  } catch (error) {
    console.error('Error syncing visitors to Google Sheets:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to sync visitors' });
  }
}
