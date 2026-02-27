import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole, logAuditAction } from '@/lib/api-helpers';
import crypto from 'crypto';
import type { Json } from '@/lib/supabase/types';

// Service role client to bypass RLS
const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

// Known columns in the audience_contacts table
const KNOWN_COLUMNS = [
  'email', 'full_name', 'first_name', 'last_name', 'company',
  'job_title', 'phone', 'city', 'state', 'country',
  'linkedin_url', 'seniority', 'department',
];

// Convert a normalized contact into a row for the audience_contacts table
function contactToRow(audienceId: string, contact: Record<string, unknown>) {
  const row: Record<string, unknown> = { audience_id: audienceId };
  const extraData: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(contact)) {
    if (KNOWN_COLUMNS.includes(key)) {
      row[key] = typeof value === 'string' ? value : String(value);
    } else {
      extraData[key] = value;
    }
  }

  row.data = extraData;
  return row;
}

// Insert contacts into audience_contacts in batches of 200
async function insertContactsBatch(audienceId: string, contacts: Record<string, unknown>[]) {
  const BATCH_SIZE = 200;
  let inserted = 0;

  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    const rows = batch.map(c => contactToRow(audienceId, c));

    const { error } = await supabaseAdmin
      .from('audience_contacts')
      .insert(rows);

    if (error) {
      console.error(`[Manual] Error inserting batch at offset ${i}:`, error);
    } else {
      inserted += batch.length;
    }
  }

  return inserted;
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

    // Normalize contacts
    const normalizedContacts = contacts.map((contact) => {
      const resolution = (contact.resolution || contact.Resolution || {}) as Record<string, unknown>;
      const merged = { ...contact, ...resolution };

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

      const normalized: Record<string, unknown> = {
        email: getField(
          'PERSONAL_VERIFIED_EMAILS', 'BUSINESS_VERIFIED_EMAILS', 'BUSINESS_EMAIL',
          'email', 'EMAIL', 'Email', 'PERSONAL_EMAILS'
        ),
        business_email: getField('BUSINESS_EMAIL', 'business_email'),
        verified_email: getField('PERSONAL_VERIFIED_EMAILS', 'BUSINESS_VERIFIED_EMAILS'),
        first_name: firstName,
        last_name: lastName,
        full_name: [firstName, lastName].filter(Boolean).join(' ') || null,
        company: getField('COMPANY_NAME', 'company', 'COMPANY', 'Company', 'company_name'),
        company_domain: getField('COMPANY_DOMAIN', 'company_domain', 'website'),
        company_description: getField('COMPANY_DESCRIPTION', 'company_description'),
        company_revenue: getField('COMPANY_REVENUE', 'company_revenue', 'revenue'),
        company_phone: getField('COMPANY_PHONE', 'company_phone'),
        job_title: getField('JOB_TITLE', 'title', 'job_title', 'jobTitle', 'JobTitle'),
        seniority: getField('SENIORITY_LEVEL', 'seniority', 'seniority_level'),
        department: getField('DEPARTMENT', 'department', 'Department'),
        phone: getField('MOBILE_PHONE', 'DIRECT_NUMBER', 'phone', 'PHONE', 'mobile_phone', 'PERSONAL_PHONE'),
        mobile_phone: getField('MOBILE_PHONE', 'mobile_phone'),
        direct_number: getField('DIRECT_NUMBER', 'direct_number'),
        linkedin_url: getField('LINKEDIN_URL', 'COMPANY_LINKEDIN_URL', 'linkedin_url', 'linkedinUrl'),
        city: getField('CITY', 'PERSONAL_CITY', 'city', 'City', 'personal_city'),
        state: getField('STATE', 'PERSONAL_STATE', 'state', 'State', 'personal_state'),
        country: getField('COUNTRY', 'country', 'Country'),
        gender: getField('GENDER', 'gender', 'Gender'),
        age_range: getField('AGE_RANGE', 'age_range', 'AgeRange'),
        income_range: getField('INCOME_RANGE', 'income_range', 'IncomeRange'),
        url: getField('URL', 'url', 'page_url'),
        ip_address: getField('IP_ADDRESS', 'ip_address'),
        event_type: getField('EVENT_TYPE', 'event_type'),
        referrer_url: getField('REFERRER_URL', 'referrer_url'),
      };

      // Strip null values
      for (const key of Object.keys(normalized)) {
        if (normalized[key] === null) delete normalized[key];
      }

      // Add remaining original fields not already normalized
      for (const [key, value] of Object.entries(merged)) {
        const lowerKey = key.toLowerCase();
        if (value !== '' && value !== null && value !== undefined && !normalized[lowerKey]) {
          normalized[lowerKey] = value;
        }
      }

      return normalized;
    });

    // Insert contacts into audience_contacts table
    const inserted = await insertContactsBatch(audienceId, normalizedContacts);
    console.log(`[Manual] Inserted ${inserted} contacts for audience ${audienceId}`);

    // Handle appending to an existing audience
    if (append_to_audience_id) {
      const { data: existingReq, error: findError } = await supabase
        .from('audience_requests')
        .select('id, form_data')
        .eq('audience_id', append_to_audience_id)
        .single();

      if (findError || !existingReq) {
        console.error('Error finding audience to append:', findError);
        return res.status(404).json({ error: 'Audience not found for appending' });
      }

      // Count total contacts in the table for this audience
      const { count } = await supabaseAdmin
        .from('audience_contacts')
        .select('id', { count: 'exact', head: true })
        .eq('audience_id', append_to_audience_id);

      const totalCount = count || inserted;

      const existingFormData = existingReq.form_data as Record<string, unknown> || {};
      const existingAudience = (existingFormData.manual_audience || {}) as Record<string, unknown>;

      await supabase
        .from('audience_requests')
        .update({
          admin_notes: `Manual audience uploaded. ${totalCount} contacts.`,
          form_data: {
            ...existingFormData,
            manual_audience: {
              ...existingAudience,
              total_records: totalCount,
            },
          } as Json,
        })
        .eq('id', existingReq.id);

      return res.status(200).json({
        success: true,
        audience: {
          id: append_to_audience_id,
          name: name.trim(),
          total_records: totalCount,
        },
      });
    }

    // If linked to a request, update it with the audience metadata
    if (request_id) {
      const { data: existingRequest, error: fetchError } = await supabase
        .from('audience_requests')
        .select('form_data, user_id')
        .eq('id', request_id)
        .single();

      if (fetchError) {
        console.error('Error fetching request:', fetchError);
        return res.status(404).json({ error: 'Request not found' });
      }

      const { error: requestError } = await supabase
        .from('audience_requests')
        .update({
          status: 'approved',
          audience_id: audienceId,
          reviewed_by: authResult.user.id,
          reviewed_at: new Date().toISOString(),
          admin_notes: `Manual audience uploaded. ${inserted} contacts.`,
          form_data: {
            ...(existingRequest.form_data as Record<string, unknown> || {}),
            manual_audience: {
              id: audienceId,
              name: name.trim(),
              total_records: inserted,
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
          admin_notes: `Manual audience created. ${inserted} contacts.`,
          form_data: {
            manual_audience: {
              id: audienceId,
              name: name.trim(),
              total_records: inserted,
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
      { contacts_count: inserted, request_id }
    );

    return res.status(200).json({
      success: true,
      audience: {
        id: audienceId,
        name: name.trim(),
        total_records: inserted,
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
