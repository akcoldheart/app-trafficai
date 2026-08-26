import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { getIntegration, updateLastSynced } from '@/lib/integrations';
import { fetchOrdersFromShopify, upsertConversionFromShopifyOrder } from '@/lib/shopify-orders';
import { getShopifyAccessToken } from '@/lib/shopify-auth';
import { logEvent } from '@/lib/webhook-logger';

export const config = { maxDuration: 300 };

const PLATFORM = 'shopify' as const;

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

  const effectiveUserId = await getEffectiveUserId(user.id);

  const integration = await getIntegration(effectiveUserId, PLATFORM);
  if (!integration) {
    return res.status(400).json({ error: 'Shopify not connected' });
  }

  const config = (integration.config || {}) as Record<string, unknown>;
  const shopDomain = config.shop_domain as string | undefined;
  if (!shopDomain) {
    return res.status(400).json({ error: 'Shop domain not configured' });
  }

  // Determine which pixel orders should be attributed to. Body wins, fall back
  // to integration config, then 400 if neither set.
  const pixelId = (req.body?.pixel_id as string | undefined)
    ?? (config.orders_attribution_pixel_id as string | undefined);
  if (!pixelId) {
    return res.status(400).json({
      error: 'No attribution pixel set. Open the Shopify integration and pick a pixel for orders to be attributed to.',
    });
  }

  // Verify the pixel belongs to this user
  const { data: pixel, error: pixelErr } = await supabaseAdmin
    .from('pixels')
    .select('id, user_id, orders_last_fetched_at')
    .eq('id', pixelId)
    .eq('user_id', effectiveUserId)
    .maybeSingle();
  if (pixelErr) return res.status(500).json({ error: pixelErr.message });
  if (!pixel) return res.status(404).json({ error: 'Pixel not found for this user' });

  // Allow the caller to force a full re-sync (e.g. first connect, or re-attribution).
  const fullResync = req.body?.full_resync === true;
  const updatedAtMin = fullResync ? null : pixel.orders_last_fetched_at;

  try {
    // Resolves a live token: mints a fresh one for client-credentials integrations when
    // the cached 24h token is stale, or returns the legacy static token unchanged.
    const accessToken = await getShopifyAccessToken(integration);

    const orders = await fetchOrdersFromShopify({
      shopDomain,
      accessToken,
      updatedAtMin,
    });

    let upserted = 0;
    let matched = 0;
    const errors: string[] = [];
    let newestUpdated: string | null = null;

    for (const order of orders) {
      try {
        const result = await upsertConversionFromShopifyOrder({
          userId: effectiveUserId,
          pixelId,
          shopDomain,
          order,
        });
        upserted++;
        if (result.matched) matched++;
        if (!newestUpdated || order.updated_at > newestUpdated) {
          newestUpdated = order.updated_at;
        }
      } catch (err) {
        errors.push(`order ${order.id}: ${(err as Error).message}`);
      }
    }

    // Bump the pixel high-water mark so the next run is incremental.
    // Use the newest order's updated_at, not now() — protects against orders
    // that were updated mid-fetch (Shopify returns them in the next page).
    await supabaseAdmin
      .from('pixels')
      .update({
        orders_last_fetched_at: newestUpdated || new Date().toISOString(),
        orders_last_fetch_status: errors.length === 0 ? 'success' : `partial: ${errors.length} errors`,
      })
      .eq('id', pixelId);

    await updateLastSynced(effectiveUserId, PLATFORM);

    await logEvent({
      type: 'api',
      event_name: 'shopify_orders_sync',
      status: errors.length === 0 ? 'success' : 'warning',
      message: `${shopDomain}: fetched ${orders.length}, upserted ${upserted}, attributed ${matched}${errors.length ? `, ${errors.length} errors` : ''}`,
      user_id: user.id,
      response_data: {
        shop_domain: shopDomain,
        pixel_id: pixelId,
        fetched: orders.length,
        upserted,
        matched,
        unmatched: upserted - matched,
        error_count: errors.length,
        errors: errors.slice(0, 5),
        trigger: 'manual',
        full_resync: fullResync,
      },
    });

    return res.status(200).json({
      success: true,
      fetched: orders.length,
      upserted,
      matched,
      unmatched: upserted - matched,
      errors: errors.slice(0, 20),
      message: `Synced ${upserted} orders (${matched} attributed)`,
    });
  } catch (error) {
    const message = (error as Error).message || 'Failed to sync orders from Shopify';
    await supabaseAdmin
      .from('pixels')
      .update({ orders_last_fetch_status: `error: ${message.slice(0, 200)}` })
      .eq('id', pixelId);
    console.error('Error syncing Shopify orders:', error);

    await logEvent({
      type: 'api',
      event_name: 'shopify_orders_sync',
      status: 'error',
      message: `${shopDomain}: sync failed — ${message.slice(0, 200)}`,
      user_id: user.id,
      error_details: message,
      response_data: { shop_domain: shopDomain, pixel_id: pixelId, trigger: 'manual' },
    });

    return res.status(500).json({ error: message });
  }
}
