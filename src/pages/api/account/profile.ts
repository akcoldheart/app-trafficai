import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// Service role client for bypassing RLS on user's own profile
const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(supabaseUrl, supabaseServiceKey);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Require authentication
  const supabase = createClient(req, res);
  const user = await getAuthenticatedUser(req, res);

  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = user.id;
  const serviceClient = getServiceClient();

  try {
    if (req.method === 'GET') {
      // Get current user profile
      const { data, error } = await serviceClient
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return res.status(500).json({ error: 'Failed to fetch profile' });
      }

      return res.status(200).json({ profile: data });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const { full_name, phone, company } = req.body;

      // Build update data - only include fields that exist
      const updateData: Record<string, string | null> = {
        updated_at: new Date().toISOString(),
      };

      if (full_name !== undefined) {
        updateData.full_name = full_name || null;
      }
      if (phone !== undefined) {
        updateData.phone = phone || null;
      }
      if (company !== undefined) {
        updateData.company = company || null;
      }

      // Use service client to bypass RLS
      const { data, error } = await serviceClient
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('Error updating profile:', error);
        return res.status(500).json({ error: 'Failed to update profile' });
      }

      // Also update Supabase auth metadata if full_name changed
      if (full_name !== undefined) {
        try {
          await serviceClient.auth.admin.updateUserById(userId, {
            user_metadata: { full_name },
          });
        } catch (authError) {
          console.error('Error updating auth metadata:', authError);
          // Don't fail the request if auth update fails
        }
      }

      return res.status(200).json({ profile: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
