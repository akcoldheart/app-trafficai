import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(supabaseUrl, supabaseServiceKey);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'User ID is required' });
  }

  const supabase = createClient(req, res);

  try {
    // Get current user to verify admin access
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if requesting user is admin
    const { data: adminUser } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single();

    if (adminUser?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    // Prevent admin from deleting themselves
    if (id === user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const serviceClient = getServiceClient();

    // Get user info before deletion for confirmation
    const { data: userToDelete } = await serviceClient
      .from('users')
      .select('email, role')
      .eq('id', id)
      .single();

    if (!userToDelete) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting other admin accounts (optional safety measure)
    if (userToDelete.role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin accounts. Demote to user first.' });
    }

    // Delete related data in order (due to foreign key constraints)
    // The cascade delete on auth.users should handle most of this,
    // but we'll be explicit for safety

    // 1. Delete pixel events (via pixels)
    const { data: userPixels } = await serviceClient
      .from('pixels')
      .select('id')
      .eq('user_id', id);

    if (userPixels && userPixels.length > 0) {
      const pixelIds = userPixels.map(p => p.id);

      // Delete visitors for these pixels
      await serviceClient
        .from('visitors')
        .delete()
        .in('pixel_id', pixelIds);

      // Delete pixel events
      await serviceClient
        .from('pixel_events')
        .delete()
        .in('pixel_id', pixelIds);
    }

    // 2. Delete user's pixels
    await serviceClient
      .from('pixels')
      .delete()
      .eq('user_id', id);

    // 3. Delete user's integrations
    await serviceClient
      .from('integrations')
      .delete()
      .eq('user_id', id);

    // 4. Delete user's API keys
    await serviceClient
      .from('user_api_keys')
      .delete()
      .eq('user_id', id);

    // 5. Delete user's websites
    await serviceClient
      .from('user_websites')
      .delete()
      .eq('user_id', id);

    // 6. Delete user's pixel requests
    await serviceClient
      .from('pixel_requests')
      .delete()
      .eq('user_id', id);

    // 7. Delete user's audience requests
    await serviceClient
      .from('audience_requests')
      .delete()
      .eq('user_id', id);

    // 8. Delete chat conversations and messages
    const { data: conversations } = await serviceClient
      .from('chat_conversations')
      .select('id')
      .eq('visitor_id', id);

    if (conversations && conversations.length > 0) {
      const convIds = conversations.map(c => c.id);
      await serviceClient
        .from('chat_messages')
        .delete()
        .in('conversation_id', convIds);

      await serviceClient
        .from('chat_conversations')
        .delete()
        .in('id', convIds);
    }

    // 9. Delete audit logs for this user
    await serviceClient
      .from('audit_logs')
      .delete()
      .eq('user_id', id);

    // 10. Delete the user profile from public.users
    await serviceClient
      .from('users')
      .delete()
      .eq('id', id);

    // 11. Finally, delete the auth user (this is the source of truth)
    const { error: authDeleteError } = await serviceClient.auth.admin.deleteUser(id);

    if (authDeleteError) {
      console.error('Error deleting auth user:', authDeleteError);
      return res.status(500).json({ error: 'Failed to delete user authentication record' });
    }

    return res.status(200).json({
      success: true,
      message: `User ${userToDelete.email} and all related data deleted successfully`
    });

  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
}
