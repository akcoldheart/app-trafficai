-- Migration: Conversion attribution
-- Stores e-commerce orders pulled from connected platforms (Shopify first; designed
-- to extend to WooCommerce/BigCommerce/Stripe) and links each order to the visitor
-- or audience contact that generated it. Conversion stats power the dashboard
-- "Revenue Attributed" / "Conversion Rate" cards.

-- 1. Per-pixel sync tracking (mirrors the visitors_api_* columns from migration 035)
ALTER TABLE public.pixels
  ADD COLUMN IF NOT EXISTS orders_last_fetched_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS orders_last_fetch_status TEXT DEFAULT NULL;

-- 2. Conversions table
CREATE TABLE IF NOT EXISTS public.conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  pixel_id UUID NOT NULL REFERENCES public.pixels(id) ON DELETE CASCADE,

  -- Source platform
  platform TEXT NOT NULL,                -- 'shopify' | 'woocommerce' | 'bigcommerce' | 'stripe'
  external_order_id TEXT NOT NULL,       -- Shopify order id (numeric string)
  external_order_number TEXT,            -- Human-readable e.g. "#1234"
  order_url TEXT,                        -- Deep link to platform admin

  -- Customer (lowercased / normalized for matching)
  customer_email TEXT,
  customer_phone TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,

  -- Order financials
  total_price NUMERIC(12, 2),
  subtotal_price NUMERIC(12, 2),
  currency TEXT,
  financial_status TEXT,                 -- paid | pending | refunded | partially_refunded
  fulfillment_status TEXT,               -- fulfilled | partial | unfulfilled | null

  -- Order timestamps (from the platform, not us)
  ordered_at TIMESTAMPTZ NOT NULL,
  updated_at_external TIMESTAMPTZ,       -- Used as the high-water mark for incremental sync

  -- Attribution (resolved at sync time, re-resolved nightly to catch late identifications)
  matched_visitor_id UUID REFERENCES public.visitors(id) ON DELETE SET NULL,
  matched_contact_id UUID REFERENCES public.audience_contacts(id) ON DELETE SET NULL,
  match_method TEXT,                     -- 'email' | 'phone' | 'unmatched'
  match_confidence TEXT,                 -- 'exact' | 'fuzzy'
  identified_before_order BOOLEAN,       -- TRUE when visitor.identified_at <= ordered_at

  -- Raw payload for re-processing without re-fetching
  raw JSONB,

  -- Our timestamps
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One row per platform order per user (lets multiple users connect the same shop)
  UNIQUE (platform, external_order_id, user_id)
);

-- Indexes for the queries the dashboard + conversions page will run
CREATE INDEX IF NOT EXISTS idx_conversions_user_ordered_at
  ON public.conversions (user_id, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversions_pixel_ordered_at
  ON public.conversions (pixel_id, ordered_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversions_matched_visitor
  ON public.conversions (matched_visitor_id) WHERE matched_visitor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversions_matched_contact
  ON public.conversions (matched_contact_id) WHERE matched_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversions_email
  ON public.conversions (customer_email) WHERE customer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversions_updated_external
  ON public.conversions (pixel_id, updated_at_external DESC) WHERE updated_at_external IS NOT NULL;

-- updated_at trigger
CREATE TRIGGER update_conversions_updated_at
  BEFORE UPDATE ON public.conversions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own conversions"
  ON public.conversions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all conversions"
  ON public.conversions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Service role handles writes (sync endpoints + cron run as service role)
CREATE POLICY "Service role manages conversions"
  ON public.conversions FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.conversions TO authenticated;
GRANT ALL ON public.conversions TO service_role;

COMMENT ON TABLE public.conversions IS 'E-commerce orders pulled from connected platforms, attributed to identified visitors / audience contacts';
COMMENT ON COLUMN public.conversions.match_method IS 'How the order was attributed: email exact, phone exact, or unmatched';
COMMENT ON COLUMN public.conversions.identified_before_order IS 'TRUE only when the visitor was identified BEFORE the order was placed (strict attribution)';
COMMENT ON COLUMN public.conversions.raw IS 'Full platform payload — kept so attribution rules can be re-run without re-fetching';

-- 3. Helper functions: look up an audience contact scoped to a user
-- audience_contacts.audience_id is a TEXT FK that points at either an audience the
-- user owns (audience_requests) or one assigned to them (audience_assignments).
CREATE OR REPLACE FUNCTION public.find_audience_contact_by_email(p_user_id UUID, p_email TEXT)
RETURNS TABLE (id UUID) AS $$
  SELECT ac.id
  FROM public.audience_contacts ac
  WHERE lower(ac.email) = lower(p_email)
    AND (
      ac.audience_id IN (SELECT id::text FROM public.audience_requests WHERE user_id = p_user_id)
      OR ac.audience_id IN (SELECT audience_id FROM public.audience_assignments WHERE user_id = p_user_id)
    )
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.find_audience_contact_by_phone(p_user_id UUID, p_phone TEXT)
RETURNS TABLE (id UUID) AS $$
  SELECT ac.id
  FROM public.audience_contacts ac
  WHERE ac.phone = p_phone
    AND (
      ac.audience_id IN (SELECT id::text FROM public.audience_requests WHERE user_id = p_user_id)
      OR ac.audience_id IN (SELECT audience_id FROM public.audience_assignments WHERE user_id = p_user_id)
    )
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.find_audience_contact_by_email(UUID, TEXT) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.find_audience_contact_by_phone(UUID, TEXT) TO service_role, authenticated;
