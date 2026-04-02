import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface GoogleSheetsConfig {
  client_secret: string;
  access_token: string;
  refresh_token: string;
  token_expiry: number;
  google_email?: string;
}

/**
 * Get a valid access token, refreshing if expired
 */
export async function getAccessToken(userId: string): Promise<string> {
  const { data: integration } = await supabaseAdmin
    .from('platform_integrations')
    .select('api_key, config')
    .eq('user_id', userId)
    .eq('platform', 'google_sheets')
    .eq('is_connected', true)
    .single();

  if (!integration) throw new Error('Google Sheets not connected');

  const config = integration.config as unknown as GoogleSheetsConfig;
  const clientId = integration.api_key;

  // Check if token is still valid (with 5 min buffer)
  if (config.token_expiry && Date.now() < config.token_expiry - 300000) {
    return config.access_token;
  }

  // Refresh the token
  if (!config.refresh_token) {
    throw new Error('No refresh token. Please reconnect Google Sheets.');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: config.client_secret,
      refresh_token: config.refresh_token,
      grant_type: 'refresh_token',
    }),
  });

  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenData.access_token) {
    throw new Error('Failed to refresh Google token. Please reconnect.');
  }

  // Update stored token
  await supabaseAdmin
    .from('platform_integrations')
    .update({
      config: {
        ...config,
        access_token: tokenData.access_token,
        token_expiry: Date.now() + (tokenData.expires_in * 1000),
      },
    })
    .eq('user_id', userId)
    .eq('platform', 'google_sheets');

  return tokenData.access_token;
}

/**
 * Create a new Google Spreadsheet and populate it with data
 */
export async function createSpreadsheet(
  accessToken: string,
  title: string,
  headers: string[],
  rows: string[][]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // Create spreadsheet
  const createResp = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{
        properties: {
          title: 'Sheet1',
          gridProperties: { frozenRowCount: 1 },
        },
      }],
    }),
  });

  if (!createResp.ok) {
    const err = await createResp.json().catch(() => null);
    const errObj = err?.error;
    const message = typeof errObj === 'string' ? errObj : errObj?.message || createResp.statusText;
    console.error('Google Sheets API error:', JSON.stringify(err));
    throw new Error(`Failed to create spreadsheet: ${message} (${createResp.status})`);
  }

  const spreadsheet = await createResp.json();
  const spreadsheetId = spreadsheet.spreadsheetId;

  // Write data in batches (Google Sheets API has limits)
  const allRows = [headers, ...rows];
  const BATCH_SIZE = 5000;

  for (let i = 0; i < allRows.length; i += BATCH_SIZE) {
    const batch = allRows.slice(i, i + BATCH_SIZE);
    const range = i === 0 ? 'Sheet1!A1' : `Sheet1!A${i + 1}`;

    const updateResp = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ range, values: batch }),
      }
    );

    if (!updateResp.ok) {
      const err = await updateResp.json().catch(() => ({}));
      console.error('Error writing to sheet:', err);
    }
  }

  // Bold header row + auto-resize
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId: 0, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true } } },
              fields: 'userEnteredFormat.textFormat.bold',
            },
          },
          {
            autoResizeDimensions: {
              dimensions: { sheetId: 0, dimension: 'COLUMNS', startIndex: 0, endIndex: headers.length },
            },
          },
        ],
      }),
    }
  );

  return {
    spreadsheetId,
    spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
  };
}
