import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { IconMail, IconCheck } from '@tabler/icons-react';

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
    <div className="page page-center">
      <div className="container container-tight py-4">
        <div className="text-center mb-4">
          <Link href="/" className="navbar-brand navbar-brand-autodark">
            <img src="/images/logo.webp" height="48" alt="Traffic AI" />
          </Link>
        </div>
        <div className="card card-md">
          <div className="card-body">
            <h2 className="h2 text-center mb-4">Reset Password</h2>

            {success ? (
              <div className="alert alert-success" role="alert">
                <div className="d-flex">
                  <div>
                    <IconCheck className="icon alert-icon" />
                  </div>
                  <div>
                    <h4 className="alert-title">Check your email</h4>
                    <div className="text-muted">
                      We've sent a password reset link to <strong>{email}</strong>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}

                <p className="text-muted mb-4">
                  Enter your email address and we'll send you a link to reset your password.
                </p>

                <form onSubmit={handleResetPassword}>
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
                  <div className="form-footer">
                    <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          Sending...
                        </>
                      ) : (
                        'Send reset link'
                      )}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
        <div className="text-center text-muted mt-3">
          <Link href="/auth/login">Back to login</Link>
        </div>
      </div>
    </div>
  );
}
