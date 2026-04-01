import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getUserProfile } from '@/lib/api-helpers';

export const config = {
  maxDuration: 300,
};

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const EXPORT_COLUMNS = [
  'full_name', 'email', 'phone', 'company', 'job_title', 'city', 'state', 'country',
  'lead_score', 'total_pageviews', 'total_sessions', 'total_clicks',
  'form_submissions', 'first_seen_at', 'last_seen_at', 'is_identified', 'is_enriched',
];

function formatColumnName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const profile = await getUserProfile(user.id, req, res);
    const isAdmin = profile.role === 'admin';

    const {
      pixel_id,
      sort = 'last_seen_at',
      order = 'desc',
      identified_only,
      enriched_only,
      min_score,
      search,
    } = req.query;

    // First get total count
    let countQuery = supabaseAdmin
      .from('visitors')
      .select('id', { count: 'exact', head: true });

    if (!isAdmin) {
      countQuery = countQuery.eq('user_id', user.id);
    }
    if (pixel_id) {
      countQuery = countQuery.eq('pixel_id', Array.isArray(pixel_id) ? pixel_id[0] : pixel_id);
    }
    if (identified_only === 'true') {
      countQuery = countQuery.eq('is_identified', true);
    }
    if (enriched_only === 'true') {
      countQuery = countQuery.eq('is_enriched', true);
    }
    if (min_score) {
      const minScoreStr = Array.isArray(min_score) ? min_score[0] : min_score;
      countQuery = countQuery.gte('lead_score', parseInt(minScoreStr, 10));
    }
    if (search) {
      const searchStr = Array.isArray(search) ? search[0] : search;
      const searchTerm = `%${searchStr}%`;
      countQuery = countQuery.or(`email.ilike.${searchTerm},full_name.ilike.${searchTerm},company.ilike.${searchTerm}`);
    }

    const { count: totalCount } = await countQuery;

    if (!totalCount || totalCount === 0) {
      return res.status(400).json({ error: 'No visitors to export' });
    }

    // Fetch in batches of 1000
    const BATCH = 1000;
    const allVisitors: Record<string, unknown>[] = [];
    const sortStr = Array.isArray(sort) ? sort[0] : sort;
    const sortField = ['last_seen_at', 'first_seen_at', 'lead_score', 'total_pageviews', 'email', 'created_at'].includes(sortStr)
      ? sortStr
      : 'last_seen_at';
    const ascending = (Array.isArray(order) ? order[0] : order) === 'asc';

    for (let offset = 0; offset < totalCount; offset += BATCH) {
      let query = supabaseAdmin
        .from('visitors')
        .select('*')
        .order(sortField, { ascending })
        .range(offset, offset + BATCH - 1);

      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }
      if (pixel_id) {
        query = query.eq('pixel_id', Array.isArray(pixel_id) ? pixel_id[0] : pixel_id);
      }
      if (identified_only === 'true') {
        query = query.eq('is_identified', true);
      }
      if (enriched_only === 'true') {
        query = query.eq('is_enriched', true);
      }
      if (min_score) {
        const minScoreStr = Array.isArray(min_score) ? min_score[0] : min_score;
        query = query.gte('lead_score', parseInt(minScoreStr, 10));
      }
      if (search) {
        const searchStr = Array.isArray(search) ? search[0] : search;
        const searchTerm = `%${searchStr}%`;
        query = query.or(`email.ilike.${searchTerm},full_name.ilike.${searchTerm},company.ilike.${searchTerm}`);
      }

      const { data: batch } = await query;
      if (batch) {
        allVisitors.push(...batch);
      }
    }

    // Build CSV
    const headerRow = ['"S.No."', ...EXPORT_COLUMNS.map(c => escapeCsvValue(formatColumnName(c)))].join(',');
    const dataRows = allVisitors.map((visitor, i) => {
      const values = EXPORT_COLUMNS.map((col) => {
        if (col === 'phone') {
          const metadata = visitor.metadata as Record<string, string> | null;
          return escapeCsvValue(metadata?.phone);
        }
        return escapeCsvValue(visitor[col]);
      });
      return [`"${i + 1}"`, ...values].join(',');
    });

    const csv = [headerRow, ...dataRows].join('\n');
    const filename = `visitors_export_${new Date().toISOString().split('T')[0]}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
