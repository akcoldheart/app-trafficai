import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { fetchOrdersFromShopify, upsertConversionFromShopifyOrder } from '@/lib/shopify-orders';
import { logEvent } from '@/lib/webhook-logger';

export const config = { maxDuration: 300 };

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_PROCESSING_MS = 270_000; // 4.5 minutes; leaves 30s buffer for response

interface SyncJob {
  user_id: string;
  pixel_id: string;
  pixel_orders_last_fetched_at: string | null;
  shop_domain: string;
  access_token: string;
  platform: 'shopify';
}

/**
 * Same fairness pattern as fetch-visitors.ts: interleave jobs across users so
 * one user with many shops doesn't starve others.
 */
function interleaveByUser(jobs: SyncJob[]): SyncJob[] {
  const byUser = new Map<string, SyncJob[]>();
  for (const job of jobs) {
    const group = byUser.get(job.user_id) || [];
    group.push(job);
    byUser.set(job.user_id, group);
  }
  for (const group of Array.from(byUser.values())) {
    group.sort((a, b) => {
      if (!a.pixel_orders_last_fetched_at && !b.pixel_orders_last_fetched_at) return 0;
      if (!a.pixel_orders_last_fetched_at) return -1;
      if (!b.pixel_orders_last_fetched_at) return 1;
      return a.pixel_orders_last_fetched_at.localeCompare(b.pixel_orders_last_fetched_at);
    });
  }
  const userOrder = Array.from(byUser.entries()).sort((a, b) => {
    const ao = a[1][0].pixel_orders_last_fetched_at;
    const bo = b[1][0].pixel_orders_last_fetched_at;
    if (!ao && !bo) return 0;
    if (!ao) return -1;
    if (!bo) return 1;
    return ao.localeCompare(bo);
  });
  const result: SyncJob[] = [];
  let hasMore = true;
  let round = 0;
  while (hasMore) {
    hasMore = false;
    for (const [, group] of userOrder) {
      if (round < group.length) {
        result.push(group[round]);
        hasMore = true;
      }
    }
    round++;
  }
  return result;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Pull every connected Shopify integration. Each one declares an attribution
    // pixel in config — skip integrations that haven't picked one yet.
    let allIntegrations: Array<{
      user_id: string;
      api_key: string | null;
      config: Record<string, unknown> | null;
    }> = [];
    let from = 0;
    const PAGE_SIZE = 1000;
    while (true) {
      const { data, error } = await supabaseAdmin
        .from('platform_integrations')
        .select('user_id, api_key, config')
        .eq('platform', 'shopify')
        .eq('is_connected', true)
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allIntegrations = allIntegrations.concat(data as typeof allIntegrations);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    // Map each integration to a sync job (skip ones without attribution pixel)
    const candidatePixelIds: string[] = [];
    const integrationByPixel = new Map<string, typeof allIntegrations[number]>();
    for (const integ of allIntegrations) {
      const cfg = (integ.config || {}) as Record<string, unknown>;
      const pixelId = cfg.orders_attribution_pixel_id as string | undefined;
      const shopDomain = cfg.shop_domain as string | undefined;
      if (!pixelId || !shopDomain || !integ.api_key) continue;
      candidatePixelIds.push(pixelId);
      integrationByPixel.set(pixelId, integ);
    }

    if (candidatePixelIds.length === 0) {
      return res.status(200).json({ success: true, message: 'No connected Shopify integrations with attribution pixel set', results: [] });
    }

    // Fetch the corresponding pixels (and their last_fetched_at) in one query
    const { data: pixelRows } = await supabaseAdmin
      .from('pixels')
      .select('id, user_id, orders_last_fetched_at')
      .in('id', candidatePixelIds);

    const jobs: SyncJob[] = [];
    for (const pixel of pixelRows || []) {
      const integ = integrationByPixel.get(pixel.id);
      if (!integ) continue;
      // Defense: ensure pixel ownership matches integration owner (no cross-tenant)
      if (pixel.user_id !== integ.user_id) continue;
      const cfg = integ.config as Record<string, unknown>;
      jobs.push({
        user_id: integ.user_id,
        pixel_id: pixel.id,
        pixel_orders_last_fetched_at: pixel.orders_last_fetched_at as string | null,
        shop_domain: cfg.shop_domain as string,
        access_token: integ.api_key!,
        platform: 'shopify',
      });
    }

    const orderedJobs = interleaveByUser(jobs);
    const results: Array<Record<string, unknown>> = [];
    const startTime = Date.now();
    let skipped = 0;

    for (let i = 0; i < orderedJobs.length; i++) {
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_PROCESSING_MS - 60_000) {
        skipped = orderedJobs.length - i;
        console.warn(`[cron/sync-conversions] Timeout approaching after ${i} jobs, skipping ${skipped}`);
        break;
      }

      const job = orderedJobs[i];
      // Small delay between jobs to be polite to Shopify's API
      if (i > 0) await new Promise(r => setTimeout(r, 1500));

      try {
        const orders = await fetchOrdersFromShopify({
          shopDomain: job.shop_domain,
          accessToken: job.access_token,
          updatedAtMin: job.pixel_orders_last_fetched_at,
          maxOrders: 1000, // per-job cap so one busy shop doesn't eat the whole budget
        });

        let upserted = 0;
        let matched = 0;
        let newestUpdated: string | null = null;
        const errors: string[] = [];

        for (const order of orders) {
          try {
            const r = await upsertConversionFromShopifyOrder({
              userId: job.user_id,
              pixelId: job.pixel_id,
              shopDomain: job.shop_domain,
              order,
            });
            upserted++;
            if (r.matched) matched++;
            if (!newestUpdated || order.updated_at > newestUpdated) {
              newestUpdated = order.updated_at;
            }
          } catch (orderErr) {
            errors.push(`order ${order.id}: ${(orderErr as Error).message}`);
          }
        }

        await supabaseAdmin
          .from('pixels')
          .update({
            orders_last_fetched_at: newestUpdated || new Date().toISOString(),
            orders_last_fetch_status: errors.length === 0 ? 'success' : `partial: ${errors.length} errors`,
          })
          .eq('id', job.pixel_id);

        results.push({
          pixel_id: job.pixel_id,
          fetched: orders.length,
          upserted,
          matched,
          errors: errors.length,
        });

        // Per-shop log entry so admins can see each merchant's sync in /admin/logs
        await logEvent({
          type: 'api',
          event_name: 'shopify_orders_sync',
          status: errors.length === 0 ? 'success' : 'warning',
          message: `${job.shop_domain}: fetched ${orders.length}, upserted ${upserted}, attributed ${matched}${errors.length ? `, ${errors.length} errors` : ''}`,
          user_id: job.user_id,
          response_data: {
            shop_domain: job.shop_domain,
            pixel_id: job.pixel_id,
            fetched: orders.length,
            upserted,
            matched,
            unmatched: upserted - matched,
            error_count: errors.length,
            errors: errors.slice(0, 5),
            trigger: 'cron',
          },
        });
      } catch (jobErr) {
        const message = (jobErr as Error).message || 'unknown error';
        await supabaseAdmin
          .from('pixels')
          .update({ orders_last_fetch_status: `error: ${message.slice(0, 200)}` })
          .eq('id', job.pixel_id);
        results.push({ pixel_id: job.pixel_id, error: message });

        await logEvent({
          type: 'api',
          event_name: 'shopify_orders_sync',
          status: 'error',
          message: `${job.shop_domain}: sync failed — ${message.slice(0, 200)}`,
          user_id: job.user_id,
          error_details: message,
          response_data: { shop_domain: job.shop_domain, pixel_id: job.pixel_id, trigger: 'cron' },
        });
      }
    }

    const succeeded = results.filter(r => !r.error).length;
    const failed = results.filter(r => r.error).length;

    await logEvent({
      type: 'api',
      event_name: 'sync_conversions',
      status: failed === 0 ? 'success' : 'warning',
      message: `Synced ${succeeded}/${orderedJobs.length} shops (${failed} errors, ${skipped} skipped due to timeout)`,
    });

    return res.status(200).json({
      success: failed === 0,
      processed: results.length,
      succeeded,
      failed,
      skipped_timeout: skipped,
      total_jobs: orderedJobs.length,
      results,
    });
  } catch (error) {
    console.error('[cron/sync-conversions] crashed:', error);
    await logEvent({
      type: 'api',
      event_name: 'sync_conversions',
      status: 'error',
      message: 'Cron sync-conversions crashed',
      error_details: (error as Error).message,
    });
    return res.status(500).json({ error: 'Internal server error' });
  }
}
