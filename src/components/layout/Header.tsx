import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getUserDisplayName, getRoleLabel, getRoleBadgeClass } from '@/lib/auth';
import { IconUser, IconLogout, IconSettings, IconChevronDown, IconBell, IconCheck, IconCode, IconUsers } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { AdminNotification } from '@/lib/supabase/types';

export default function Header() {
  const { user, userProfile, signOut, loading } = useAuth();
  const router = useRouter();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notificationDropdownOpen, setNotificationDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);

  const isAdmin = userProfile?.role === 'admin';

  const fetchNotifications = useCallback(async () => {
    if (!isAdmin) return;

    try {
      setLoadingNotifications(true);
      const response = await fetch('/api/admin/notifications?limit=10');
      const data = await response.json();

      if (response.ok) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    } finally {
      setLoadingNotifications(false);
    }
  }, [isAdmin]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications on mount and periodically for admins
  useEffect(() => {
    if (isAdmin) {
      fetchNotifications();
      // Poll for new notifications every 60 seconds
      const interval = setInterval(fetchNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [isAdmin, fetchNotifications]);

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/admin/notifications/${notificationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_read: true }),
      });

      if (response.ok) {
        setNotifications(notifications.map(n =>
          n.id === notificationId ? { ...n, is_read: true } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const response = await fetch('/api/admin/notifications/mark-all-read', {
        method: 'POST',
      });

      if (response.ok) {
        setNotifications(notifications.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Failed to mark all as read:', error);
    }
  };

  const handleNotificationClick = (notification: AdminNotification) => {
    // Mark as read
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }

    // Navigate to relevant page
    if (notification.reference_type === 'pixel_request') {
      router.push('/admin/pixel-requests');
    } else if (notification.reference_type === 'audience_request') {
      router.push('/admin/audience-requests');
    }

    setNotificationDropdownOpen(false);
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'pixel_request':
        return <IconCode size={16} />;
      case 'audience_request':
        return <IconUsers size={16} />;
      default:
        return <IconBell size={16} />;
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return null;
  }

  if (!user) {
    return null;
  }

  const displayName = getUserDisplayName(userProfile || user);
  const roleLabel = userProfile ? getRoleLabel(userProfile.role) : '';
  const roleBadgeClass = userProfile ? getRoleBadgeClass(userProfile.role) : 'bg-secondary';

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropdownOpen(false);
    // Use setTimeout to ensure the click completes before redirect
    setTimeout(() => {
      signOut();
    }, 0);
  };

  return (
    <header className="navbar navbar-expand-md sticky-top d-print-none" data-bs-theme="dark">
      <div className="container-xl">
        <div className="navbar-nav flex-row order-md-last ms-auto align-items-center">
          {/* Notification Bell for Admins */}
          {isAdmin && (
            <div className="nav-item dropdown me-3" ref={notificationRef}>
              <button
                className="nav-link px-0 position-relative"
                onClick={() => {
                  setNotificationDropdownOpen(!notificationDropdownOpen);
                  if (!notificationDropdownOpen) {
                    fetchNotifications();
                  }
                }}
                aria-label="Open notifications"
                aria-expanded={notificationDropdownOpen}
                style={{ background: 'none', border: 'none' }}
              >
                <IconBell size={20} />
                {unreadCount > 0 && (
                  <span
                    className="badge bg-danger badge-notification badge-blink"
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      fontSize: '10px',
                      padding: '2px 5px',
                      minWidth: '18px',
                    }}
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <div
                className={`dropdown-menu dropdown-menu-end dropdown-menu-arrow ${notificationDropdownOpen ? 'show' : ''}`}
                style={{ width: '360px', maxHeight: '400px', overflowY: 'auto', zIndex: 1050 }}
              >
                <div className="dropdown-header d-flex justify-content-between align-items-center">
                  <span className="fw-semibold">Notifications</span>
                  {unreadCount > 0 && (
                    <button
                      className="btn btn-sm btn-link p-0 text-muted"
                      onClick={handleMarkAllAsRead}
                    >
                      Mark all read
                    </button>
                  )}
                </div>
                <div className="dropdown-divider"></div>
                {loadingNotifications ? (
                  <div className="dropdown-item text-center text-muted py-3">
                    Loading...
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="dropdown-item text-center text-muted py-3">
                    No notifications
                  </div>
                ) : (
                  <>
                    {notifications.map((notification) => (
                      <div
                        key={notification.id}
                        className={`dropdown-item d-flex align-items-start py-2 ${!notification.is_read ? 'bg-azure-lt' : ''}`}
                        style={{ cursor: 'pointer', whiteSpace: 'normal' }}
                        onClick={() => handleNotificationClick(notification)}
                      >
                        <span className={`avatar avatar-sm me-2 ${!notification.is_read ? 'bg-primary-lt' : 'bg-secondary-lt'}`}>
                          {getNotificationIcon(notification.type)}
                        </span>
                        <div className="flex-fill" style={{ minWidth: 0 }}>
                          <div className="d-flex justify-content-between align-items-start">
                            <strong className="d-block text-truncate" style={{ fontSize: '13px' }}>
                              {notification.title}
                            </strong>
                            {!notification.is_read && (
                              <button
                                className="btn btn-icon btn-sm btn-ghost-secondary ms-1"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMarkAsRead(notification.id);
                                }}
                                title="Mark as read"
                                style={{ padding: '2px' }}
                              >
                                <IconCheck size={14} />
                              </button>
                            )}
                          </div>
                          <div className="text-muted small text-truncate">
                            {notification.message}
                          </div>
                          <div className="text-muted small mt-1">
                            {formatTimeAgo(notification.created_at)}
                          </div>
                        </div>
                      </div>
                    ))}
                    <div className="dropdown-divider"></div>
                    <Link
                      href="/admin/pixel-requests"
                      className="dropdown-item text-center text-primary"
                      onClick={() => setNotificationDropdownOpen(false)}
                    >
                      View All Requests
                    </Link>
                  </>
                )}
              </div>
            </div>
          )}

          {/* User Dropdown */}
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
            <div className={`dropdown-menu dropdown-menu-end dropdown-menu-arrow ${dropdownOpen ? 'show' : ''}`} style={{ zIndex: 1050 }}>
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
              <a
                href="#"
                onClick={handleLogout}
                className="dropdown-item text-danger"
                role="button"
              >
                <IconLogout className="icon dropdown-item-icon" />
                Logout
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
