import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getAuthenticatedUser, getUserProfile, logAuditAction, getEffectiveUserId, checkIsAdmin } from '@/lib/api-helpers';

const supabaseAdmin = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Default pixel limits per plan (overridable via app_settings pixel_limit_{plan})
const DEFAULT_PIXEL_LIMITS: Record<string, number> = {
  trial: 1,
  starter: 3,
  growth: 5,
  professional: 10,
  enterprise: 50,
};

function generatePixelCode(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let code = 'px_';
  for (let i = 0; i < 16; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  const supabase = createClient(req, res);
  const effectiveUserId = await getEffectiveUserId(user.id);
  const profile = await getUserProfile(user.id, req, res);
  const isAdmin = await checkIsAdmin(profile);

  try {
    if (req.method === 'GET') {
      // Admins see all pixels, users see only their own
      let query = supabase
        .from('pixels')
        .select('*, user:users!pixels_user_id_fkey(email)')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('user_id', effectiveUserId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching pixels:', error);
        return res.status(500).json({ error: 'Failed to fetch pixels' });
      }

      return res.status(200).json({ pixels: data || [] });
    }

    if (req.method === 'POST') {
      // Create new pixel
      const { name, domain } = req.body;

      if (!name || !domain) {
        return res.status(400).json({ error: 'Name and domain are required' });
      }

      // Enforce pixel limit per plan (admins bypass)
      if (!isAdmin) {
        // Get user's current plan
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('plan')
          .eq('id', effectiveUserId)
          .single();
        const userPlan = userData?.plan || 'trial';

        // Check app_settings for custom limit, fall back to defaults
        const { data: limitSetting } = await supabaseAdmin
          .from('app_settings')
          .select('value')
          .eq('key', `pixel_limit_${userPlan}`)
          .single();

        const maxPixels = limitSetting ? parseInt(limitSetting.value, 10) : (DEFAULT_PIXEL_LIMITS[userPlan] || 1);

        // Count existing pixels for this user
        const { count: currentCount } = await supabaseAdmin
          .from('pixels')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', effectiveUserId);

        if ((currentCount || 0) >= maxPixels) {
          return res.status(403).json({
            error: `Pixel limit reached. Your ${userPlan} plan allows up to ${maxPixels} pixels. Please upgrade to add more.`,
          });
        }
      }

      const pixelCode = generatePixelCode();

      const { data, error } = await supabase
        .from('pixels')
        .insert({
          user_id: effectiveUserId,
          name,
          domain,
          pixel_code: pixelCode,
          status: 'pending',
          events_count: 0,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating pixel:', error);
        return res.status(500).json({ error: 'Failed to create pixel' });
      }

      await logAuditAction(user.id, 'create_pixel', req, res, 'pixel', data.id, { name, domain });
      return res.status(201).json({ pixel: data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
