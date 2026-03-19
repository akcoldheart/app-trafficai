import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient } from '@supabase/supabase-js';
import { getIntegration, getVisitorsForSync, getAudienceContactsForSync } from '@/lib/integrations';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    try {
      const { data: campaigns, error } = await supabaseAdmin
        .from('linkedin_campaigns')
        .select(`
          *,
          linkedin_campaign_contacts(count)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get contact status counts for each campaign
      const campaignsWithStats = await Promise.all(
        (campaigns || []).map(async (campaign: any) => {
          const { data: statusCounts } = await supabaseAdmin
            .rpc('get_campaign_contact_counts', { campaign_uuid: campaign.id })
            .single();

          return {
            ...campaign,
            contact_stats: statusCounts || { total: 0, pending: 0, sent: 0, accepted: 0, declined: 0, error: 0 },
          };
        })
      );

      return res.status(200).json({ campaigns: campaignsWithStats });
    } catch (error) {
      console.error('Error fetching LinkedIn campaigns:', error);

      // Fallback without RPC
      try {
        const { data: campaigns } = await supabaseAdmin
          .from('linkedin_campaigns')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        return res.status(200).json({ campaigns: campaigns || [] });
      } catch (fallbackError) {
        return res.status(500).json({ error: 'Failed to fetch campaigns' });
      }
    }
  }

  if (req.method === 'POST') {
    const {
      name,
      source_pixel_id,
      source_audience_id,
      operating_hours_start = '09:00',
      operating_hours_end = '17:00',
      operating_timezone = 'America/New_York',
      daily_limit = 25,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Campaign name is required' });
    }
    if (!source_pixel_id && !source_audience_id) {
      return res.status(400).json({ error: 'Either source_pixel_id or source_audience_id is required' });
    }
    if (daily_limit > 30) {
      return res.status(400).json({ error: 'Daily limit cannot exceed 30' });
    }

    try {
      // Check LinkedIn integration
      const integration = await getIntegration(user.id, 'linkedin');

      if (!integration || !integration.is_connected) {
        return res.status(400).json({ error: 'No active LinkedIn account found. Connect your LinkedIn account first.' });
      }

      // Fetch contacts with LinkedIn URLs
      let contacts: { email?: string | null; linkedin_url?: string | null; full_name?: string | null; first_name?: string | null; last_name?: string | null }[];
      if (source_pixel_id) {
        contacts = await getVisitorsForSync(user.id, source_pixel_id);
      } else {
        contacts = await getAudienceContactsForSync(source_audience_id);
      }

      const linkedinContacts = contacts.filter(c => c.linkedin_url);

      if (linkedinContacts.length === 0) {
        return res.status(400).json({ error: 'No contacts with LinkedIn URLs found in the selected source' });
      }

      // Create campaign
      const { data: campaign, error: campaignError } = await supabaseAdmin
        .from('linkedin_campaigns')
        .insert({
          user_id: user.id,
          pixel_id: source_pixel_id || null,
          audience_id: source_audience_id || null,
          name,
          status: 'active',
          operating_hours_start,
          operating_hours_end,
          operating_timezone,
          daily_limit: Math.min(daily_limit, 30),
        })
        .select('*')
        .single();

      if (campaignError) throw campaignError;

      // Create campaign contacts in batches
      const contactRows = linkedinContacts.map(c => ({
        campaign_id: campaign.id,
        contact_email: c.email || null,
        linkedin_url: c.linkedin_url!,
        full_name: c.full_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
        status: 'pending',
      }));

      const batchSize = 200;
      for (let i = 0; i < contactRows.length; i += batchSize) {
        const batch = contactRows.slice(i, i + batchSize);
        await supabaseAdmin.from('linkedin_campaign_contacts').insert(batch);
      }

      return res.status(200).json({
        success: true,
        campaign,
        contact_count: linkedinContacts.length,
        message: `Campaign "${name}" created with ${linkedinContacts.length} contacts`,
      });
    } catch (error) {
      console.error('Error creating LinkedIn campaign:', error);
      const errMsg = (error as any)?.message || (error as any)?.details || 'Failed to create campaign';
      return res.status(500).json({ error: errMsg });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
