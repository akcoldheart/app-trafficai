-- Migration: Remove Partner Dashboard route
-- The /partner/dashboard page is deprecated. All users should use the main Dashboard at /

-- 1. Remove all role_permissions that point to the Partner Dashboard menu item
DELETE FROM role_permissions
WHERE menu_item_id = (SELECT id FROM menu_items WHERE href = '/partner/dashboard');

-- 2. Deactivate the Partner Dashboard menu item
UPDATE menu_items SET is_active = false WHERE href = '/partner/dashboard';

-- 3. Ensure the 'user' role has access to the main Dashboard (/)
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id FROM roles r, menu_items m
WHERE r.name = 'user' AND m.href = '/'
ON CONFLICT (role_id, menu_item_id) DO NOTHING;

-- 4. Ensure the 'partner' role (if any users still have it) also gets main Dashboard
INSERT INTO role_permissions (role_id, menu_item_id)
SELECT r.id, m.id FROM roles r, menu_items m
WHERE r.name = 'partner' AND m.href = '/'
ON CONFLICT (role_id, menu_item_id) DO NOTHING;

-- 5. Migrate any remaining users with 'partner' role to 'user' role
UPDATE users
SET role = 'user',
    role_id = (SELECT id FROM roles WHERE name = 'user')
WHERE role = 'partner';
