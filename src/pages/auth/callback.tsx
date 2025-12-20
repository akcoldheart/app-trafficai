import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallback() {
  const router = useRouter();
  const supabase = createClient();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Check for code in URL (PKCE flow)
        const code = router.query.code as string;

        if (code) {
          // Exchange the code for a session
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('Code exchange error:', exchangeError);
            setError(exchangeError.message);
            return;
          }
        }

        // Verify we have a session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('Session error:', sessionError);
          setError(sessionError.message);
          return;
        }

        if (!session) {
          setError('No session found. Please try logging in again.');
          return;
        }

        // Get redirect URL from query params or default to home
        const redirect = (router.query.redirect as string) || '/';
        window.location.href = redirect;
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    if (router.isReady) {
      handleCallback();
    }
  }, [router.isReady, router.query, supabase.auth]);

  if (error) {
    return (
      <div className="page page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="container container-tight py-4">
          <div className="text-center">
            <div className="alert alert-danger mb-3">{error}</div>
            <Link href="/auth/login" className="btn btn-primary">Back to Login</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
