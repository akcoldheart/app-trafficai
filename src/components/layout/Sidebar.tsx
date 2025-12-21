import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  IconChartDots3,
  IconUsers,
  IconUserPlus,
  IconUserQuestion,
  IconSearch,
  IconSettings,
  IconCode,
  IconLogout,
  IconChevronUp,
  IconEye,
  IconShieldCheck,
  IconMessage,
  IconRobot,
  IconLock,
  IconLayoutDashboard,
  IconQuestionMark,
} from '@tabler/icons-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/lib/supabase/client';

// Icon mapping for database-driven menu items
type IconComponent = React.ComponentType<{ className?: string; size?: string | number }>;
const iconMap: Record<string, IconComponent> = {
  IconChartDots3,
  IconUsers,
  IconUserPlus,
  IconUserQuestion,
  IconSearch,
  IconSettings,
  IconCode,
  IconEye,
  IconShieldCheck,
  IconMessage,
  IconRobot,
  IconLock,
  IconLayoutDashboard,
};

// Get icon component by name
const getIcon = (iconName: string) => {
  const IconComponent = iconMap[iconName] || IconQuestionMark;
  return <IconComponent className="icon" />;
};

export default function Sidebar() {
  const router = useRouter();
  const { user, userProfile, userMenuItems, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Use database-driven menu items (already sorted by display_order in AuthContext)
  const visibleMenuItems = userMenuItems;

  // Get display name from user metadata or email
  const getUserDisplayName = () => {
    if (user?.user_metadata?.full_name) {
      return user.user_metadata.full_name;
    }
    if (user?.user_metadata?.name) {
      return user.user_metadata.name;
    }
    if (user?.email) {
      // Return part before @ if no name
      return user.email;
    }
    return 'User';
  };

 

  const isActive = (href: string) => {
    if (href === '/') {
      return router.pathname === '/';
    }
    // Exact match for specific menu items
    if (router.pathname === href) {
      return true;
    }
    // For /audiences, only match dynamic routes like /audiences/[id] but not /audiences/create or /audiences/custom
    if (href === '/audiences') {
      return router.pathname === '/audiences' ||
        (router.pathname.startsWith('/audiences/') &&
         router.pathname !== '/audiences/create' &&
         router.pathname !== '/audiences/custom');
    }
    // For admin routes
    if (href.startsWith('/admin')) {
      return router.pathname === href || router.pathname.startsWith(href + '/');
    }
    // For chat routes
    if (href === '/chat') {
      return router.pathname === '/chat' ||
        (router.pathname.startsWith('/chat/') && router.pathname !== '/chat/auto-replies');
    }
    // For auto-replies
    if (href === '/chat/auto-replies') {
      return router.pathname === '/chat/auto-replies';
    }
    return false;
  };

  const handleLogout = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowUserMenu(false);

    // Clear cookies synchronously
    document.cookie.split(';').forEach((c) => {
      const name = c.trim().split('=')[0];
      if (name.startsWith('sb-') || name.includes('supabase')) {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      }
    });

    // Clear storage synchronously
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        localStorage.removeItem(key);
      }
    });
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith('sb-') || key.includes('supabase')) {
        sessionStorage.removeItem(key);
      }
    });

    // Sign out from Supabase (fire and forget - don't wait)
    const supabase = createClient();
    supabase.auth.signOut({ scope: 'local' }).catch(() => {});

    // Redirect immediately
    window.location.replace('/auth/login');
  };

  return (
    <aside className="navbar navbar-vertical navbar-expand-lg" data-bs-theme="dark">
      <div className="container-fluid">
        {/* Mobile Toggle */}
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#sidebar-menu"
          aria-controls="sidebar-menu"
          aria-expanded="false"
          aria-label="Toggle navigation"
        >
          <span className="navbar-toggler-icon"></span>
        </button>

        {/* Logo */}
        <h1 className="navbar-brand navbar-brand-autodark">
          <Link href="/">
            <img src="/images/logo.webp" alt="Traffic AI" height="32" className="navbar-brand-image" />
          </Link>
        </h1>

        {/* Sidebar Menu */}
        <div className="collapse navbar-collapse" id="sidebar-menu">
          <ul className="navbar-nav pt-lg-3">
            {visibleMenuItems.map((item) => (
              <li key={item.id} className={`nav-item ${isActive(item.href) ? 'active' : ''}`}>
                <Link href={item.href} className={`nav-link ${isActive(item.href) ? 'active' : ''}`}>
                  <span className="nav-link-icon d-md-none d-lg-inline-block">
                    {getIcon(item.icon)}
                  </span>
                  <span className="nav-link-title">{item.name}</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* User Profile Section at Bottom */}
          <div className="sidebar-user-section">
            <div
              className="sidebar-user-trigger"
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div className="sidebar-user-info">
                <span className="sidebar-user-name">{getUserDisplayName()}</span>
              </div>
              <IconChevronUp
                size={18}
                className={`sidebar-user-chevron ${showUserMenu ? 'open' : ''}`}
              />
            </div>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="sidebar-user-menu">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="sidebar-user-menu-item"
                >
                  <IconLogout size={18} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
