import type { NextApiRequest, NextApiResponse } from 'next';
import { requireRole } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  try {
    // Fetch all assignments
    const { data: assignments, error } = await supabaseAdmin
      .from('audience_assignments')
      .select('audience_id, user_id');

    if (error) {
      console.error('Error fetching assignments:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments' });
    }

    if (!assignments || assignments.length === 0) {
      return res.status(200).json({ assignments: {} });
    }

    // Fetch emails from public.users table
    const userIds = Array.from(new Set(assignments.map(a => a.user_id)));
    const { data: users } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .in('id', userIds);

    const emailMap: Record<string, string> = {};
    for (const u of users || []) {
      emailMap[u.id] = u.email;
    }

    // Group by audience_id
    const grouped: Record<string, { user_id: string; email: string }[]> = {};
    for (const row of assignments) {
      const aid = row.audience_id;
      if (!grouped[aid]) grouped[aid] = [];
      grouped[aid].push({ user_id: row.user_id, email: emailMap[row.user_id] || 'Unknown' });
    }

    return res.status(200).json({ assignments: grouped });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
