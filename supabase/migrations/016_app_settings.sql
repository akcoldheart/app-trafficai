-- App Settings table for admin-managed configuration
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO app_settings (key, value, description) VALUES
  ('api_base_url', 'https://v3-api-job-72802495918.us-east1.run.app', 'Traffic AI API Base URL'),
  ('api_endpoints', '[{"path":"/audiences","description":"Manage audiences"},{"path":"/audiences/custom","description":"Custom audiences"},{"path":"/audiences/attributes/{attr}","description":"Get attributes"},{"path":"/enrich","description":"Contact enrichment"},{"path":"/user/credits","description":"Check credits"}]', 'Available API endpoints (JSON array)')
ON CONFLICT (key) DO NOTHING;

-- RLS policies
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can read app settings
CREATE POLICY "Admins can read app settings" ON app_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Only admins can update app settings
CREATE POLICY "Admins can update app settings" ON app_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Only admins can insert app settings
CREATE POLICY "Admins can insert app settings" ON app_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );

-- Only admins can delete app settings
CREATE POLICY "Admins can delete app settings" ON app_settings
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.role = 'admin'
    )
  );
