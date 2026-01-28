import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { createClient } from '@/lib/supabase/client';
import { IconEye, IconEyeOff, IconBolt, IconShieldCheck, IconChartBar } from '@tabler/icons-react';

// Google "G" logo
const GoogleLogo = () => (
  <svg className="google-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
  </svg>
);

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const { redirect } = router.query;

  // Check URL for error from OAuth callback
  useEffect(() => {
    const errorParam = router.query.error as string;
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      // Clear error from URL
      router.replace('/auth/login', undefined, { shallow: true });
    }
  }, [router.query.error, router]);

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
          redirectTo: `${window.location.origin}/api/auth/callback?redirect=${encodeURIComponent((redirect as string) || '/')}`,
        },
      });

      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during Google login');
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Login - Traffic AI</title>
      </Head>

      <div className="auth-page">
        {/* Left Brand Panel */}
        <div className="auth-brand-panel">
          <div className="auth-brand-content">
            <div className="auth-brand-logo">
              <img src="/images/logo.webp" alt="Traffic AI" />
            </div>
            <p className="auth-brand-tagline">
              Automate smarter, integrate faster, and drive rapid scale.
            </p>
            <div className="auth-brand-divider"></div>
            <div className="auth-brand-features">
              <div className="auth-brand-feature">
                <div className="auth-brand-feature-icon">
                  <IconBolt stroke={1.5} />
                </div>
                <span>Real-time audience insights and analytics</span>
              </div>
              <div className="auth-brand-feature">
                <div className="auth-brand-feature-icon">
                  <IconShieldCheck stroke={1.5} />
                </div>
                <span>Enterprise-grade security and compliance</span>
              </div>
              <div className="auth-brand-feature">
                <div className="auth-brand-feature-icon">
                  <IconChartBar stroke={1.5} />
                </div>
                <span>Advanced data enrichment and targeting</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Panel */}
        <div className="auth-form-panel">
          <div className="auth-form-container">
            {/* Logo for mobile */}
            <div className="auth-mobile-logo">
              <img src="/images/logo.webp" alt="Traffic AI" height="40" />
            </div>

            <h1 className="auth-form-title">Welcome back!</h1>

            {error && (
              <div className="alert alert-danger" role="alert">
                {error}
              </div>
            )}

            {/* Form Card */}
            <div className="auth-card">
              {/* Google Sign In - First */}
              <button
                type="button"
                className="btn-social"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <GoogleLogo />
                Sign in with Google
              </button>

              <div className="auth-divider">
                <span>or</span>
              </div>

              {/* Email/Password Form */}
              <form onSubmit={handleEmailLogin} className="auth-form">
                <div className="mb-3">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <div className="input-group">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="form-control"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      className="input-group-text"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Signing in...
                    </>
                  ) : (
                    'Login'
                  )}
                </button>

                <div className="auth-forgot-link">
                  <Link href="/auth/reset-password">Forgot Password</Link>
                </div>
              </form>
            </div>

            <div className="auth-form-footer">
              Don&apos;t have an account?{' '}
              <Link href="/auth/signup" className="auth-form-link">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
