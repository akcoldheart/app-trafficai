import Link from 'next/link';
import { useRouter } from 'next/router';
import { IconChartDots3, IconUsers, IconUserPlus, IconUserQuestion, IconSearch, IconSettings, IconCode } from '@tabler/icons-react';

interface MenuItem {
  title: string;
  href: string;
  icon: React.ReactNode;
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
];

export default function Sidebar() {
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === '/') {
      return router.pathname === '/';
    }
    return router.pathname.startsWith(href);
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
            {menuItems.map((item) => (
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
        </div>
      </div>
    </aside>
  );
}
