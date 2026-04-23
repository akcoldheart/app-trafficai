import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser, getEffectiveUserId } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Campaign ID is required' });
  }

  // Verify ownership
  const { data: campaign } = await supabaseAdmin
    .from('linkedin_campaigns')
    .select('*')
    .eq('id', id)
    .eq('user_id', effectiveUserId)
    .single();

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (req.method === 'GET') {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(req.query.page_size as string) || 50));
      const statusFilter = req.query.status as string || '';
      const search = (req.query.search as string || '').trim();
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      // Get total counts by status (always unfiltered for the stats bar)
      const { data: allContacts } = await supabaseAdmin
        .from('linkedin_campaign_contacts')
        .select('status')
        .eq('campaign_id', id);

      const statusCounts: Record<string, number> = { total: 0, pending: 0, sent: 0, accepted: 0, declined: 0, error: 0 };
      for (const c of (allContacts || [])) {
        statusCounts.total++;
        if (c.status in statusCounts) statusCounts[c.status as keyof typeof statusCounts]++;
      }

      // Build filtered + paginated query
      let query = supabaseAdmin
        .from('linkedin_campaign_contacts')
        .select('*', { count: 'exact' })
        .eq('campaign_id', id);

      if (statusFilter && ['pending', 'sent', 'accepted', 'declined', 'error'].includes(statusFilter)) {
        query = query.eq('status', statusFilter);
      }

      if (search) {
        query = query.or(`full_name.ilike.%${search}%,contact_email.ilike.%${search}%,linkedin_url.ilike.%${search}%`);
      }

      const { data: contacts, count } = await query
        .order('created_at', { ascending: true })
        .range(from, to);

      return res.status(200).json({
        campaign,
        contacts: contacts || [],
        stats: statusCounts,
        pagination: {
          page,
          page_size: pageSize,
          total: count || 0,
          total_pages: Math.ceil((count || 0) / pageSize),
        },
      });
    } catch (error) {
      console.error('Error fetching campaign detail:', error);
      return res.status(500).json({ error: 'Failed to fetch campaign' });
    }
  }

  if (req.method === 'PUT') {
    const { name, status, operating_hours_start, operating_hours_end, operating_timezone, daily_limit } = req.body;
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (typeof name === 'string' && name.trim()) updates.name = name.trim();
    if (status && ['active', 'paused', 'completed'].includes(status)) updates.status = status;
    if (operating_hours_start) updates.operating_hours_start = operating_hours_start;
    if (operating_hours_end) updates.operating_hours_end = operating_hours_end;
    if (operating_timezone) updates.operating_timezone = operating_timezone;
    if (daily_limit !== undefined) updates.daily_limit = Math.min(Math.max(1, parseInt(String(daily_limit)) || 1), 30);
    if (req.body.connection_message !== undefined) updates.connection_message = req.body.connection_message;

    try {
      const { data, error } = await supabaseAdmin
        .from('linkedin_campaigns')
        .update(updates)
        .eq('id', id)
        .eq('user_id', effectiveUserId)
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ campaign: data });
    } catch (error) {
      console.error('Error updating campaign:', error);
      return res.status(500).json({ error: 'Failed to update campaign' });
    }
  }

  if (req.method === 'PATCH') {
    // Retry failed contacts - reset error status back to pending
    const { action, contact_id } = req.body;

    if (action !== 'retry') {
      return res.status(400).json({ error: 'Invalid action' });
    }

    try {
      const query = supabaseAdmin
        .from('linkedin_campaign_contacts')
        .update({ status: 'pending', error_message: null, sent_at: null })
        .eq('campaign_id', id)
        .eq('status', 'error');

      // If contact_id provided, retry single contact; otherwise retry all errors
      if (contact_id) {
        query.eq('id', contact_id);
      }

      const { data, error } = await query.select('id');
      if (error) throw error;

      const count = data?.length || 0;
      return res.status(200).json({
        success: true,
        message: `${count} contact${count !== 1 ? 's' : ''} reset to pending`,
        count,
      });
    } catch (error) {
      console.error('Error retrying contacts:', error);
      return res.status(500).json({ error: 'Failed to retry contacts' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await supabaseAdmin
        .from('linkedin_campaigns')
        .delete()
        .eq('id', id)
        .eq('user_id', effectiveUserId);

      return res.status(200).json({ success: true, message: 'Campaign deleted' });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      return res.status(500).json({ error: 'Failed to delete campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
