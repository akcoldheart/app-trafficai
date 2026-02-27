import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getUserProfile } from '@/lib/api-helpers';

export const config = {
  maxDuration: 120,
};

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Priority columns for export ordering
const EXPORT_PRIORITY = [
  'full_name', 'first_name', 'last_name', 'email', 'verified_email',
  'business_email', 'company', 'job_title', 'seniority', 'department',
  'phone', 'mobile_phone', 'direct_number', 'city', 'state',
  'country', 'gender', 'age_range', 'income_range', 'linkedin_url',
  'company_domain', 'company_description', 'company_revenue', 'company_phone',
];

function formatColumnName(name: string) {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
}

function flattenContactRow(row: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, audience_id: _aid, created_at: _ca, data, ...knownFields } = row;
  const extraData = (data || {}) as Record<string, unknown>;
  const contact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...extraData, ...knownFields })) {
    if (value !== null && value !== undefined && value !== '') {
      contact[key] = value;
    }
  }
  return contact;
}

function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  return `"${String(value).replace(/"/g, '""')}"`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Audience ID is required' });
  }

  const supabase = createClient(req, res);

  try {
    const profile = await getUserProfile(user.id, req, res);
    const isAdmin = profile.role === 'admin';

    let query = supabase
      .from('audience_requests')
      .select('audience_id, name, form_data')
      .eq('audience_id', id);

    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { data: request, error } = await query.single();
    if (error || !request) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    const audienceName = request.name || 'Audience';

    // Check audience_contacts table first (new storage)
    const { count: contactCount } = await supabaseAdmin
      .from('audience_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('audience_id', id);

    let allContacts: Record<string, unknown>[] = [];

    if (contactCount && contactCount > 0) {
      // Fetch in batches of 1000
      const BATCH = 1000;
      for (let offset = 0; offset < contactCount; offset += BATCH) {
        const { data: batch } = await supabaseAdmin
          .from('audience_contacts')
          .select('*')
          .eq('audience_id', id)
          .order('created_at', { ascending: true })
          .range(offset, offset + BATCH - 1);

        if (batch) {
          for (const row of batch) {
            allContacts.push(flattenContactRow(row));
          }
        }
      }
    } else {
      // Fallback: old JSON storage
      const formData = request.form_data as Record<string, unknown>;
      const manualAudience = formData?.manual_audience as Record<string, unknown>;
      allContacts = (manualAudience?.contacts || []) as Record<string, unknown>[];
    }

    if (allContacts.length === 0) {
      return res.status(400).json({ error: 'No data to export' });
    }

    // Collect all columns
    const allColumns = new Set<string>();
    allContacts.forEach((r) => Object.keys(r).forEach((k) => allColumns.add(k)));
    allColumns.delete('uuid');

    const sortedColumns = Array.from(allColumns).sort((a, b) => {
      const ai = EXPORT_PRIORITY.indexOf(a);
      const bi = EXPORT_PRIORITY.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    });

    // Build CSV
    const headerRow = ['"S.No."', ...sortedColumns.map(c => escapeCsvValue(formatColumnName(c)))].join(',');
    const dataRows = allContacts.map((record, i) => {
      const values = sortedColumns.map(col => escapeCsvValue(record[col]));
      return [`"${i + 1}"`, ...values].join(',');
    });

    const csv = [headerRow, ...dataRows].join('\n');

    const filename = `${audienceName.replace(/[^a-z0-9]/gi, '_')}_export.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.status(200).send(csv);
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
