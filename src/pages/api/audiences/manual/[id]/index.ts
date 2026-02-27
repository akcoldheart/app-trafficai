import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getUserProfile, logAuditAction } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'DELETE') {
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
    // Get user's role to determine access level
    const profile = await getUserProfile(user.id, req, res);
    const isAdmin = profile.role === 'admin';

    // Find the audience request with this audience_id
    let query = supabase
      .from('audience_requests')
      .select('*')
      .eq('audience_id', id);

    // Non-admins can only see their own audiences
    if (!isAdmin) {
      query = query.eq('user_id', user.id);
    }

    const { data: request, error } = await query.single();

    if (error || !request) {
      return res.status(404).json({ error: 'Audience not found' });
    }

    // Handle DELETE request
    if (req.method === 'DELETE') {
      // Only admins can delete, or the owner
      if (!isAdmin && request.user_id !== user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this audience' });
      }

      // Delete contacts from audience_contacts table
      await supabaseAdmin
        .from('audience_contacts')
        .delete()
        .eq('audience_id', id);

      // Delete the audience request
      const { error: deleteError } = await supabase
        .from('audience_requests')
        .delete()
        .eq('id', request.id);

      if (deleteError) {
        console.error('Error deleting audience:', deleteError);
        return res.status(500).json({ error: 'Failed to delete audience' });
      }

      await logAuditAction(user.id, 'delete_manual_audience', req, res, 'audience', id);

      return res.status(200).json({ success: true });
    }

    // Handle GET request
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit as string) || 100));
    const exportAll = req.query.export === 'true';

    // Check audience_contacts table first (new storage)
    const { count: contactCount } = await supabaseAdmin
      .from('audience_contacts')
      .select('id', { count: 'exact', head: true })
      .eq('audience_id', id);

    if (contactCount && contactCount > 0) {
      // New storage: read from audience_contacts table with server-side pagination
      if (exportAll) {
        // Export: fetch all records in batches (Supabase limits to 1000 per query)
        const EXPORT_BATCH = 1000;
        const allContacts: Record<string, unknown>[] = [];

        for (let offset = 0; offset < contactCount; offset += EXPORT_BATCH) {
          const { data: batch, error: fetchError } = await supabaseAdmin
            .from('audience_contacts')
            .select('*')
            .eq('audience_id', id)
            .order('created_at', { ascending: true })
            .range(offset, offset + EXPORT_BATCH - 1);

          if (fetchError) {
            console.error(`Error fetching contacts at offset ${offset}:`, fetchError);
            break;
          }

          if (batch) {
            for (const row of batch) {
              allContacts.push(flattenContactRow(row));
            }
          }
        }

        return res.status(200).json({
          id: request.audience_id,
          name: request.name,
          total_records: contactCount,
          contacts: allContacts,
          page: 1,
          total_pages: 1,
          created_at: request.created_at,
          isManual: true,
        });
      }

      // Paginated fetch
      const offset = (page - 1) * limit;
      const { data: pageContacts, error: fetchError } = await supabaseAdmin
        .from('audience_contacts')
        .select('*')
        .eq('audience_id', id)
        .order('created_at', { ascending: true })
        .range(offset, offset + limit - 1);

      if (fetchError) {
        console.error('Error fetching contacts:', fetchError);
        return res.status(500).json({ error: 'Failed to fetch contacts' });
      }

      const contacts = (pageContacts || []).map(flattenContactRow);
      const totalPages = Math.ceil(contactCount / limit);

      return res.status(200).json({
        id: request.audience_id,
        name: request.name,
        total_records: contactCount,
        contacts,
        page,
        total_pages: totalPages,
        created_at: request.created_at,
        isManual: true,
      });
    }

    // Fallback: read from form_data.manual_audience.contacts (old storage)
    const formData = request.form_data as Record<string, unknown>;
    const manualAudience = formData?.manual_audience as Record<string, unknown>;

    if (!manualAudience) {
      return res.status(404).json({ error: 'Manual audience data not found' });
    }

    const contacts = (manualAudience.contacts || []) as Record<string, unknown>[];

    if (exportAll) {
      return res.status(200).json({
        id: request.audience_id,
        name: request.name,
        total_records: contacts.length,
        contacts,
        page: 1,
        total_pages: 1,
        created_at: request.created_at,
        uploaded_at: manualAudience.uploaded_at,
        isManual: true,
      });
    }

    // Client-side pagination for old data
    const totalPages = Math.ceil(contacts.length / limit);
    const offset = (page - 1) * limit;
    const pageContacts = contacts.slice(offset, offset + limit);

    return res.status(200).json({
      id: request.audience_id,
      name: request.name,
      total_records: contacts.length,
      contacts: pageContacts,
      page,
      total_pages: totalPages,
      created_at: request.created_at,
      uploaded_at: manualAudience.uploaded_at,
      isManual: true,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Flatten a audience_contacts row into a flat contact object
// Merges the known columns with the extra `data` JSONB field
function flattenContactRow(row: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, audience_id: _aid, created_at: _ca, data, ...knownFields } = row;
  const extraData = (data || {}) as Record<string, unknown>;

  // Merge known fields + extra data, stripping nulls
  const contact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries({ ...extraData, ...knownFields })) {
    if (value !== null && value !== undefined && value !== '') {
      contact[key] = value;
    }
  }
  return contact;
}
