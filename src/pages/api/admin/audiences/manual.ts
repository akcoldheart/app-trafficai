import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import crypto from 'crypto';
import type { Json } from '@/lib/supabase/types';

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
    const { name, data, request_id, append_to_audience_id } = req.body;

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

    // Use provided audience ID (for appending) or generate a new one
    const audienceId = append_to_audience_id || `manual_${crypto.randomUUID()}`;

    // Normalize contacts - handle various field name formats and nested resolution object
    const normalizedContacts = contacts.map((contact, index) => {
      // Audiencelab.io may return data nested in 'resolution' object
      const resolution = (contact.resolution || contact.Resolution || {}) as Record<string, unknown>;

      // Merge top-level contact with resolution data (resolution takes priority for contact info)
      const merged = { ...contact, ...resolution };

      // Helper to get field value from multiple possible keys (treats empty strings as missing)
      const getField = (...keys: string[]): unknown => {
        for (const key of keys) {
          const val = merged[key];
          if (val !== undefined && val !== null && val !== '') {
            return val;
          }
        }
        return null;
      };

      const firstName = getField('FIRST_NAME', 'first_name', 'firstName', 'FirstName');
      const lastName = getField('LAST_NAME', 'last_name', 'lastName', 'LastName');

      // Build normalized object with standard field names
      // Prioritize audiencelab.io UPPERCASE fields first
      const normalized: Record<string, unknown> = {
        // Email: prefer verified emails, then business, then personal
        email: getField(
          'PERSONAL_VERIFIED_EMAILS', 'BUSINESS_VERIFIED_EMAILS', 'BUSINESS_EMAIL',
          'email', 'EMAIL', 'Email', 'PERSONAL_EMAILS'
        ),
        business_email: getField('BUSINESS_EMAIL', 'business_email'),
        verified_email: getField('PERSONAL_VERIFIED_EMAILS', 'BUSINESS_VERIFIED_EMAILS'),
        first_name: firstName,
        last_name: lastName,
        full_name: [firstName, lastName].filter(Boolean).join(' ') || null,
        // Company fields
        company: getField('COMPANY_NAME', 'company', 'COMPANY', 'Company', 'company_name'),
        company_domain: getField('COMPANY_DOMAIN', 'company_domain', 'website'),
        company_description: getField('COMPANY_DESCRIPTION', 'company_description'),
        company_revenue: getField('COMPANY_REVENUE', 'company_revenue', 'revenue'),
        company_phone: getField('COMPANY_PHONE', 'company_phone'),
        // Job fields
        job_title: getField('JOB_TITLE', 'title', 'job_title', 'jobTitle', 'JobTitle'),
        seniority: getField('SENIORITY_LEVEL', 'seniority', 'seniority_level'),
        department: getField('DEPARTMENT', 'department', 'Department'),
        // Contact fields
        phone: getField('MOBILE_PHONE', 'DIRECT_NUMBER', 'phone', 'PHONE', 'mobile_phone', 'PERSONAL_PHONE'),
        mobile_phone: getField('MOBILE_PHONE', 'mobile_phone'),
        direct_number: getField('DIRECT_NUMBER', 'direct_number'),
        linkedin_url: getField('LINKEDIN_URL', 'COMPANY_LINKEDIN_URL', 'linkedin_url', 'linkedinUrl'),
        // Location fields
        city: getField('CITY', 'PERSONAL_CITY', 'city', 'City', 'personal_city'),
        state: getField('STATE', 'PERSONAL_STATE', 'state', 'State', 'personal_state'),
        country: getField('COUNTRY', 'country', 'Country'),
        // Demographics
        gender: getField('GENDER', 'gender', 'Gender'),
        age_range: getField('AGE_RANGE', 'age_range', 'AgeRange'),
        income_range: getField('INCOME_RANGE', 'income_range', 'IncomeRange'),
        // Other fields
        url: getField('URL', 'url', 'page_url'),
        ip_address: getField('IP_ADDRESS', 'ip_address'),
        event_type: getField('EVENT_TYPE', 'event_type'),
        referrer_url: getField('REFERRER_URL', 'referrer_url'),
      };

      // Add remaining original fields that aren't already normalized (skip empty strings and duplicates)
      for (const [key, value] of Object.entries(merged)) {
        const lowerKey = key.toLowerCase();
        if (value !== '' && value !== null && value !== undefined && !normalized[lowerKey]) {
          normalized[lowerKey] = value;
        }
      }

      return normalized;
    });

    // Handle appending to an existing audience (for batched uploads)
    if (append_to_audience_id) {
      // Find the existing audience request by audience_id
      const { data: existingReq, error: findError } = await supabase
        .from('audience_requests')
        .select('id, form_data')
        .eq('audience_id', append_to_audience_id)
        .single();

      if (findError || !existingReq) {
        console.error('Error finding audience to append:', findError);
        return res.status(404).json({ error: 'Audience not found for appending' });
      }

      const existingFormData = existingReq.form_data as Record<string, unknown> || {};
      const existingAudience = (existingFormData.manual_audience || {}) as Record<string, unknown>;
      const existingContacts = (existingAudience.contacts || []) as Json[];
      const allContacts = [...existingContacts, ...(normalizedContacts as Json[])];

      const { error: updateError } = await supabase
        .from('audience_requests')
        .update({
          admin_notes: `Manual audience uploaded. ${allContacts.length} contacts.`,
          form_data: {
            ...existingFormData,
            manual_audience: {
              ...existingAudience,
              total_records: allContacts.length,
              contacts: allContacts,
            },
          } as Json,
        })
        .eq('id', existingReq.id);

      if (updateError) {
        console.error('Error appending to audience:', updateError);
        return res.status(500).json({ error: 'Failed to append contacts' });
      }

      return res.status(200).json({
        success: true,
        audience: {
          id: append_to_audience_id,
          name: name.trim(),
          total_records: allContacts.length,
        },
      });
    }

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
              contacts: normalizedContacts as Json[],
              uploaded_at: new Date().toISOString(),
              uploaded_by: authResult.user.id,
            },
          } as Json,
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
              contacts: normalizedContacts as Json[],
              uploaded_at: new Date().toISOString(),
              uploaded_by: authResult.user.id,
            },
          } as Json,
        });

      if (createError) {
        console.error('Error creating audience request:', createError);
        return res.status(500).json({ error: 'Failed to create audience' });
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

// Increase body size limit for large audience uploads (up to 10MB)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};
