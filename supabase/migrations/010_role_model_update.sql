-- Role Model Update Migration
-- Adds 'user' role, migrates partner users, adds admin request management menu items

-- First, add 'user' to the user_role enum type
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';

-- Add 'user' role to roles table
INSERT INTO roles (name, description, is_system) VALUES
  ('user', 'Standard user with access to submit requests and view own data', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Migrate partner users to user role (update role_id first)
UPDATE users SET role_id = (SELECT id FROM roles WHERE name = 'user')
WHERE role_id = (SELECT id FROM roles WHERE name = 'partner');

-- Update legacy role enum field for partner users
-- Note: This requires the enum to have 'user' value added first (done above)
UPDATE users SET role = 'user' WHERE role = 'partner';

-- Add new admin menu items for request management
INSERT INTO menu_items (name, href, icon, display_order) VALUES
  ('Pixel Requests', '/admin/pixel-requests', 'IconFileDescription', 115),
  ('Audience Requests', '/admin/audience-requests', 'IconFileDescription', 116)
ON CONFLICT DO NOTHING;

-- Assign admin-only request management permissions
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id FROM roles r, menu_items m
WHERE r.name = 'admin' AND m.href IN ('/admin/pixel-requests', '/admin/audience-requests')
ON CONFLICT (role_id, menu_item_id) DO NOTHING;

-- Assign permissions for 'user' role (same as partner but with new pages)
-- First remove any existing user permissions
DELETE FROM role_permissions WHERE role_id = (SELECT id FROM roles WHERE name = 'user');

-- Assign user permissions: dashboard, pixels, audiences, settings
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id FROM roles r, menu_items m
WHERE r.name = 'user' AND m.href IN (
  '/',
  '/pixels',
  '/audiences',
  '/audiences/create',
  '/audiences/custom',
  '/settings'
)
ON CONFLICT (role_id, menu_item_id) DO NOTHING;

-- Update team role to have request management access too (if admin wants to delegate)
-- Team already has most permissions, just ensure they don't have admin-only menus
