import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { IconBell, IconCheck } from '@tabler/icons-react';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminNotification } from '@/lib/supabase/types';

export default function TopBar() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isAdmin = userProfile?.role === 'admin';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch notifications for admins
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

  // Fetch notifications on mount and periodically for admins
  useEffect(() => {
    if (isAdmin) {
      fetchNotifications();
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
    if (!notification.is_read) {
      handleMarkAsRead(notification.id);
    }

    if (notification.reference_type === 'pixel_request') {
      router.push('/pixels');
    } else if (notification.reference_type === 'audience_request') {
      router.push('/admin/audience-requests');
    }

    setShowNotifications(false);
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

  // Don't render if not admin
  if (!isAdmin) return null;

  return (
    <div className="topbar">
      <div className="topbar-content">
        {/* Notification Bell */}
        <div className="topbar-notification" ref={dropdownRef}>
          <button
            className="topbar-notification-btn"
            onClick={() => {
              setShowNotifications(!showNotifications);
              if (!showNotifications) {
                fetchNotifications();
              }
            }}
            aria-label="Open notifications"
          >
            <IconBell size={20} />
            {unreadCount > 0 && (
              <span className="topbar-notification-badge">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notification Dropdown */}
          {showNotifications && (
            <div className="topbar-notification-dropdown">
              <div className="notification-header">
                <span className="notification-title">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    className="mark-all-read-btn"
                    onClick={handleMarkAllAsRead}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div className="notification-list">
                {loadingNotifications ? (
                  <div className="notification-empty">Loading...</div>
                ) : notifications.length === 0 ? (
                  <div className="notification-empty">No notifications</div>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`notification-item ${!notification.is_read ? 'unread' : ''}`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="notification-content">
                        <div className="notification-item-header">
                          <strong>{notification.title}</strong>
                          {!notification.is_read && (
                            <button
                              className="mark-read-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleMarkAsRead(notification.id);
                              }}
                              title="Mark as read"
                            >
                              <IconCheck size={14} />
                            </button>
                          )}
                        </div>
                        <div className="notification-message">{notification.message}</div>
                        <div className="notification-time">{formatTimeAgo(notification.created_at)}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Link
                href="/pixels"
                className="notification-footer"
                onClick={() => setShowNotifications(false)}
              >
                View All Requests
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
