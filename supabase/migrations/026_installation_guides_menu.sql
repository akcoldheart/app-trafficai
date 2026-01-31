-- Add Installation Guides menu item for admins (only if not exists)
INSERT INTO public.menu_items (name, href, icon, display_order, is_active, parent_id)
SELECT 'Installation Guides', '/admin/installation-guides', 'book', 85, true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items WHERE href = '/admin/installation-guides'
);

-- Grant permission to admin role (only if not exists)
INSERT INTO public.role_permissions (role_id, menu_item_id)
SELECT r.id, m.id
FROM public.roles r, public.menu_items m
WHERE r.name = 'admin'
  AND m.href = '/admin/installation-guides'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_permissions rp
    WHERE rp.role_id = r.id AND rp.menu_item_id = m.id
  );
