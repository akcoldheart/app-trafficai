import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Campaign ID is required' });
  }

  // Verify ownership
  const { data: campaign } = await supabaseAdmin
    .from('linkedin_campaigns')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!campaign) {
    return res.status(404).json({ error: 'Campaign not found' });
  }

  if (req.method === 'GET') {
    try {
      const { data: contacts } = await supabaseAdmin
        .from('linkedin_campaign_contacts')
        .select('*')
        .eq('campaign_id', id)
        .order('created_at', { ascending: true })
        .limit(500);

      const statusCounts = (contacts || []).reduce((acc: Record<string, number>, c: any) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
      }, {});

      return res.status(200).json({
        campaign,
        contacts: contacts || [],
        stats: {
          total: contacts?.length || 0,
          ...statusCounts,
        },
      });
    } catch (error) {
      console.error('Error fetching campaign detail:', error);
      return res.status(500).json({ error: 'Failed to fetch campaign' });
    }
  }

  if (req.method === 'PUT') {
    const { status, operating_hours_start, operating_hours_end, operating_timezone, daily_limit } = req.body;
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (status && ['active', 'paused', 'completed'].includes(status)) updates.status = status;
    if (operating_hours_start) updates.operating_hours_start = operating_hours_start;
    if (operating_hours_end) updates.operating_hours_end = operating_hours_end;
    if (operating_timezone) updates.operating_timezone = operating_timezone;
    if (daily_limit !== undefined) updates.daily_limit = Math.min(daily_limit, 30);
    if (req.body.connection_message !== undefined) updates.connection_message = req.body.connection_message;

    try {
      const { data, error } = await supabaseAdmin
        .from('linkedin_campaigns')
        .update(updates)
        .eq('id', id)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (error) throw error;
      return res.status(200).json({ campaign: data });
    } catch (error) {
      console.error('Error updating campaign:', error);
      return res.status(500).json({ error: 'Failed to update campaign' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      await supabaseAdmin
        .from('linkedin_campaigns')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      return res.status(200).json({ success: true, message: 'Campaign deleted' });
    } catch (error) {
      console.error('Error deleting campaign:', error);
      return res.status(500).json({ error: 'Failed to delete campaign' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
