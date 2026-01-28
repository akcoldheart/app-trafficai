import { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconUser,
  IconMail,
  IconPhone,
  IconBuilding,
  IconLoader2,
  IconCheck,
  IconAlertCircle,
  IconLock,
  IconKey,
} from '@tabler/icons-react';
import { createClient } from '@/lib/supabase/client';

export default function Profile() {
  const { user, userProfile, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Fetch profile data from API on mount
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/account/profile');
        const data = await response.json();
        if (response.ok && data.profile) {
          setFullName(data.profile.full_name || '');
          setPhone(data.profile.phone || '');
          setCompany(data.profile.company || '');
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoadingProfile(false);
      }
    };

    fetchProfile();
  }, []);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/account/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName,
          phone,
          company,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.details || data.error || 'Failed to update profile';
        throw new Error(errorMsg);
      }

      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      refreshUser();
    } catch (error) {
      setMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
      setChangingPassword(false);
      return;
    }

    if (newPassword.length < 8) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      setChangingPassword(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      setPasswordMessage({ type: 'success', text: 'Password changed successfully!' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
    } catch (error) {
      setPasswordMessage({ type: 'error', text: (error as Error).message });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Layout title="My Profile" pageTitle="My Profile" pagePretitle="Account">
      <div className="row row-cards">
        <div className="col-lg-8">
          {/* Profile Information */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconUser className="icon me-2" />
                Profile Information
              </h3>
            </div>
            <div className="card-body">
              {message && (
                <div className={`alert alert-${message.type === 'success' ? 'success' : 'danger'} mb-3`}>
                  {message.type === 'success' ? (
                    <IconCheck className="icon alert-icon" />
                  ) : (
                    <IconAlertCircle className="icon alert-icon" />
                  )}
                  <div>{message.text}</div>
                </div>
              )}

              {loadingProfile ? (
                <div className="text-center py-4">
                  <IconLoader2 size={24} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                  <p className="text-muted mt-2 mb-0">Loading profile...</p>
                </div>
              ) : (
              <form onSubmit={handleSaveProfile}>
                <div className="mb-3">
                  <label className="form-label">
                    <IconMail size={16} className="me-1" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    value={user?.email || ''}
                    disabled
                  />
                  <small className="text-muted">Email cannot be changed</small>
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    <IconUser size={16} className="me-1" />
                    Full Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    <IconPhone size={16} className="me-1" />
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    className="form-control"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    <IconBuilding size={16} className="me-1" />
                    Company
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Your company name"
                  />
                </div>

                <div className="d-flex justify-content-end">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Saving...
                      </>
                    ) : (
                      <>
                        <IconCheck size={16} className="me-1" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
              )}
            </div>
          </div>

          {/* Password Change */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconLock className="icon me-2" />
                Security
              </h3>
            </div>
            <div className="card-body">
              {passwordMessage && (
                <div className={`alert alert-${passwordMessage.type === 'success' ? 'success' : 'danger'} mb-3`}>
                  {passwordMessage.type === 'success' ? (
                    <IconCheck className="icon alert-icon" />
                  ) : (
                    <IconAlertCircle className="icon alert-icon" />
                  )}
                  <div>{passwordMessage.text}</div>
                </div>
              )}

              {!showPasswordForm ? (
                <button
                  className="btn btn-outline-secondary"
                  onClick={() => setShowPasswordForm(true)}
                >
                  <IconKey size={16} className="me-1" />
                  Change Password
                </button>
              ) : (
                <form onSubmit={handleChangePassword}>
                  <div className="mb-3">
                    <label className="form-label">New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password"
                      required
                      minLength={8}
                    />
                    <small className="text-muted">Minimum 8 characters</small>
                  </div>

                  <div className="mb-3">
                    <label className="form-label">Confirm New Password</label>
                    <input
                      type="password"
                      className="form-control"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm new password"
                      required
                    />
                  </div>

                  <div className="d-flex gap-2">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={changingPassword}
                    >
                      {changingPassword ? (
                        <>
                          <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                          Updating...
                        </>
                      ) : (
                        'Update Password'
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setShowPasswordForm(false);
                        setNewPassword('');
                        setConfirmPassword('');
                        setPasswordMessage(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          {/* Account Summary */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Account Summary</h3>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <div className="text-muted small">Account Type</div>
                <div className="fw-semibold">
                  <span className="badge bg-primary-lt text-capitalize">
                    {userProfile?.role || 'User'}
                  </span>
                </div>
              </div>
              <div className="mb-3">
                <div className="text-muted small">Member Since</div>
                <div className="fw-semibold">
                  {user?.created_at
                    ? new Date(user.created_at).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })
                    : '-'}
                </div>
              </div>
              <div className="mb-3">
                <div className="text-muted small">Last Sign In</div>
                <div className="fw-semibold">
                  {user?.last_sign_in_at
                    ? new Date(user.last_sign_in_at).toLocaleString()
                    : '-'}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="card bg-primary-lt">
            <div className="card-body">
              <h4 className="mb-2">Need more features?</h4>
              <p className="text-muted mb-3">
                Upgrade your plan to unlock more visitors, audiences, and premium features.
              </p>
              <Link href="/account/billing" className="btn btn-primary">
                View Plans
              </Link>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Layout>
  );
}
