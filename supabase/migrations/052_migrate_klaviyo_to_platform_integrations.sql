-- Migrate existing klaviyo_integrations data into platform_integrations
INSERT INTO platform_integrations (user_id, platform, api_key, config, is_connected, last_synced_at, created_at, updated_at)
SELECT
  user_id,
  'klaviyo',
  api_key,
  jsonb_build_object(
    'default_list_id', default_list_id,
    'default_list_name', default_list_name,
    'auto_sync_visitors', auto_sync_visitors,
    'auto_sync_pixel_id', auto_sync_pixel_id
  ),
  is_connected,
  last_synced_at,
  created_at,
  updated_at
FROM klaviyo_integrations
ON CONFLICT (user_id, platform) DO UPDATE SET
  api_key = EXCLUDED.api_key,
  config = EXCLUDED.config,
  is_connected = EXCLUDED.is_connected,
  last_synced_at = EXCLUDED.last_synced_at,
  updated_at = EXCLUDED.updated_at;

-- Drop the old table
DROP TABLE klaviyo_integrations;
