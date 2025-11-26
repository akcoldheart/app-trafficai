import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { TrafficAPI, Audience } from '@/lib/api';
import {
  IconPlus,
  IconSearch,
  IconUsers,
  IconEye,
  IconClick,
  IconArrowUpRight,
  IconArrowDownRight,
  IconCode,
  IconBrandFacebook,
  IconWorld,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconChartBar
} from '@tabler/icons-react';

export default function Dashboard() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [totalAudiences, setTotalAudiences] = useState<number | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [loading, setLoading] = useState(true);
  const [pixelCount, setPixelCount] = useState(0);

  // Static demo data for charts
  const visitorData = [30, 40, 35, 50, 49, 60, 70, 91, 85, 95, 100, 120];
  const conversionData = [10, 15, 12, 18, 22, 19, 25, 30, 28, 35, 32, 40];

  useEffect(() => {
    loadDashboardData();
    loadPixelCount();
  }, []);

  const loadDashboardData = async () => {
    try {
      const audiencesData = await TrafficAPI.getAudiences(1, 5);
      setAudiences(audiencesData.Data || []);
      setTotalAudiences(audiencesData.total_records || 0);
    } catch (error) {
      console.error('Error loading audiences:', error);
    }

    try {
      const creditsData = await TrafficAPI.getCredits();
      setCredits(creditsData.credits || creditsData.available || 0);
    } catch (error) {
      console.error('Error loading credits:', error);
    }

    try {
      const testResult = await TrafficAPI.testConnection();
      setApiStatus(testResult.success ? 'connected' : 'error');
    } catch {
      setApiStatus('error');
    }

    setLoading(false);
  };

  const loadPixelCount = async () => {
    try {
      const response = await fetch('/api/pixels');
      const data = await response.json();
      if (response.ok) {
        setPixelCount(data.pixels?.length || 0);
      }
    } catch (error) {
      console.error('Error loading pixels:', error);
    }
  };

  // Demo stats
  const stats = {
    totalVisitors: 75782,
    visitorChange: 2,
    activeUsers: 25782,
    activeUserChange: -1,
    pageViews: 156420,
    pageViewChange: 5,
    conversionRate: 78,
  };

  const trafficSources = [
    { name: 'Direct', value: 4250, percentage: 35, color: 'bg-primary' },
    { name: 'Organic Search', value: 3120, percentage: 26, color: 'bg-green' },
    { name: 'Social Media', value: 2440, percentage: 20, color: 'bg-azure' },
    { name: 'Referral', value: 1580, percentage: 13, color: 'bg-yellow' },
    { name: 'Email', value: 730, percentage: 6, color: 'bg-red' },
  ];

  const recentActivity = [
    { type: 'pixel', message: 'New visitor captured from example.com', time: '2 min ago', icon: <IconEye size={16} /> },
    { type: 'audience', message: 'Audience "High Intent Buyers" updated', time: '15 min ago', icon: <IconUsers size={16} /> },
    { type: 'integration', message: 'Facebook Ads sync completed', time: '1 hour ago', icon: <IconBrandFacebook size={16} /> },
    { type: 'pixel', message: '142 new events tracked', time: '2 hours ago', icon: <IconClick size={16} /> },
  ];

  const topPages = [
    { page: '/products', views: 12453, unique: 8234 },
    { page: '/pricing', views: 8721, unique: 6102 },
    { page: '/about', views: 5432, unique: 4521 },
    { page: '/contact', views: 3214, unique: 2876 },
  ];

  return (
    <Layout title="Dashboard" pageTitle="Dashboard" pagePretitle="Overview">
      {/* Welcome Banner */}
      <div className="card mb-4" style={{ background: 'linear-gradient(135deg, var(--tblr-primary) 0%, #1a56db 100%)' }}>
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-lg-7">
              <h2 className="text-white mb-2">Welcome back!</h2>
              <p className="text-white opacity-75 mb-3">
                You have {pixelCount} active pixel{pixelCount !== 1 ? 's' : ''} tracking visitor data.
                {totalAudiences !== null && totalAudiences > 0 && ` ${totalAudiences} audience${totalAudiences !== 1 ? 's' : ''} created.`}
              </p>
              <div className="btn-list">
                <Link href="/pixels" className="btn bg-white text-primary">
                  <IconCode size={18} className="me-1" />
                  Manage Pixels
                </Link>
                <Link href="/audiences/create" className="btn btn-outline-light">
                  <IconPlus size={18} className="me-1" />
                  Create Audience
                </Link>
              </div>
            </div>
            <div className="col-lg-5 d-none d-lg-block text-end">
              <div className="row text-white text-center">
                <div className="col-4">
                  <div className="display-6 fw-bold">{stats.totalVisitors.toLocaleString()}</div>
                  <div className="opacity-75 small">Total Visitors</div>
                </div>
                <div className="col-4">
                  <div className="display-6 fw-bold">{stats.pageViews.toLocaleString()}</div>
                  <div className="opacity-75 small">Page Views</div>
                </div>
                <div className="col-4">
                  <div className="display-6 fw-bold">{stats.conversionRate}%</div>
                  <div className="opacity-75 small">Conversion</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="row row-deck row-cards mb-4">
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between">
                <div className="subheader text-muted">Total Visitors</div>
                <span className={`badge ${stats.visitorChange >= 0 ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                  {stats.visitorChange >= 0 ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
                  {Math.abs(stats.visitorChange)}%
                </span>
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">{stats.totalVisitors.toLocaleString()}</div>
              </div>
              <div className="mt-3">
                <div className="d-flex gap-1">
                  {visitorData.map((val, i) => (
                    <div
                      key={i}
                      className="bg-primary rounded"
                      style={{ width: '8%', height: `${val / 3}px`, opacity: 0.3 + (i / visitorData.length) * 0.7 }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-2 text-muted small">24,635 users increased from last month</div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between">
                <div className="subheader text-muted">Active Users</div>
                <span className={`badge ${stats.activeUserChange >= 0 ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                  {stats.activeUserChange >= 0 ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
                  {Math.abs(stats.activeUserChange)}%
                </span>
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">{stats.activeUsers.toLocaleString()}</div>
              </div>
              <div className="mt-3">
                {/* Circular Progress */}
                <div className="d-flex justify-content-center">
                  <div className="position-relative" style={{ width: '80px', height: '80px' }}>
                    <svg viewBox="0 0 36 36" style={{ transform: 'rotate(-90deg)' }}>
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="var(--tblr-border-color)"
                        strokeWidth="3"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="var(--tblr-primary)"
                        strokeWidth="3"
                        strokeDasharray={`${stats.conversionRate}, 100`}
                      />
                    </svg>
                    <div className="position-absolute top-50 start-50 translate-middle fw-bold">
                      {stats.conversionRate}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between">
                <div className="subheader text-muted">Total Audiences</div>
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">
                  {loading ? <div className="placeholder col-4"></div> : (totalAudiences ?? 0)}
                </div>
              </div>
              <div className="mt-3 d-flex gap-2">
                <Link href="/audiences" className="btn btn-sm btn-outline-primary flex-fill">
                  View All
                </Link>
                <Link href="/audiences/create" className="btn btn-sm btn-primary flex-fill">
                  <IconPlus size={14} className="me-1" />
                  New
                </Link>
              </div>
              <div className="mt-2 text-muted small">
                {apiStatus === 'connected' && <span className="status status-green">API Connected</span>}
                {apiStatus === 'error' && <span className="status status-red">API Error</span>}
                {apiStatus === 'checking' && <span className="status">Checking...</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between">
                <div className="subheader text-muted">Available Credits</div>
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">
                  {loading ? <div className="placeholder col-4"></div> : (credits?.toLocaleString() ?? '-')}
                </div>
              </div>
              <div className="progress mt-3" style={{ height: '8px' }}>
                <div
                  className="progress-bar bg-primary"
                  style={{ width: credits ? `${Math.min((credits / 10000) * 100, 100)}%` : '0%' }}
                />
              </div>
              <div className="mt-2 text-muted small">API usage credits remaining</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Row */}
      <div className="row row-deck row-cards">
        {/* Traffic Overview Chart */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Traffic Overview</h3>
              <div className="card-actions">
                <div className="btn-group">
                  <button className="btn btn-sm active">7 Days</button>
                  <button className="btn btn-sm">30 Days</button>
                  <button className="btn btn-sm">90 Days</button>
                </div>
              </div>
            </div>
            <div className="card-body pt-0">
              <div className="row mb-3">
                <div className="col-auto">
                  <div className="d-flex align-items-center">
                    <span className="bg-primary rounded me-2" style={{ width: '12px', height: '12px' }}></span>
                    <span className="text-muted">Visitors</span>
                  </div>
                </div>
                <div className="col-auto">
                  <div className="d-flex align-items-center">
                    <span className="bg-green rounded me-2" style={{ width: '12px', height: '12px' }}></span>
                    <span className="text-muted">Conversions</span>
                  </div>
                </div>
              </div>
              {/* Simple Bar Chart */}
              <div className="d-flex align-items-end justify-content-between" style={{ height: '200px' }}>
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                  <div key={day} className="d-flex flex-column align-items-center" style={{ flex: 1 }}>
                    <div className="d-flex gap-1 mb-2" style={{ height: '150px', alignItems: 'flex-end' }}>
                      <div
                        className="bg-primary rounded"
                        style={{ width: '16px', height: `${visitorData[i] * 1.2}px` }}
                      />
                      <div
                        className="bg-green rounded"
                        style={{ width: '16px', height: `${conversionData[i] * 2.5}px` }}
                      />
                    </div>
                    <span className="text-muted small">{day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Traffic Sources */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Traffic Sources</h3>
            </div>
            <div className="card-body pt-0">
              <div className="mb-4">
                {trafficSources.map((source, i) => (
                  <div key={source.name} className={i > 0 ? 'mt-3' : ''}>
                    <div className="d-flex justify-content-between mb-1">
                      <span className="text-muted">{source.name}</span>
                      <span className="fw-semibold">{source.value.toLocaleString()}</span>
                    </div>
                    <div className="progress" style={{ height: '6px' }}>
                      <div className={`progress-bar ${source.color}`} style={{ width: `${source.percentage}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Audiences Table */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Recent Audiences</h3>
              <div className="card-actions">
                <Link href="/audiences" className="btn btn-sm btn-outline-primary">
                  View all
                </Link>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Records</th>
                    <th>Created</th>
                    <th className="w-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                        Loading audiences...
                      </td>
                    </tr>
                  ) : audiences.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        No audiences found.{' '}
                        <Link href="/audiences/create" className="text-primary">Create your first audience</Link>
                      </td>
                    </tr>
                  ) : (
                    audiences.map((audience) => (
                      <tr key={audience.id || audience.audienceId}>
                        <td>
                          <div className="d-flex align-items-center">
                            <span className="avatar avatar-sm bg-primary-lt me-2">
                              <IconUsers size={16} />
                            </span>
                            <span className="text-reset">{audience.name || 'Unnamed'}</span>
                          </div>
                        </td>
                        <td>
                          <code className="small text-muted">
                            {(audience.id || audience.audienceId || '').substring(0, 8)}...
                          </code>
                        </td>
                        <td>{audience.total_records?.toLocaleString() || '-'}</td>
                        <td className="text-muted">
                          {audience.created_at
                            ? new Date(audience.created_at).toLocaleDateString()
                            : '-'}
                        </td>
                        <td>
                          <Link
                            href={`/audiences/${audience.id || audience.audienceId}`}
                            className="btn btn-sm btn-ghost-primary"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Recent Activity</h3>
            </div>
            <div className="list-group list-group-flush">
              {recentActivity.map((activity, i) => (
                <div key={i} className="list-group-item">
                  <div className="d-flex align-items-center">
                    <span className="avatar avatar-sm bg-primary-lt me-3">
                      {activity.icon}
                    </span>
                    <div className="flex-fill">
                      <div className="small">{activity.message}</div>
                      <div className="text-muted small">{activity.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card-footer text-center">
              <a href="#" className="text-muted small">View all activity</a>
            </div>
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="col-12">
          <div className="row row-cards">
            <div className="col-6 col-sm-4 col-lg-2">
              <div className="card card-sm">
                <div className="card-body d-flex align-items-center">
                  <span className="avatar bg-primary-lt me-3">
                    <IconCode size={20} />
                  </span>
                  <div>
                    <div className="fw-semibold">{pixelCount} Pixels</div>
                    <div className="text-muted small">Active tracking</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-6 col-sm-4 col-lg-2">
              <div className="card card-sm">
                <div className="card-body d-flex align-items-center">
                  <span className="avatar bg-green-lt me-3">
                    <IconClick size={20} />
                  </span>
                  <div>
                    <div className="fw-semibold">15,694</div>
                    <div className="text-muted small">Events today</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-6 col-sm-4 col-lg-2">
              <div className="card card-sm">
                <div className="card-body d-flex align-items-center">
                  <span className="avatar bg-azure-lt me-3">
                    <IconWorld size={20} />
                  </span>
                  <div>
                    <div className="fw-semibold">42</div>
                    <div className="text-muted small">Countries</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-6 col-sm-4 col-lg-2">
              <div className="card card-sm">
                <div className="card-body d-flex align-items-center">
                  <span className="avatar bg-yellow-lt me-3">
                    <IconDeviceDesktop size={20} />
                  </span>
                  <div>
                    <div className="fw-semibold">68%</div>
                    <div className="text-muted small">Desktop</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-6 col-sm-4 col-lg-2">
              <div className="card card-sm">
                <div className="card-body d-flex align-items-center">
                  <span className="avatar bg-red-lt me-3">
                    <IconDeviceMobile size={20} />
                  </span>
                  <div>
                    <div className="fw-semibold">32%</div>
                    <div className="text-muted small">Mobile</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="col-6 col-sm-4 col-lg-2">
              <div className="card card-sm">
                <div className="card-body d-flex align-items-center">
                  <span className="avatar bg-purple-lt me-3">
                    <IconChartBar size={20} />
                  </span>
                  <div>
                    <div className="fw-semibold">4.2%</div>
                    <div className="text-muted small">Bounce Rate</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Pages */}
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Top Pages</h3>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Views</th>
                    <th>Unique</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {topPages.map((page) => (
                    <tr key={page.page}>
                      <td>
                        <code className="text-muted">{page.page}</code>
                      </td>
                      <td>{page.views.toLocaleString()}</td>
                      <td>{page.unique.toLocaleString()}</td>
                      <td>
                        <div className="progress" style={{ width: '100px', height: '4px' }}>
                          <div
                            className="progress-bar bg-primary"
                            style={{ width: `${(page.views / topPages[0].views) * 100}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Quick Actions</h3>
            </div>
            <div className="card-body">
              <div className="row g-3">
                <div className="col-6">
                  <Link href="/audiences/create" className="card card-sm card-link card-link-pop">
                    <div className="card-body">
                      <div className="d-flex align-items-center">
                        <span className="avatar bg-primary me-3">
                          <IconPlus size={20} className="text-white" />
                        </span>
                        <div>
                          <div className="fw-semibold">Create Audience</div>
                          <div className="text-muted small">Build a new audience</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
                <div className="col-6">
                  <Link href="/enrich" className="card card-sm card-link card-link-pop">
                    <div className="card-body">
                      <div className="d-flex align-items-center">
                        <span className="avatar bg-green me-3">
                          <IconSearch size={20} className="text-white" />
                        </span>
                        <div>
                          <div className="fw-semibold">Enrich Contact</div>
                          <div className="text-muted small">Find contact details</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
                <div className="col-6">
                  <Link href="/pixels" className="card card-sm card-link card-link-pop">
                    <div className="card-body">
                      <div className="d-flex align-items-center">
                        <span className="avatar bg-azure me-3">
                          <IconCode size={20} className="text-white" />
                        </span>
                        <div>
                          <div className="fw-semibold">Manage Pixels</div>
                          <div className="text-muted small">Setup tracking</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
                <div className="col-6">
                  <Link href="/settings" className="card card-sm card-link card-link-pop">
                    <div className="card-body">
                      <div className="d-flex align-items-center">
                        <span className="avatar bg-yellow me-3">
                          <IconWorld size={20} className="text-white" />
                        </span>
                        <div>
                          <div className="fw-semibold">Settings</div>
                          <div className="text-muted small">Configure API</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
