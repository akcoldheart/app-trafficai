import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Head from 'next/head';
import { createClient } from '@/lib/supabase/client';
import { IconEye, IconEyeOff, IconCheck, IconBolt, IconShieldCheck, IconChartBar } from '@tabler/icons-react';

export default function UpdatePassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  // Supabase sends the user here with a session after clicking the reset link
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User arrived via password reset link - session is ready
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => router.push('/'), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>TrafficAi - Update Password</title>
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

            <h1 className="auth-form-title">Set New Password</h1>

            {/* Form Card */}
            <div className="auth-card">
              {success ? (
                <div className="text-center py-3">
                  <div style={{
                    width: 48,
                    height: 48,
                    background: '#dcfce7',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 1rem'
                  }}>
                    <IconCheck size={24} style={{ color: '#16a34a' }} />
                  </div>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.5rem', color: '#1c1917' }}>
                    Password updated
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 0 }}>
                    Redirecting you to the dashboard...
                  </p>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="alert alert-danger" role="alert">
                      {error}
                    </div>
                  )}

                  <form onSubmit={handleUpdatePassword} className="auth-form">
                    <div className="mb-3">
                      <label className="form-label">New Password</label>
                      <div className="input-group">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          className="form-control"
                          placeholder="Enter new password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          autoComplete="new-password"
                        />
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => setShowPassword(!showPassword)}
                          tabIndex={-1}
                        >
                          {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                        </button>
                      </div>
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Confirm Password</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="form-control"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength={6}
                        autoComplete="new-password"
                      />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          Updating...
                        </>
                      ) : (
                        'Update Password'
                      )}
                    </button>
                  </form>
                </>
              )}
            </div>

            <div className="auth-form-footer">
              <Link href="/auth/login" className="auth-form-link">
                Back to login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
