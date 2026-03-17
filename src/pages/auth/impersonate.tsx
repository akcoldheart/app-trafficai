import { useEffect, useState, useRef } from 'react';
import Head from 'next/head';
import { createClient } from '@/lib/supabase/client';

export default function ImpersonateCallback() {
  const [error, setError] = useState<string | null>(null);
  const processedRef = useRef(false);
  const supabase = createClient();

  useEffect(() => {
    if (processedRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get('token_hash');

    if (!tokenHash) {
      setError('Invalid impersonation link');
      return;
    }

    processedRef.current = true;

    const verifyToken = async () => {
      try {
        // Sign out current session before verifying OTP
        await supabase.auth.signOut({ scope: 'local' });

        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'magiclink',
        });

        if (verifyError) {
          console.error('Impersonation verify error:', verifyError);
          setError('Failed to verify impersonation token. Please try again.');
          return;
        }

        if (data?.session) {
          // Redirect to dashboard — impersonation banner will show
          // based on localStorage flags set by the admin page
          window.location.href = '/';
        } else {
          setError('Failed to establish session');
        }
      } catch (err) {
        console.error('Impersonation error:', err);
        setError('An error occurred during impersonation');
      }
    };

    verifyToken();
  }, [supabase.auth]);

  return (
    <>
      <Head>
        <title>TrafficAi - Impersonating</title>
      </Head>
      <div className="page page-center" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="text-center">
          {error ? (
            <div>
              <div className="alert alert-danger">{error}</div>
              <button className="btn btn-primary mt-2" onClick={() => window.location.href = '/auth/login'}>
                Back to Login
              </button>
            </div>
          ) : (
            <>
              <div className="mb-3">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
              <div className="text-muted">Signing in as user...</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
