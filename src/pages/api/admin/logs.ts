import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireRole } from '@/lib/api-helpers';

const getServiceClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createServiceClient(supabaseUrl, supabaseServiceKey);
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only admins can access logs
  const authResult = await requireRole(req, res, 'admin');
  if (!authResult) return;

  const supabase = getServiceClient();

  try {
    if (req.method === 'GET') {
      const { type, status, limit = '100', offset = '0', search } = req.query;

      let query = supabase
        .from('system_logs')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

      // Filter by type
      if (type && type !== 'all') {
        query = query.eq('type', type);
      }

      // Filter by status
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      // Search in event_name or message
      if (search) {
        query = query.or(`event_name.ilike.%${search}%,message.ilike.%${search}%`);
      }

      const { data, error, count } = await query;

      if (error) {
        // If table doesn't exist, return empty array
        if (error.code === '42P01') {
          return res.status(200).json({ logs: [], total: 0, message: 'Logs table not created yet' });
        }
        console.error('Error fetching logs:', error);
        return res.status(500).json({ error: 'Failed to fetch logs' });
      }

      // Fetch user details for logs that have user_id
      const logsWithUsers = await Promise.all(
        (data || []).map(async (log) => {
          if (log.user_id) {
            const { data: userData } = await supabase
              .from('users')
              .select('email, name')
              .eq('id', log.user_id)
              .single();

            return {
              ...log,
              user_email: userData?.email || null,
              user_name: userData?.name || null,
            };
          }
          return log;
        })
      );

      return res.status(200).json({ logs: logsWithUsers, total: count || 0 });
    }

    if (req.method === 'DELETE') {
      const { id, clearAll, olderThan } = req.body;

      if (clearAll) {
        // Clear all logs
        const { error } = await supabase
          .from('system_logs')
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

        if (error) {
          console.error('Error clearing logs:', error);
          return res.status(500).json({ error: 'Failed to clear logs' });
        }

        return res.status(200).json({ success: true, message: 'All logs cleared' });
      }

      if (olderThan) {
        // Clear logs older than specified days
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - parseInt(olderThan));

        const { error } = await supabase
          .from('system_logs')
          .delete()
          .lt('created_at', cutoffDate.toISOString());

        if (error) {
          console.error('Error clearing old logs:', error);
          return res.status(500).json({ error: 'Failed to clear old logs' });
        }

        return res.status(200).json({ success: true, message: `Logs older than ${olderThan} days cleared` });
      }

      if (id) {
        // Delete single log
        const { error } = await supabase
          .from('system_logs')
          .delete()
          .eq('id', id);

        if (error) {
          console.error('Error deleting log:', error);
          return res.status(500).json({ error: 'Failed to delete log' });
        }

        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Missing id, clearAll, or olderThan parameter' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Logs API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
