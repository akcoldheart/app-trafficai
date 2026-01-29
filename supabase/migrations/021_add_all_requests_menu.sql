-- Add "All Requests" menu item for admin
INSERT INTO menu_items (name, href, icon, display_order) VALUES
  ('All Requests', '/admin/requests', 'IconFileDescription', 105)
ON CONFLICT DO NOTHING;

-- Assign permission to Admin role only
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id
FROM roles r
CROSS JOIN menu_items m
WHERE r.name = 'admin'
  AND m.href = '/admin/requests'
ON CONFLICT (role_id, menu_item_id) DO NOTHING;
