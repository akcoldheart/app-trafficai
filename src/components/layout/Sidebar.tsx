import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { IconChartDots3, IconUsers, IconUserPlus, IconUserQuestion, IconSearch, IconSettings, IconCode, IconLogout, IconChevronUp, IconEye, IconShieldCheck } from '@tabler/icons-react';
import { useAuth } from '@/contexts/AuthContext';

interface MenuItem {
  title: string;
  href: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const menuItems: MenuItem[] = [
  {
    title: 'Dashboard',
    href: '/',
    icon: <IconChartDots3 className="icon" />,
  },
  {
    title: 'Pixel Creation',
    href: '/pixels',
    icon: <IconCode className="icon" />,
  },
  {
    title: 'Visitors',
    href: '/visitors',
    icon: <IconEye className="icon" />,
  },
  {
    title: 'Audiences',
    href: '/audiences',
    icon: <IconUsers className="icon" />,
  },
  {
    title: 'Create Audience',
    href: '/audiences/create',
    icon: <IconUserPlus className="icon" />,
  },
  {
    title: 'Custom Audience',
    href: '/audiences/custom',
    icon: <IconUserQuestion className="icon" />,
  },
  {
    title: 'Contact Enrichment',
    href: '/enrich',
    icon: <IconSearch className="icon" />,
  },
  {
    title: 'Settings',
    href: '/settings',
    icon: <IconSettings className="icon" />,
  },
  {
    title: 'Admin Users',
    href: '/admin/users',
    icon: <IconShieldCheck className="icon" />,
    adminOnly: true,
  },
];

export default function Sidebar() {
  const router = useRouter();
  const { user, userProfile, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Filter menu items based on user role
  const visibleMenuItems = menuItems.filter(item => {
    if (item.adminOnly) {
      return userProfile?.role === 'admin';
    }
    return true;
  });

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
    return false;
  };

  const handleLogout = async () => {
    console.log('Logout clicked - calling signOut');
    setShowUserMenu(false);
    await signOut();
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
              <li key={item.href} className={`nav-item ${isActive(item.href) ? 'active' : ''}`}>
                <Link href={item.href} className={`nav-link ${isActive(item.href) ? 'active' : ''}`}>
                  <span className="nav-link-icon d-md-none d-lg-inline-block">
                    {item.icon}
                  </span>
                  <span className="nav-link-title">{item.title}</span>
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
                  onClick={() => handleLogout()}
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
