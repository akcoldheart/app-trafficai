import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced, getAudienceContactsForSync } from '@/lib/integrations';
import { getAccessToken, createSpreadsheet } from '@/lib/google-sheets';
import type { PlatformType } from '@/lib/integrations';

export const config = {
  maxDuration: 300,
};

const PLATFORM: PlatformType = 'google_sheets';

const PRIORITY_COLS = [
  'email', 'first_name', 'last_name', 'full_name', 'company', 'job_title',
  'phone', 'city', 'state', 'country', 'linkedin_url',
];

function formatColumnName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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

  const { audience_id, audience_name } = req.body;

  if (!audience_id) {
    return res.status(400).json({ error: 'Audience ID is required' });
  }

  try {
    const accessToken = await getAccessToken(user.id);
    const contacts = await getAudienceContactsForSync(audience_id);

    if (!contacts || contacts.length === 0) {
      return res.status(200).json({ success: true, synced: 0, message: 'No contacts to export' });
    }

    // Collect columns
    const allColumns = new Set<string>();
    contacts.forEach((c: Record<string, unknown>) => Object.keys(c).forEach(k => allColumns.add(k)));
    ['id', 'audience_id', 'created_at'].forEach(k => allColumns.delete(k));

    const columns = Array.from(allColumns).sort((a, b) => {
      const ai = PRIORITY_COLS.indexOf(a);
      const bi = PRIORITY_COLS.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    const headers = columns.map(formatColumnName);
    const rows = contacts.map((contact: Record<string, unknown>) =>
      columns.map(col => {
        const val = contact[col];
        if (val === null || val === undefined) return '';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
      })
    );

    const safeName = audience_name || 'Audience';
    const title = `TrafficAI - ${safeName} - ${new Date().toLocaleDateString()}`;

    const { spreadsheetUrl } = await createSpreadsheet(accessToken, title, headers, rows);

    await updateLastSynced(user.id, PLATFORM);

    return res.status(200).json({
      success: true,
      synced: contacts.length,
      message: `${contacts.length} contacts synced to Google Sheets`,
      spreadsheet_url: spreadsheetUrl,
    });
  } catch (error) {
    console.error('Error exporting audience to Google Sheets:', error);
    return res.status(500).json({ error: (error as Error).message || 'Failed to export audience' });
  }
}
