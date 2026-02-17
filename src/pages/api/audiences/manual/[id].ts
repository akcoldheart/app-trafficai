import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser, getUserProfile, logAuditAction } from '@/lib/api-helpers';

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

    // Handle GET request - Extract manual audience data from form_data
    const formData = request.form_data as Record<string, unknown>;
    const manualAudience = formData?.manual_audience as Record<string, unknown>;

    if (!manualAudience) {
      return res.status(404).json({ error: 'Manual audience data not found' });
    }

    const contacts = (manualAudience.contacts || []) as Record<string, unknown>[];

    return res.status(200).json({
      id: request.audience_id,
      name: request.name,
      total_records: contacts.length,
      contacts: contacts,
      created_at: request.created_at,
      uploaded_at: manualAudience.uploaded_at,
      isManual: true,
    });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
