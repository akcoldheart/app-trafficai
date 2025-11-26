import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName, getRoleLabel, getRoleBadgeClass } from '@/lib/auth';
import { IconUser, IconLogout, IconSettings } from '@tabler/icons-react';
import Link from 'next/link';

export default function Header() {
  const { user, userProfile, signOut, loading } = useAuth();

  if (loading) {
    return null; // Don't show header while loading
  }

  if (!user) {
    return null; // Don't show header if not authenticated
  }

  const displayName = getUserDisplayName(userProfile || user);
  const roleLabel = userProfile ? getRoleLabel(userProfile.role) : '';
  const roleBadgeClass = userProfile ? getRoleBadgeClass(userProfile.role) : 'bg-secondary';

  return (
    <header className="navbar navbar-expand-md sticky-top d-print-none" data-bs-theme="dark">
      <div className="container-xl">
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#navbar-menu"
          aria-controls="navbar-menu"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>
        <div className="navbar-nav flex-row order-md-last">
          <div className="nav-item dropdown">
            <button
              className="nav-link d-flex lh-1 text-reset p-0"
              data-bs-toggle="dropdown"
              aria-label="Open user menu"
              aria-expanded="false"
            >
              <span className="avatar avatar-sm">
                <IconUser className="icon" />
              </span>
              <div className="d-none d-xl-block ps-2">
                <div>{displayName}</div>
                {roleLabel && (
                  <div className="mt-1 small text-muted">{roleLabel}</div>
                )}
              </div>
            </button>
            <div className="dropdown-menu dropdown-menu-end dropdown-menu-arrow">
              <div className="dropdown-header">
                <span className="text-muted">{user.email}</span>
                {userProfile && (
                  <div className="mt-1">
                    <span className={`badge ${roleBadgeClass} badge-sm`}>
                      {roleLabel}
                    </span>
                  </div>
                )}
              </div>
              <div className="dropdown-divider"></div>
              <Link href="/settings" className="dropdown-item">
                <IconSettings className="icon dropdown-item-icon" />
                Settings
              </Link>
              {userProfile?.role === 'admin' && (
                <Link href="/admin/users" className="dropdown-item">
                  <IconUser className="icon dropdown-item-icon" />
                  Manage Users
                </Link>
              )}
              <div className="dropdown-divider"></div>
              <button onClick={signOut} className="dropdown-item text-danger">
                <IconLogout className="icon dropdown-item-icon" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
