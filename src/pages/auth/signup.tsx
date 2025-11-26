import { useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { IconBrandGoogle, IconLock, IconMail, IconUser } from '@tabler/icons-react';

export default function Signup() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password strength
    if (password.length < 8) {
      setError('Password must be at least 8 characters long');
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;

      if (data.user) {
        // User created successfully - redirect to login
        router.push('/auth/login?message=Account created successfully. Please sign in.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during signup');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) throw error;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred during Google signup');
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
            <h2 className="h2 text-center mb-4">Create your account</h2>

            {error && (
              <div className="alert alert-danger" role="alert">
                <div className="d-flex">
                  <div>
                    <IconUser className="icon alert-icon" />
                  </div>
                  <div>{error}</div>
                </div>
              </div>
            )}

            <form onSubmit={handleEmailSignup}>
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
              <div className="mb-3">
                <label className="form-label">Password</label>
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
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
                <small className="form-hint">
                  Must be at least 8 characters long
                </small>
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm Password</label>
                <div className="input-icon">
                  <span className="input-icon-addon">
                    <IconLock className="icon" />
                  </span>
                  <input
                    type="password"
                    className="form-control"
                    placeholder="Confirm your password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="form-check">
                  <input type="checkbox" className="form-check-input" required />
                  <span className="form-check-label">
                    I agree to the <Link href="/terms">terms and conditions</Link>
                  </span>
                </label>
              </div>
              <div className="form-footer">
                <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                      Creating account...
                    </>
                  ) : (
                    'Create account'
                  )}
                </button>
              </div>
            </form>

            <div className="hr-text my-4">or</div>

            <div className="d-grid">
              <button
                type="button"
                className="btn btn-white"
                onClick={handleGoogleSignup}
                disabled={loading}
              >
                <IconBrandGoogle className="icon text-danger me-2" />
                Sign up with Google
              </button>
            </div>
          </div>
        </div>
        <div className="text-center text-muted mt-3">
          Already have an account?{' '}
          <Link href="/auth/login" tabIndex={-1}>
            Sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
