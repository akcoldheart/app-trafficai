import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Returns actual contact counts from audience_contacts table.
 * GET /api/audiences/manual/counts?ids=manual_abc,manual_def
 * Returns: { counts: { "manual_abc": 1234, "manual_def": 567 } }
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const idsParam = req.query.ids as string;
  if (!idsParam) {
    return res.status(400).json({ error: 'ids parameter required' });
  }

  const ids = idsParam.split(',').filter(Boolean);
  if (ids.length === 0) {
    return res.status(200).json({ counts: {} });
  }

  const counts: Record<string, number> = {};

  // Use a raw RPC or loop — Supabase JS doesn't support GROUP BY,
  // so we batch count queries (still fast with the index on audience_id)
  await Promise.all(
    ids.map(async (audienceId) => {
      const { count } = await supabaseAdmin
        .from('audience_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('audience_id', audienceId);
      counts[audienceId] = count || 0;
    })
  );

  return res.status(200).json({ counts });
}
