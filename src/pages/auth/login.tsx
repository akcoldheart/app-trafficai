import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { IconBrandGoogle, IconLock, IconMail } from '@tabler/icons-react';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const { redirect } = router.query;

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        router.push((redirect as string) || '/');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during login');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback?redirect=${redirect || '/'}`,
        },
      });

      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during Google login');
      setLoading(false);
    }
  };

  return (
    <div className="page page-center">
      <div className="container container-tight py-4">
        <div className="text-center mb-4">
          <Link href="/" className="navbar-brand navbar-brand-autodark">
            <img src="/images/logo.webp" height="48" alt="Traffic AI" />
          </Link>
        </div>
        <div className="card card-md">
          <div className="card-body">
            <h2 className="h2 text-center mb-4">Login to your account</h2>

            {error && (
              <div className="alert alert-danger" role="alert">
                <div className="d-flex">
                  <div>
                    <IconLock className="icon alert-icon" />
                  </div>
                  <div>{error}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleEmailLogin}>
              <div className="mb-3">
                <label className="form-label">Email address</label>
                <div className="input-icon">
                  <span className="input-icon-addon">
                    <IconMail className="icon" />
                  </span>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>
              </div>
              <div className="mb-2">
                <label className="form-label">
                  Password
                  <span className="form-label-description">
                    <Link href="/auth/reset-password">Forgot password?</Link>
                  </span>
                </label>
                <div className="input-icon">
                  <span className="input-icon-addon">
                    <IconLock className="icon" />
                  </span>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-check">
                  <input type="checkbox" className="form-check-input" />
                  <span className="form-check-label">Remember me on this device</span>
                </label>
              </div>
              <div className="form-footer">
                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Signing in...
                    </>
                  ) : (
                    'Sign in'
                  )}
                </button>
              </div>
            </form>

            <div className="hr-text my-4">or</div>

            <div className="d-grid">
              <button
                type="button"
                className="btn btn-white"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <IconBrandGoogle className="icon text-danger me-2" />
                Sign in with Google
              </button>
            </div>
          </div>
        </div>
        <div className="text-center text-muted mt-3">
          Don't have an account yet?{' '}
          <Link href="/auth/signup" tabIndex={-1}>
            Sign up
          </Link>
        </div>
      </div>
    </div>
  );
}
