import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole } from '@/lib/api-helpers';
import { createClient } from '@/lib/supabase/api';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Only admin can access menu items management
  const auth = await requireRole(req, res, 'admin');
  if (!auth) return;

  const supabase = createClient(req, res);

  if (req.method === 'GET') {
    try {
      // Fetch all menu items ordered by display_order
      const { data: menuItems, error } = await supabase
        .from('menu_items')
        .select('*')
        .order('display_order');

      if (error) throw error;

      return res.status(200).json({ menuItems: menuItems || [] });
    } catch (error) {
      console.error('Error fetching menu items:', error);
      return res.status(500).json({ error: 'Failed to fetch menu items' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
