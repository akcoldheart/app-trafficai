import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallback() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const handleCallback = async () => {
      const { error } = await supabase.auth.getSession();

      if (error) {
        console.error('Auth callback error:', error);
        router.push('/auth/login?error=' + encodeURIComponent(error.message));
        return;
      }

      // Get redirect URL from query params or default to home
      const redirect = (router.query.redirect as string) || '/';
      router.push(redirect);
    };

    handleCallback();
  }, [router, supabase.auth]);

  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <div className="text-center">
          <div className="mb-3">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
          </div>
          <div className="text-muted">Completing sign in...</div>
        </div>
      </div>
    </div>
  );
}
