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

    // Log sample of incoming data for debugging
    console.log('Manual audience - Sample contact (first):', JSON.stringify(contacts[0], null, 2));
    console.log('Manual audience - Total contacts received:', contacts.length);

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

      const firstName = getField('first_name', 'firstName', 'FIRST_NAME', 'FirstName');
      const lastName = getField('last_name', 'lastName', 'LAST_NAME', 'LastName');

      // Build normalized object with standard field names
      const normalized: Record<string, unknown> = {
        email: getField('email', 'EMAIL', 'Email', 'PERSONAL_EMAILS', 'BUSINESS_EMAIL'),
        first_name: firstName,
        last_name: lastName,
        full_name: [firstName, lastName].filter(Boolean).join(' ') || null,
        company: getField('company', 'COMPANY', 'Company', 'COMPANY_NAME', 'company_name'),
        job_title: getField('title', 'job_title', 'jobTitle', 'JOB_TITLE', 'JobTitle'),
        linkedin_url: getField('linkedin_url', 'linkedinUrl', 'LINKEDIN_URL', 'COMPANY_LINKEDIN_URL'),
        phone: getField('phone', 'PHONE', 'mobile_phone', 'MOBILE_PHONE', 'PERSONAL_PHONE', 'DIRECT_NUMBER'),
        city: getField('city', 'CITY', 'City', 'PERSONAL_CITY', 'personal_city'),
        state: getField('state', 'STATE', 'State', 'PERSONAL_STATE', 'personal_state'),
        country: getField('country', 'COUNTRY', 'Country'),
        gender: getField('gender', 'GENDER', 'Gender'),
        age_range: getField('age_range', 'AGE_RANGE', 'AgeRange'),
        income_range: getField('income_range', 'INCOME_RANGE', 'IncomeRange'),
        seniority: getField('seniority', 'SENIORITY_LEVEL', 'seniority_level'),
        department: getField('department', 'DEPARTMENT', 'Department'),
        url: getField('url', 'URL', 'page_url'),
        ip_address: getField('ip_address', 'IP_ADDRESS'),
        event_type: getField('event_type', 'EVENT_TYPE'),
        referrer_url: getField('referrer_url', 'REFERRER_URL'),
      };

      // Add remaining original fields that aren't already normalized (skip empty strings and duplicates)
      for (const [key, value] of Object.entries(merged)) {
        const lowerKey = key.toLowerCase();
        if (value !== '' && value !== null && value !== undefined && !normalized[lowerKey]) {
          normalized[lowerKey] = value;
        }
      }

      // Log first normalized contact for debugging
      if (index === 0) {
        console.log('Manual audience - Normalized contact (first):', JSON.stringify(normalized, null, 2));
      }

      return normalized;
    });

    // Log summary
    console.log('Manual audience - Normalized contacts count:', normalizedContacts.length);

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
