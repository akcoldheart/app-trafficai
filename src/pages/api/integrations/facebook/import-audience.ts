import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { getIntegration, getVisitorsForSync, getAudienceContactsForSync } from '@/lib/integrations';
import crypto from 'crypto';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { ad_account_id, audience_name, source_pixel_id, source_audience_id } = req.body;

  if (!ad_account_id || !audience_name) {
    return res.status(400).json({ error: 'ad_account_id and audience_name are required' });
  }

  if (!source_pixel_id && !source_audience_id) {
    return res.status(400).json({ error: 'Either source_pixel_id or source_audience_id is required' });
  }

  try {
    const integration = await getIntegration(user.id, 'facebook');

    if (!integration) {
      return res.status(401).json({ error: 'Facebook not connected' });
    }

    const accessToken = integration.api_key;

    // Create import record
    const { data: importRecord, error: insertError } = await supabaseAdmin
      .from('facebook_audience_imports')
      .insert({
        user_id: user.id,
        audience_name,
        source_pixel_id: source_pixel_id || null,
        source_audience_id: source_audience_id || null,
        status: 'processing',
      })
      .select('id')
      .single();

    if (insertError) throw insertError;

    // Fetch contacts
    let contacts: { email?: string | null }[];
    if (source_pixel_id) {
      contacts = await getVisitorsForSync(user.id, source_pixel_id);
    } else {
      contacts = await getAudienceContactsForSync(source_audience_id);
    }

    const emails = contacts
      .map(c => c.email?.toLowerCase().trim())
      .filter((e): e is string => !!e);

    if (emails.length === 0) {
      await supabaseAdmin
        .from('facebook_audience_imports')
        .update({ status: 'failed', error_message: 'No contacts with emails found' })
        .eq('id', importRecord.id);
      return res.status(400).json({ error: 'No contacts with emails found' });
    }

    // Hash emails with SHA256
    const hashedEmails = emails.map(email =>
      crypto.createHash('sha256').update(email).digest('hex')
    );

    // Create Custom Audience
    const createResp = await fetch(
      `https://graph.facebook.com/v19.0/${ad_account_id}/customaudiences`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: audience_name,
          subtype: 'CUSTOM',
          description: `Imported from Traffic AI - ${emails.length} contacts`,
          customer_file_source: 'USER_PROVIDED_ONLY',
          access_token: accessToken,
        }),
      }
    );
    const createData = await createResp.json();

    if (!createResp.ok || !createData.id) {
      await supabaseAdmin
        .from('facebook_audience_imports')
        .update({ status: 'failed', error_message: createData.error?.message || 'Failed to create audience' })
        .eq('id', importRecord.id);
      return res.status(400).json({ error: 'Failed to create Facebook audience', details: createData.error?.message });
    }

    const fbAudienceId = createData.id;

    // Upload hashed users in batches of 5000
    const batchSize = 5000;
    for (let i = 0; i < hashedEmails.length; i += batchSize) {
      const batch = hashedEmails.slice(i, i + batchSize);
      const uploadResp = await fetch(
        `https://graph.facebook.com/v19.0/${fbAudienceId}/users`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            payload: {
              schema: ['EMAIL_SHA256'],
              data: batch.map(h => [h]),
            },
            access_token: accessToken,
          }),
        }
      );

      if (!uploadResp.ok) {
        const uploadData = await uploadResp.json();
        console.error('Facebook upload batch error:', uploadData);
      }
    }

    // Update import record
    await supabaseAdmin
      .from('facebook_audience_imports')
      .update({
        audience_id: fbAudienceId,
        contact_count: emails.length,
        status: 'completed',
      })
      .eq('id', importRecord.id);

    return res.status(200).json({
      success: true,
      audience_id: fbAudienceId,
      contact_count: emails.length,
      message: `Successfully imported ${emails.length} contacts to Facebook Custom Audience "${audience_name}"`,
    });
  } catch (error) {
    console.error('Error importing Facebook audience:', error);
    return res.status(500).json({ error: 'Failed to import audience' });
  }
}
