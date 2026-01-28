-- Remove Audience Requests menu item (now merged into Audiences page)
DELETE FROM role_permissions WHERE menu_item_id IN (SELECT id FROM menu_items WHERE href = '/admin/audience-requests');
DELETE FROM menu_items WHERE href = '/admin/audience-requests';
