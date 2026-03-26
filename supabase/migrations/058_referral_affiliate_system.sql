-- Migration: 058_referral_affiliate_system
-- Description: Robust referral/affiliate system with tracking, attribution, and commission management
-- Date: 2026-03-26

-- 1. Referral codes table - each user gets a unique shareable code
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  is_custom BOOLEAN DEFAULT false,
  commission_rate NUMERIC(5,2) DEFAULT 20.00,
  cookie_duration_days INTEGER DEFAULT 30,
  is_active BOOLEAN DEFAULT true,
  total_clicks INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referral_codes_code_lower ON referral_codes(LOWER(code));

ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referral code"
  ON referral_codes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to referral_codes"
  ON referral_codes FOR ALL
  USING (auth.role() = 'service_role');

-- 2. Referrals table - tracks each referred signup and conversion lifecycle
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referral_code_id UUID NOT NULL REFERENCES public.referral_codes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','signed_up','converted','churned')),
  referred_email TEXT,
  signed_up_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  stripe_subscription_id TEXT,
  plan_id TEXT,
  monthly_revenue NUMERIC(10,2) DEFAULT 0,
  commission_rate NUMERIC(5,2),
  commission_amount NUMERIC(10,2) DEFAULT 0,
  attribution_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referred_unique ON referrals(referred_user_id) WHERE referred_user_id IS NOT NULL;

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_user_id);

CREATE POLICY "Service role has full access to referrals"
  ON referrals FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Referral payouts table - tracks commission payouts to affiliates
CREATE TABLE IF NOT EXISTS public.referral_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','paid','failed')),
  payout_method TEXT,
  payout_reference TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_payouts_user ON referral_payouts(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_payouts_status ON referral_payouts(status);

ALTER TABLE referral_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own payouts"
  ON referral_payouts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role has full access to referral_payouts"
  ON referral_payouts FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Add referred_by column to users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.users(id);

-- 5. Add menu items for referral pages
INSERT INTO menu_items (name, href, icon, display_order)
VALUES ('Referrals', '/account/referrals', 'IconUsersGroup', 85)
ON CONFLICT DO NOTHING;

INSERT INTO menu_items (name, href, icon, display_order)
VALUES ('Referrals (Admin)', '/admin/referrals', 'IconUsersGroup', 75)
ON CONFLICT DO NOTHING;
