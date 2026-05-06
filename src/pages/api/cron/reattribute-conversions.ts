import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { resolveAttribution } from '@/lib/shopify-orders';
import { logEvent } from '@/lib/webhook-logger';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_PROCESSING_MS = 270_000;
const LOOKBACK_DAYS = 30;
const PAGE_SIZE = 200;

/**
 * Nightly re-resolution: re-run attribution against the last 30 days of
 * conversions. Catches late identifications — visitor orders Monday, gets
 * identified Tuesday → we retro-attribute on Wednesday's run.
 *
 * We focus on currently-unmatched orders since matched ones are unlikely to
 * change (the matched visitor doesn't get less-matched). To handle the case
 * where a visitor record was deleted, also re-check matched ones whose
 * matched_visitor_id no longer resolves — but that's rare; we accept the gap.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const startTime = Date.now();

  let totalChecked = 0;
  let totalReattributed = 0;
  let totalErrors = 0;
  let cursor: string | null = null; // ordered_at cursor for keyset pagination

  try {
    // Loop over pages of unmatched conversions, oldest-first within the window
    while (Date.now() - startTime < MAX_PROCESSING_MS - 30_000) {
      let query = supabaseAdmin
        .from('conversions')
        .select('id, user_id, pixel_id, customer_email, customer_phone, ordered_at')
        .is('matched_visitor_id', null)
        .is('matched_contact_id', null)
        .gte('ordered_at', since.toISOString())
        .order('ordered_at', { ascending: true })
        .limit(PAGE_SIZE);

      if (cursor) query = query.gt('ordered_at', cursor);

      const { data: batch, error } = await query;
      if (error) throw error;
      if (!batch || batch.length === 0) break;

      for (const row of batch) {
        try {
          const attribution = await resolveAttribution({
            userId: row.user_id,
            pixelId: row.pixel_id,
            email: row.customer_email,
            phone: row.customer_phone,
            orderedAt: row.ordered_at,
          });

          if (attribution.match_method !== 'unmatched') {
            const { error: updErr } = await supabaseAdmin
              .from('conversions')
              .update({
                matched_visitor_id: attribution.matched_visitor_id,
                matched_contact_id: attribution.matched_contact_id,
                match_method: attribution.match_method,
                match_confidence: attribution.match_confidence,
                identified_before_order: attribution.identified_before_order,
              })
              .eq('id', row.id);
            if (updErr) {
              totalErrors++;
              console.error(`[cron/reattribute] update failed for ${row.id}:`, updErr.message);
            } else {
              totalReattributed++;
            }
          }
          totalChecked++;
        } catch (rowErr) {
          totalErrors++;
          console.error(`[cron/reattribute] row ${row.id} failed:`, (rowErr as Error).message);
        }
      }

      cursor = batch[batch.length - 1].ordered_at;
      if (batch.length < PAGE_SIZE) break;
    }

    await logEvent({
      type: 'api',
      event_name: 'reattribute_conversions',
      status: totalErrors === 0 ? 'success' : 'warning',
      message: `Re-checked ${totalChecked} unmatched conversions, retro-attributed ${totalReattributed}, ${totalErrors} errors`,
    });

    return res.status(200).json({
      success: totalErrors === 0,
      checked: totalChecked,
      reattributed: totalReattributed,
      errors: totalErrors,
    });
  } catch (error) {
    console.error('[cron/reattribute-conversions] crashed:', error);
    await logEvent({
      type: 'api',
      event_name: 'reattribute_conversions',
      status: 'error',
      message: 'Re-attribution cron crashed',
      error_details: (error as Error).message,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
