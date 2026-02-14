-- Add "System Logs" menu item for admin
INSERT INTO menu_items (name, href, icon, display_order) VALUES
  ('System Logs', '/admin/logs', 'IconWebhook', 95)
ON CONFLICT DO NOTHING;

-- Assign permission to Admin role only
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id
FROM roles r
CROSS JOIN menu_items m
WHERE r.name = 'admin'
  AND m.href = '/admin/logs'
ON CONFLICT (role_id, menu_item_id) DO NOTHING;
