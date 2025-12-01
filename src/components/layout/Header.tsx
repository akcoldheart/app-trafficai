import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName, getRoleLabel, getRoleBadgeClass } from '@/lib/auth';
import { IconUser, IconLogout, IconSettings, IconChevronDown } from '@tabler/icons-react';
import Link from 'next/link';

export default function Header() {
  const { user, userProfile, signOut, loading } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  const displayName = getUserDisplayName(userProfile || user);
  const roleLabel = userProfile ? getRoleLabel(userProfile.role) : '';
  const roleBadgeClass = userProfile ? getRoleBadgeClass(userProfile.role) : 'bg-secondary';

  const handleLogout = async () => {
    setDropdownOpen(false);
    await signOut();
  };

  return (
    <header className="navbar navbar-expand-md sticky-top d-print-none" data-bs-theme="dark">
      <div className="container-xl">
        <div className="navbar-nav flex-row order-md-last ms-auto">
          <div className="nav-item dropdown" ref={dropdownRef}>
            <button
              className="nav-link d-flex lh-1 text-reset p-0 align-items-center"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              aria-label="Open user menu"
              aria-expanded={dropdownOpen}
            >
              <span className="avatar avatar-sm bg-primary-lt">
                <IconUser className="icon" />
              </span>
              <div className="d-none d-xl-block ps-2 text-start">
                <div>{displayName}</div>
                {roleLabel && (
                  <div className="mt-1 small text-muted">{roleLabel}</div>
                )}
              </div>
              <IconChevronDown size={16} className="ms-2 d-none d-xl-block" />
            </button>
            <div className={`dropdown-menu dropdown-menu-end dropdown-menu-arrow ${dropdownOpen ? 'show' : ''}`}>
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
              <Link
                href="/settings"
                className="dropdown-item"
                onClick={() => setDropdownOpen(false)}
              >
                <IconSettings className="icon dropdown-item-icon" />
                Settings
              </Link>
              {userProfile?.role === 'admin' && (
                <Link
                  href="/admin/users"
                  className="dropdown-item"
                  onClick={() => setDropdownOpen(false)}
                >
                  <IconUser className="icon dropdown-item-icon" />
                  Manage Users
                </Link>
              )}
              <div className="dropdown-divider"></div>
              <button onClick={handleLogout} className="dropdown-item text-danger">
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
