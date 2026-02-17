import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@/lib/supabase/api';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { code, redirect: redirectTo } = req.query;

  if (!code || typeof code !== 'string') {
    return res.redirect('/auth/login?error=No+authorization+code+provided');
  }

  try {
    const supabase = createClient(req, res);

    // Exchange the code for a session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('Code exchange error:', error.message);

      // Check if we have a session despite the error
      const { data: sessionAfterError } = await supabase.auth.getSession();
      if (sessionAfterError?.session) {
        const finalRedirect = typeof redirectTo === 'string' ? redirectTo : '/';
        return res.redirect(finalRedirect);
      }

      return res.redirect('/auth/login?error=Authentication+failed');
    }

    if (!data.session) {
      return res.redirect('/auth/login?error=Authentication+failed');
    }

    // Successfully authenticated, redirect to the requested page or home
    const finalRedirect = typeof redirectTo === 'string' ? redirectTo : '/';
    return res.redirect(finalRedirect);
  } catch (err) {
    console.error('Callback error:', err);
    return res.redirect('/auth/login?error=Authentication+failed');
  }
}
