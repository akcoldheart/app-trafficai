-- Add category and is_secret columns to existing app_settings table
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general',
ADD COLUMN IF NOT EXISTS is_secret BOOLEAN DEFAULT FALSE;

-- Create index for category lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_category ON app_settings(category);

-- Insert Stripe settings
INSERT INTO app_settings (key, value, description, category, is_secret) VALUES
  ('stripe_secret_key', '', 'Stripe Secret API Key (sk_live_xxx or sk_test_xxx)', 'stripe', TRUE),
  ('stripe_webhook_secret', '', 'Stripe Webhook Signing Secret (whsec_xxx)', 'stripe', TRUE),
  ('stripe_starter_monthly_price_id', '', 'Stripe Price ID for Starter Monthly Plan', 'stripe', FALSE),
  ('stripe_starter_yearly_price_id', '', 'Stripe Price ID for Starter Yearly Plan', 'stripe', FALSE),
  ('stripe_growth_monthly_price_id', '', 'Stripe Price ID for Growth Monthly Plan', 'stripe', FALSE),
  ('stripe_growth_yearly_price_id', '', 'Stripe Price ID for Growth Yearly Plan', 'stripe', FALSE),
  ('stripe_professional_monthly_price_id', '', 'Stripe Price ID for Professional Monthly Plan', 'stripe', FALSE),
  ('stripe_professional_yearly_price_id', '', 'Stripe Price ID for Professional Yearly Plan', 'stripe', FALSE),
  ('app_url', '', 'Application URL for redirects (e.g., https://app.trafficai.io)', 'general', FALSE),
  -- Plan pricing settings (yearly price = effective monthly rate when billed annually)
  ('plan_starter_monthly_price', '500', 'Starter Plan Monthly Price ($)', 'pricing', FALSE),
  ('plan_starter_yearly_price', '425', 'Starter Plan Annual Rate ($/mo) - effective monthly when billed yearly', 'pricing', FALSE),
  ('plan_starter_visitors', '3,000', 'Starter Plan Visitors Limit', 'pricing', FALSE),
  ('plan_growth_monthly_price', '800', 'Growth Plan Monthly Price ($)', 'pricing', FALSE),
  ('plan_growth_yearly_price', '680', 'Growth Plan Annual Rate ($/mo) - effective monthly when billed yearly', 'pricing', FALSE),
  ('plan_growth_visitors', '5,000', 'Growth Plan Visitors Limit', 'pricing', FALSE),
  ('plan_professional_monthly_price', '1200', 'Professional Plan Monthly Price ($)', 'pricing', FALSE),
  ('plan_professional_yearly_price', '1020', 'Professional Plan Annual Rate ($/mo) - effective monthly when billed yearly', 'pricing', FALSE),
  ('plan_professional_visitors', '10,000', 'Professional Plan Visitors Limit', 'pricing', FALSE)
ON CONFLICT (key) DO NOTHING;

-- Update existing settings to have proper category
UPDATE app_settings SET category = 'api' WHERE key IN ('api_base_url', 'api_endpoints') AND category = 'general';

-- Comment on new columns
COMMENT ON COLUMN app_settings.category IS 'Setting category: general, api, stripe, etc.';
COMMENT ON COLUMN app_settings.is_secret IS 'Whether this setting contains sensitive data that should be masked in UI';
