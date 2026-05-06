import { createClient } from '@supabase/supabase-js';
import { formatPhoneE164 } from './integrations';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SHOPIFY_API_VERSION = '2024-01';
const PAGE_LIMIT = 250;

export interface ShopifyOrder {
  id: number;
  name: string;                       // "#1001"
  order_number: number;
  email: string | null;
  phone: string | null;
  total_price: string;
  subtotal_price: string;
  currency: string;
  financial_status: string | null;
  fulfillment_status: string | null;
  created_at: string;
  updated_at: string;
  customer: {
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
  order_status_url?: string;
}

export interface FetchOrdersResult {
  fetched: number;
  upserted: number;
  matched: number;
  errors: string[];
  newestOrderUpdatedAt: string | null;
}

/**
 * Fetch orders from a Shopify store, paginating via the cursor-based Link header.
 * Uses updated_at_min so re-runs only pull what changed since the last fetch.
 */
export async function fetchOrdersFromShopify(args: {
  shopDomain: string;
  accessToken: string;
  updatedAtMin: string | null;
  maxOrders?: number;
}): Promise<ShopifyOrder[]> {
  const { shopDomain, accessToken, updatedAtMin, maxOrders = 5000 } = args;
  const orders: ShopifyOrder[] = [];

  // Initial URL — Shopify's cursor pagination requires us to NOT pass filter params
  // on subsequent page_info requests, so we keep the first URL distinct.
  const params = new URLSearchParams({
    status: 'any',
    limit: String(PAGE_LIMIT),
  });
  if (updatedAtMin) params.set('updated_at_min', updatedAtMin);

  let url: string | null = `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/orders.json?${params.toString()}`;

  while (url && orders.length < maxOrders) {
    const response: Response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Shopify orders fetch failed (${response.status}): ${body.slice(0, 500)}`);
    }

    const data = await response.json() as { orders: ShopifyOrder[] };
    orders.push(...data.orders);

    url = parseNextLink(response.headers.get('link'));
  }

  return orders.slice(0, maxOrders);
}

function parseNextLink(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  // Shopify Link header format: <https://...page_info=xxx>; rel="next", <...>; rel="previous"
  const parts = linkHeader.split(',').map(s => s.trim());
  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

/**
 * Resolve attribution for a single order against visitors + audience_contacts
 * scoped to the given pixel/user. Email exact match takes priority over phone.
 * Returns the IDs to write into the conversions row.
 */
export async function resolveAttribution(args: {
  userId: string;
  pixelId: string;
  email: string | null;
  phone: string | null;
  orderedAt: string;
}): Promise<{
  matched_visitor_id: string | null;
  matched_contact_id: string | null;
  match_method: 'email' | 'phone' | 'unmatched';
  match_confidence: 'exact' | null;
  identified_before_order: boolean | null;
}> {
  const { userId, pixelId, email, phone, orderedAt } = args;

  if (email) {
    const lower = email.toLowerCase();

    // 1. Email exact on visitors (scoped to this pixel + user)
    const { data: visitor } = await supabaseAdmin
      .from('visitors')
      .select('id, identified_at')
      .eq('user_id', userId)
      .eq('pixel_id', pixelId)
      .eq('email', lower)
      .order('identified_at', { ascending: true, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (visitor) {
      const identifiedBefore = visitor.identified_at
        ? new Date(visitor.identified_at).getTime() <= new Date(orderedAt).getTime()
        : null;
      return {
        matched_visitor_id: visitor.id,
        matched_contact_id: await findContactByEmail(userId, lower),
        match_method: 'email',
        match_confidence: 'exact',
        identified_before_order: identifiedBefore,
      };
    }

    // 2. Email exact on audience_contacts (scoped to this user's audiences)
    const contactId = await findContactByEmail(userId, lower);
    if (contactId) {
      return {
        matched_visitor_id: null,
        matched_contact_id: contactId,
        match_method: 'email',
        match_confidence: 'exact',
        identified_before_order: null,
      };
    }
  }

  if (phone) {
    const e164 = formatPhoneE164(phone);

    // 3. Phone exact on visitors (phone lives in metadata JSONB)
    const { data: visitor } = await supabaseAdmin
      .from('visitors')
      .select('id, identified_at')
      .eq('user_id', userId)
      .eq('pixel_id', pixelId)
      .eq('metadata->>phone', e164)
      .limit(1)
      .maybeSingle();

    if (visitor) {
      const identifiedBefore = visitor.identified_at
        ? new Date(visitor.identified_at).getTime() <= new Date(orderedAt).getTime()
        : null;
      return {
        matched_visitor_id: visitor.id,
        matched_contact_id: null,
        match_method: 'phone',
        match_confidence: 'exact',
        identified_before_order: identifiedBefore,
      };
    }

    // 4. Phone exact on audience_contacts
    const contactId = await findContactByPhone(userId, e164);
    if (contactId) {
      return {
        matched_visitor_id: null,
        matched_contact_id: contactId,
        match_method: 'phone',
        match_confidence: 'exact',
        identified_before_order: null,
      };
    }
  }

  return {
    matched_visitor_id: null,
    matched_contact_id: null,
    match_method: 'unmatched',
    match_confidence: null,
    identified_before_order: null,
  };
}

async function findContactByEmail(userId: string, lowerEmail: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('find_audience_contact_by_email', {
    p_user_id: userId,
    p_email: lowerEmail,
  });
  if (error) throw new Error(`find_audience_contact_by_email failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0 ? data[0].id : null;
}

async function findContactByPhone(userId: string, e164Phone: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.rpc('find_audience_contact_by_phone', {
    p_user_id: userId,
    p_phone: e164Phone,
  });
  if (error) throw new Error(`find_audience_contact_by_phone failed: ${error.message}`);
  return Array.isArray(data) && data.length > 0 ? data[0].id : null;
}

/**
 * Map a Shopify order into the shape we store in conversions, then resolve
 * attribution and upsert. Returns the upserted row id + whether attribution matched.
 */
export async function upsertConversionFromShopifyOrder(args: {
  userId: string;
  pixelId: string;
  shopDomain: string;
  order: ShopifyOrder;
}): Promise<{ id: string; matched: boolean }> {
  const { userId, pixelId, shopDomain, order } = args;

  const email = (order.email || order.customer?.email || null)?.toLowerCase() ?? null;
  const phone = order.phone || order.customer?.phone || null;

  const attribution = await resolveAttribution({
    userId,
    pixelId,
    email,
    phone,
    orderedAt: order.created_at,
  });

  const row = {
    user_id: userId,
    pixel_id: pixelId,
    platform: 'shopify',
    external_order_id: String(order.id),
    external_order_number: order.name,
    order_url: `https://${shopDomain}/admin/orders/${order.id}`,
    customer_email: email,
    customer_phone: phone ? formatPhoneE164(phone) : null,
    customer_first_name: order.customer?.first_name ?? null,
    customer_last_name: order.customer?.last_name ?? null,
    total_price: parseFloat(order.total_price),
    subtotal_price: parseFloat(order.subtotal_price),
    currency: order.currency,
    financial_status: order.financial_status,
    fulfillment_status: order.fulfillment_status,
    ordered_at: order.created_at,
    updated_at_external: order.updated_at,
    ...attribution,
    raw: order as unknown as Record<string, unknown>,
    synced_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('conversions')
    .upsert(row, { onConflict: 'platform,external_order_id,user_id' })
    .select('id')
    .single();

  if (error) throw new Error(`upsert conversion failed: ${error.message}`);

  return {
    id: data.id,
    matched: attribution.match_method !== 'unmatched',
  };
}
