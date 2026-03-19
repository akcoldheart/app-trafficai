-- Migration: Facebook & LinkedIn integrations
-- Facebook and LinkedIn store their config in the existing platform_integrations table.
--   Facebook: api_key = access_token, config = { app_id, app_secret, ad_account_id, ad_account_name, token_expires_at, oauth_connected }
--   LinkedIn: config = { credentials: { email, password (encrypted) }, account_email, account_name }

-- Facebook audience imports
CREATE TABLE IF NOT EXISTS facebook_audience_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  audience_id text, -- FB custom audience ID
  audience_name text NOT NULL,
  source_pixel_id uuid REFERENCES pixels(id) ON DELETE SET NULL,
  source_audience_id uuid,
  contact_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE facebook_audience_imports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own facebook imports"
  ON facebook_audience_imports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- LinkedIn campaigns
CREATE TABLE IF NOT EXISTS linkedin_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pixel_id uuid REFERENCES pixels(id) ON DELETE SET NULL,
  audience_id uuid,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed')),
  operating_hours_start text NOT NULL DEFAULT '09:00',
  operating_hours_end text NOT NULL DEFAULT '17:00',
  operating_timezone text NOT NULL DEFAULT 'America/New_York',
  daily_limit integer NOT NULL DEFAULT 25,
  total_sent integer NOT NULL DEFAULT 0,
  total_accepted integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE linkedin_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own linkedin campaigns"
  ON linkedin_campaigns FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- LinkedIn campaign contacts
CREATE TABLE IF NOT EXISTS linkedin_campaign_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES linkedin_campaigns(id) ON DELETE CASCADE,
  contact_email text,
  linkedin_url text,
  full_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted', 'declined', 'error')),
  sent_at timestamptz,
  responded_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE linkedin_campaign_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own linkedin campaign contacts"
  ON linkedin_campaign_contacts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM linkedin_campaigns
      WHERE linkedin_campaigns.id = linkedin_campaign_contacts.campaign_id
      AND linkedin_campaigns.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM linkedin_campaigns
      WHERE linkedin_campaigns.id = linkedin_campaign_contacts.campaign_id
      AND linkedin_campaigns.user_id = auth.uid()
    )
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_facebook_audience_imports_user_id ON facebook_audience_imports(user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_campaigns_user_id ON linkedin_campaigns(user_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_campaigns_status ON linkedin_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_linkedin_campaign_contacts_campaign_id ON linkedin_campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_linkedin_campaign_contacts_status ON linkedin_campaign_contacts(status);
