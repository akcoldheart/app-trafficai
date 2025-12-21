-- RBAC Seed Data Migration
-- Inserts default roles, menu items, and permissions

-- Insert default system roles
INSERT INTO roles (name, description, is_system) VALUES
  ('admin', 'Full system administrator with access to all features', TRUE),
  ('team', 'Team member with access to all features except partner-specific menus', TRUE),
  ('partner', 'Partner with access only to partner dashboard', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Insert menu items (based on current Sidebar.tsx)
INSERT INTO menu_items (name, href, icon, display_order) VALUES
  ('Dashboard', '/', 'IconChartDots3', 10),
  ('Pixel Creation', '/pixels', 'IconCode', 20),
  ('Visitors', '/visitors', 'IconEye', 30),
  ('Audiences', '/audiences', 'IconUsers', 40),
  ('Create Audience', '/audiences/create', 'IconUserPlus', 50),
  ('Custom Audience', '/audiences/custom', 'IconUserQuestion', 60),
  ('Contact Enrichment', '/enrich', 'IconSearch', 70),
  ('Messages', '/chat', 'IconMessage', 80),
  ('Auto Replies', '/chat/auto-replies', 'IconRobot', 90),
  ('Settings', '/settings', 'IconSettings', 100),
  ('Admin Users', '/admin/users', 'IconShieldCheck', 110),
  ('Manage Roles', '/admin/roles', 'IconLock', 120),
  ('Partner Dashboard', '/partner/dashboard', 'IconLayoutDashboard', 130)
ON CONFLICT DO NOTHING;

-- Assign ALL permissions to Admin role
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id
FROM roles r
CROSS JOIN menu_items m
WHERE r.name = 'admin'
ON CONFLICT (role_id, menu_item_id) DO NOTHING;

-- Assign permissions to Team role (all except partner dashboard and admin-only menus)
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id
FROM roles r
CROSS JOIN menu_items m
WHERE r.name = 'team'
  AND m.href NOT IN ('/partner/dashboard', '/admin/users', '/admin/roles')
ON CONFLICT (role_id, menu_item_id) DO NOTHING;

-- Assign permissions to Partner role (only partner dashboard)
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id
FROM roles r
CROSS JOIN menu_items m
WHERE r.name = 'partner'
  AND m.href = '/partner/dashboard'
ON CONFLICT (role_id, menu_item_id) DO NOTHING;

-- Migrate existing users from string role to role_id
-- This updates users who still have the old role column but no role_id
-- Cast the enum to text for comparison with varchar
UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = users.role::text)
WHERE role_id IS NULL AND role IS NOT NULL;

-- For any users without a role, default to 'team'
UPDATE users
SET role_id = (SELECT id FROM roles WHERE name = 'team')
WHERE role_id IS NULL;
