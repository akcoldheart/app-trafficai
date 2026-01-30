import { useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { createClient } from '@/lib/supabase/client';
import { IconCheck, IconBolt, IconShieldCheck, IconChartBar } from '@tabler/icons-react';

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const supabase = createClient();

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/update-password`,
      });

      if (error) throw error;

      setSuccess(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>TrafficAi</title>
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

            <h1 className="auth-form-title">Reset Password</h1>

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
                    Check your email
                  </h3>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: 0 }}>
                    We&apos;ve sent a password reset link to <strong>{email}</strong>
                  </p>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="alert alert-danger" role="alert">
                      {error}
                    </div>
                  )}

                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                    Enter your email address and we&apos;ll send you a link to reset your password.
                  </p>

                  <form onSubmit={handleResetPassword} className="auth-form">
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

                    <button type="submit" className="btn btn-primary" disabled={loading}>
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          Sending...
                        </>
                      ) : (
                        'Send Reset Link'
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
