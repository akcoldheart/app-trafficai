import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import crypto from 'crypto';

interface AudienceContact {
  email?: string;
  first_name?: string;
  firstName?: string;
  last_name?: string;
  lastName?: string;
  company?: string;
  title?: string;
  job_title?: string;
  jobTitle?: string;
  linkedin_url?: string;
  linkedinUrl?: string;
  phone?: string;
  mobile_phone?: string;
  city?: string;
  state?: string;
  country?: string;
  [key: string]: unknown;
}

interface AudienceData {
  contacts?: AudienceContact[];
  Data?: AudienceContact[];
  data?: AudienceContact[];
  records?: AudienceContact[];
  [key: string]: unknown;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Only admins can create manual audiences
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const supabase = createClient(req, res);

  try {
    const { name, data, request_id } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Audience name is required' });
    }

    if (!data) {
      return res.status(400).json({ error: 'Audience data is required' });
    }

    // Extract contacts from various formats
    let contacts: AudienceContact[] = [];

    if (Array.isArray(data)) {
      contacts = data;
    } else if (typeof data === 'object') {
      const audienceData = data as AudienceData;
      contacts = audienceData.contacts ||
                 audienceData.Data ||
                 audienceData.data ||
                 audienceData.records ||
                 [];
    }

    if (contacts.length === 0) {
      return res.status(400).json({
        error: 'No contacts found in data. Expected array or object with contacts/Data/data/records property.'
      });
    }

    // Generate a local audience ID for manual audiences
    const audienceId = `manual_${crypto.randomUUID()}`;

    // Normalize contacts
    const normalizedContacts = contacts.map((contact) => ({
      email: contact.email || null,
      first_name: contact.first_name || contact.firstName || null,
      last_name: contact.last_name || contact.lastName || null,
      full_name: [contact.first_name || contact.firstName, contact.last_name || contact.lastName]
        .filter(Boolean).join(' ') || null,
      company: contact.company || null,
      job_title: contact.title || contact.job_title || contact.jobTitle || null,
      linkedin_url: contact.linkedin_url || contact.linkedinUrl || null,
      phone: contact.phone || contact.mobile_phone || null,
      city: contact.city || null,
      state: contact.state || null,
      country: contact.country || null,
    }));

    // If linked to a request, update it with the audience data
    if (request_id) {
      // Get the existing request to preserve form_data
      const { data: existingRequest, error: fetchError } = await supabase
        .from('audience_requests')
        .select('form_data, user_id')
        .eq('id', request_id)
        .single();

      if (fetchError) {
        console.error('Error fetching request:', fetchError);
        return res.status(404).json({ error: 'Request not found' });
      }

      // Update the request with audience data
      const { error: requestError } = await supabase
        .from('audience_requests')
        .update({
          status: 'approved',
          audience_id: audienceId,
          reviewed_by: authResult.user.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: `Manual audience uploaded. ${normalizedContacts.length} contacts.`,
          form_data: {
            ...(existingRequest.form_data as Record<string, unknown> || {}),
            manual_audience: {
              id: audienceId,
              name: name.trim(),
              total_records: normalizedContacts.length,
              contacts: normalizedContacts,
              uploaded_at: new Date().toISOString(),
              uploaded_by: authResult.user.id,
            },
          },
        })
        .eq('id', request_id);

      if (requestError) {
        console.error('Error updating request:', requestError);
        return res.status(500).json({ error: 'Failed to update request' });
      }
    } else {
      // Create a new audience request to store the manual audience
      const { error: createError } = await supabase
        .from('audience_requests')
        .insert({
          user_id: authResult.user.id,
          request_type: 'standard',
          name: name.trim(),
          status: 'approved',
          audience_id: audienceId,
          reviewed_by: authResult.user.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: `Manual audience created. ${normalizedContacts.length} contacts.`,
          form_data: {
            manual_audience: {
              id: audienceId,
              name: name.trim(),
              total_records: normalizedContacts.length,
              contacts: normalizedContacts,
              uploaded_at: new Date().toISOString(),
              uploaded_by: authResult.user.id,
            },
          },
        });

      if (createError) {
        console.error('Error creating audience request:', createError);
        return res.status(500).json({ error: 'Failed to create audience: ' + createError.message });
      }
    }

    // Log audit action
    await logAuditAction(
      authResult.user.id,
      'create_manual_audience',
      req,
      res,
      'audience',
      audienceId,
      { contacts_count: normalizedContacts.length, request_id }
    );

    return res.status(200).json({
      success: true,
      audience: {
        id: audienceId,
        name: name.trim(),
        total_records: normalizedContacts.length,
      },
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
