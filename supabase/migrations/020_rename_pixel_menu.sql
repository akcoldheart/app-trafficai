-- Rename "Pixel Creation" to "Pixels" in the sidebar menu
UPDATE menu_items
SET name = 'Pixels'
WHERE name = 'Pixel Creation' AND href = '/pixels';
