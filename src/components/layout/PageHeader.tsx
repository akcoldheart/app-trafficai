import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName, getRoleLabel, getRoleBadgeClass } from '@/lib/auth';
import { IconUser, IconLogout, IconSettings, IconChevronDown } from '@tabler/icons-react';
import Link from 'next/link';

interface PageHeaderProps {
  title: string;
  pretitle?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, pretitle, children }: PageHeaderProps) {
  const { user, userProfile, signOut } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = user ? getUserDisplayName(userProfile || user) : '';
  const roleLabel = userProfile ? getRoleLabel(userProfile.role) : '';
  const roleBadgeClass = userProfile ? getRoleBadgeClass(userProfile.role) : 'bg-secondary';

  const handleLogout = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(false);
    try {
      await signOut();
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="page-header d-print-none">
      <div className="container-xl">
        <div className="row g-2 align-items-center">
          <div className="col">
            {pretitle && <div className="page-pretitle">{pretitle}</div>}
            <h2 className="page-title">{title}</h2>
          </div>
          {children && (
            <div className="col-auto d-print-none">
              {children}
            </div>
          )}
          {user && (
            <div className="col-auto d-print-none">
              <div className="dropdown" ref={dropdownRef}>
                <button
                  className="btn btn-ghost-secondary d-flex align-items-center text-reset p-2"
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  aria-label="Open user menu"
                  aria-expanded={dropdownOpen}
                >
                  <span className="avatar avatar-sm bg-primary text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                  <div className="d-none d-md-block ps-2 text-start">
                    <div className="fw-medium">{displayName}</div>
                    {roleLabel && (
                      <div className="small text-muted">{roleLabel}</div>
                    )}
                  </div>
                  <IconChevronDown size={16} className="ms-2 text-muted" />
                </button>
                <div
                  className={`dropdown-menu dropdown-menu-end dropdown-menu-arrow ${dropdownOpen ? 'show' : ''}`}
                  style={{ position: 'absolute', right: 0, top: '100%' }}
                >
                  <div className="dropdown-header">
                    <div className="fw-medium">{displayName}</div>
                    <div className="small text-muted">{user.email}</div>
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
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="dropdown-item text-danger"
                  >
                    <IconLogout className="icon dropdown-item-icon" />
                    Logout
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
