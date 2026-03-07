-- Klaviyo integration table for per-user Klaviyo connections
CREATE TABLE klaviyo_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  api_key TEXT NOT NULL,
  default_list_id TEXT,
  default_list_name TEXT,
  auto_sync_visitors BOOLEAN DEFAULT false,
  auto_sync_pixel_id TEXT,
  is_connected BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_klaviyo_integrations_user_id ON klaviyo_integrations(user_id);

-- RLS policies
ALTER TABLE klaviyo_integrations ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own integration
CREATE POLICY "Users can view own klaviyo integration"
  ON klaviyo_integrations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own klaviyo integration"
  ON klaviyo_integrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own klaviyo integration"
  ON klaviyo_integrations FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own klaviyo integration"
  ON klaviyo_integrations FOR DELETE
  USING (auth.uid() = user_id);

-- Admins can view all integrations
CREATE POLICY "Admins can view all klaviyo integrations"
  ON klaviyo_integrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid() AND r.name = 'admin'
    )
  );

-- Add Integrations menu item
INSERT INTO menu_items (name, href, icon, display_order, is_active)
VALUES ('Integrations', '/integrations', 'IconPlug', 45, true)
ON CONFLICT DO NOTHING;

-- Assign Integrations menu item to all roles
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, mi.id
FROM roles r, menu_items mi
WHERE mi.href = '/integrations'
ON CONFLICT DO NOTHING;
