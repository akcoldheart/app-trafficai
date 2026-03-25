-- RingCentral SMS Templates (per-pixel message templates with filter config)
CREATE TABLE IF NOT EXISTS ringcentral_sms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pixel_id UUID NOT NULL REFERENCES pixels(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Template',
  message_template TEXT NOT NULL DEFAULT 'Hi {first_name}, thanks for visiting! Reply STOP to opt out.',
  is_active BOOLEAN NOT NULL DEFAULT true,
  filters JSONB NOT NULL DEFAULT '{"new_visitors_only": true, "frequency_cap_hours": 24, "time_window_start": "09:00", "time_window_end": "18:00", "time_window_tz": "America/New_York", "min_lead_score": 0}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active template per pixel
CREATE UNIQUE INDEX IF NOT EXISTS idx_ringcentral_sms_templates_pixel ON ringcentral_sms_templates(pixel_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_ringcentral_sms_templates_user ON ringcentral_sms_templates(user_id);

ALTER TABLE ringcentral_sms_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own SMS templates"
  ON ringcentral_sms_templates FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- RingCentral SMS Log (every SMS sent — dedup + user visibility)
CREATE TABLE IF NOT EXISTS ringcentral_sms_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pixel_id UUID NOT NULL REFERENCES pixels(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  from_number TEXT NOT NULL,
  message_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'delivered', 'failed')),
  ringcentral_message_id TEXT,
  error_message TEXT,
  sent_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Dedup: at most one SMS per visitor per pixel per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_ringcentral_sms_log_dedup
  ON ringcentral_sms_log(pixel_id, visitor_id, sent_date);

CREATE INDEX IF NOT EXISTS idx_ringcentral_sms_log_user ON ringcentral_sms_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ringcentral_sms_log_status ON ringcentral_sms_log(status);

ALTER TABLE ringcentral_sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own SMS logs"
  ON ringcentral_sms_log FOR SELECT
  USING (auth.uid() = user_id);

-- Google Ads Audience Imports (mirrors facebook_audience_imports)
CREATE TABLE IF NOT EXISTS google_ads_audience_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_list_id TEXT,
  user_list_name TEXT NOT NULL,
  source_pixel_id UUID REFERENCES pixels(id) ON DELETE SET NULL,
  source_audience_id TEXT,
  contact_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_audience_imports_user ON google_ads_audience_imports(user_id, created_at DESC);

ALTER TABLE google_ads_audience_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Google Ads audience imports"
  ON google_ads_audience_imports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Google Ads Conversion Uploads
CREATE TABLE IF NOT EXISTS google_ads_conversion_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversion_action_id TEXT NOT NULL,
  conversion_action_name TEXT NOT NULL,
  source_pixel_id UUID REFERENCES pixels(id) ON DELETE SET NULL,
  source_audience_id TEXT,
  conversion_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_ads_conversion_uploads_user ON google_ads_conversion_uploads(user_id, created_at DESC);

ALTER TABLE google_ads_conversion_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Google Ads conversion uploads"
  ON google_ads_conversion_uploads FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
