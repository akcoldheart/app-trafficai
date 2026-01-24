-- Remove Pixel Requests menu item (now merged into Pixel Creation page)
DELETE FROM role_permissions WHERE menu_item_id IN (SELECT id FROM menu_items WHERE href = '/admin/pixel-requests');
DELETE FROM menu_items WHERE href = '/admin/pixel-requests';
