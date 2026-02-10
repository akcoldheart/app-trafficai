import type { NextApiRequest, NextApiResponse } from 'next';
import { getAuthenticatedUser } from '@/lib/api-helpers';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const getServiceClient = () => {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await getAuthenticatedUser(req, res);
  if (!user) return;

  try {
    const serviceClient = getServiceClient();

    const { error } = await serviceClient
      .from('users')
      .update({ onboarding_completed: true })
      .eq('id', user.id);

    if (error) {
      console.error('Error completing onboarding:', error);
      return res.status(500).json({ error: 'Failed to complete onboarding' });
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Onboarding complete error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
