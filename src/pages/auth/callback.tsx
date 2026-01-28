import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

export default function AuthCallback() {
  const [error, setError] = useState<string | null>(null);
  const processingRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent double processing
      if (processingRef.current) return;
      processingRef.current = true;

      const supabase = createClient();

      try {
        // Read parameters directly from URL to avoid Next.js router timing issues
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const redirectTo = urlParams.get('redirect') || '/';

        // Check for hash fragment (implicit flow)
        if (window.location.hash) {
          const hashParams = new URLSearchParams(window.location.hash.substring(1));
          const accessToken = hashParams.get('access_token');
          if (accessToken) {
            console.log('Found access token in hash, waiting for session...');
            // Give Supabase a moment to process the hash
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        }

        // First check if we already have a valid session
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          console.log('Session already exists, redirecting...');
          window.location.href = redirectTo;
          return;
        }

        if (code) {
          console.log('Processing OAuth callback with code...');

          // Exchange the code for a session (client-side has access to code_verifier)
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            console.error('Code exchange error:', exchangeError);

            // If exchange fails, check again for session (might have been set by another process)
            const { data: { session: retrySession } } = await supabase.auth.getSession();
            if (retrySession) {
              console.log('Session found after exchange error, redirecting...');
              window.location.href = redirectTo;
              return;
            }

            // Show user-friendly error message
            if (exchangeError.message.includes('expired') || exchangeError.message.includes('invalid')) {
              setError('Your sign-in link has expired. Please try again.');
            } else {
              setError(exchangeError.message);
            }
            return;
          }

          // Successfully exchanged code
          if (data?.session) {
            console.log('Session obtained from code exchange, redirecting...');
            window.location.href = redirectTo;
            return;
          }
        }

        // No code and no session - this shouldn't happen normally
        setError('No authentication data found. Please try signing in again.');
      } catch (err) {
        console.error('Auth callback error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
      }
    };

    // Run immediately on mount
    handleCallback();
  }, []);

  if (error) {
    return (
      <div className="page page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="container container-tight py-4">
          <div className="text-center">
            <div className="alert alert-danger mb-3">{error}</div>
            <Link href="/auth/login" className="btn btn-primary">Try Again</Link>
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
