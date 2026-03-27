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
    // Fetch explicit assignments from audience_assignments table
    const { data: assignments, error } = await supabaseAdmin
      .from('audience_assignments')
      .select('audience_id, user_id');

    if (error) {
      console.error('Error fetching assignments:', error);
      return res.status(500).json({ error: 'Failed to fetch assignments' });
    }

    // Group explicit assignments by audience_id
    const grouped: Record<string, { user_id: string; email: string }[]> = {};
    const explicitAudienceIds = new Set<string>();

    for (const row of (assignments || [])) {
      explicitAudienceIds.add(row.audience_id);
      if (!grouped[row.audience_id]) grouped[row.audience_id] = [];
      // email will be filled below
      grouped[row.audience_id].push({ user_id: row.user_id, email: '' });
    }

    // Find audiences that were explicitly unassigned via approved delete requests
    // These should NOT fall back to showing the original owner
    const { data: approvedRemovals } = await supabaseAdmin
      .from('audience_requests')
      .select('form_data')
      .eq('request_type', 'delete')
      .eq('status', 'approved');

    const unassignedAudienceIds = new Set<string>();
    for (const removal of (approvedRemovals || [])) {
      const fd = removal.form_data as Record<string, unknown>;
      if (fd?.audience_id) unassignedAudienceIds.add(fd.audience_id as string);
    }

    // Fetch implicit assignments from audience_requests (owner = user_id)
    // for manual audiences that don't have explicit assignments
    // Skip audiences that were explicitly unassigned
    const { data: audienceRequests } = await supabaseAdmin
      .from('audience_requests')
      .select('audience_id, user_id')
      .eq('status', 'approved')
      .not('audience_id', 'is', null)
      .neq('request_type', 'delete');

    for (const req of (audienceRequests || [])) {
      if (!req.audience_id || explicitAudienceIds.has(req.audience_id)) continue;
      if (unassignedAudienceIds.has(req.audience_id)) continue;
      // This audience has no explicit assignments and was never unassigned — use the request owner
      if (!grouped[req.audience_id]) grouped[req.audience_id] = [];
      grouped[req.audience_id].push({ user_id: req.user_id, email: '' });
    }

    // Fetch emails for all user IDs
    const allUserIds = new Set<string>();
    for (const entries of Object.values(grouped)) {
      for (const e of entries) allUserIds.add(e.user_id);
    }

    const emailMap: Record<string, string> = {};
    if (allUserIds.size > 0) {
      const { data: users } = await supabaseAdmin
        .from('users')
        .select('id, email')
        .in('id', Array.from(allUserIds));

      for (const u of (users || [])) {
        emailMap[u.id] = u.email;
      }
    }

    // Fill in emails
    for (const entries of Object.values(grouped)) {
      for (const e of entries) {
        e.email = emailMap[e.user_id] || 'Unknown';
      }
    }

    return res.status(200).json({ assignments: grouped });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
