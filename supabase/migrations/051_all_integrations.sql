-- Generic platform integrations table for all non-Klaviyo integrations
CREATE TABLE platform_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL, -- 'hubspot', 'slack', 'zapier', 'salesforce', 'shopify', 'mailchimp', 'pipedrive', 'activecampaign'
  api_key TEXT,
  webhook_url TEXT,
  config JSONB DEFAULT '{}',
  is_connected BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE INDEX idx_platform_integrations_user_platform ON platform_integrations(user_id, platform);

-- RLS policies
ALTER TABLE platform_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own platform integrations"
  ON platform_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own platform integrations"
  ON platform_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own platform integrations"
  ON platform_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own platform integrations"
  ON platform_integrations FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all platform integrations"
  ON platform_integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );
