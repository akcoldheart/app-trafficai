import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);

  try {
    if (req.method === 'GET') {
      const {
        pixel_id,
        page = '1',
        limit = '50',
        sort = 'last_seen_at',
        order = 'desc',
        identified_only,
        enriched_only,
        min_score,
        search,
      } = req.query;

      const pageNum = parseInt(Array.isArray(page) ? page[0] : page, 10);
      const limitNum = Math.min(parseInt(Array.isArray(limit) ? limit[0] : limit, 10), 100);
      const offset = (pageNum - 1) * limitNum;

      // Build query
      let query = supabase
        .from('visitors')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id);

      // Filter by pixel
      if (pixel_id) {
        const pixelIdStr = Array.isArray(pixel_id) ? pixel_id[0] : pixel_id;
        query = query.eq('pixel_id', pixelIdStr);
      }

      // Filter by identification status
      const identifiedOnlyStr = Array.isArray(identified_only) ? identified_only[0] : identified_only;
      if (identifiedOnlyStr === 'true') {
        query = query.eq('is_identified', true);
      }

      // Filter by enrichment status
      const enrichedOnlyStr = Array.isArray(enriched_only) ? enriched_only[0] : enriched_only;
      if (enrichedOnlyStr === 'true') {
        query = query.eq('is_enriched', true);
      }

      // Filter by minimum lead score
      if (min_score) {
        const minScoreStr = Array.isArray(min_score) ? min_score[0] : min_score;
        query = query.gte('lead_score', parseInt(minScoreStr, 10));
      }

      // Search by email, name, or company
      if (search) {
        const searchStr = Array.isArray(search) ? search[0] : search;
        const searchTerm = `%${searchStr}%`;
        query = query.or(`email.ilike.${searchTerm},full_name.ilike.${searchTerm},company.ilike.${searchTerm}`);
      }

      // Sorting
      const sortStr = Array.isArray(sort) ? sort[0] : sort;
      const sortField = ['last_seen_at', 'first_seen_at', 'lead_score', 'total_pageviews', 'email', 'created_at'].includes(sortStr)
        ? sortStr
        : 'last_seen_at';
      const orderStr = Array.isArray(order) ? order[0] : order;
      const ascending = orderStr === 'asc';
      query = query.order(sortField, { ascending });

      // Pagination
      query = query.range(offset, offset + limitNum - 1);

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching visitors:', error);
        return res.status(500).json({ error: 'Failed to fetch visitors' });
      }

      return res.status(200).json({
        visitors: data || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / limitNum),
        },
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
