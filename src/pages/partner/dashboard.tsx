import { useState, useEffect } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconEye,
  IconCode,
  IconLoader2,
  IconChartBar,
  IconUser,
  IconStarFilled,
  IconArrowUpRight,
  IconArrowDownRight,
  IconPlus,
} from '@tabler/icons-react';

interface DashboardStats {
  overview: {
    totalVisitors: number;
    identifiedVisitors: number;
    enrichedVisitors: number;
    visitorsToday: number;
    visitorChange: number;
    totalEvents: number;
    eventsToday: number;
    activePixels: number;
    avgLeadScore: number;
  };
  charts: {
    eventsByDay: { date: string; day: string; events: number }[];
    pageviewsByDay: { date: string; day: string; pageviews: number }[];
    eventTypes: { type: string; count: number; percentage: number }[];
  };
  topPages: { page: string; views: number }[];
  recentVisitors: {
    id: string;
    full_name: string | null;
    email: string | null;
    company: string | null;
    lead_score: number;
    last_seen_at: string;
    is_identified: boolean;
    is_enriched: boolean;
  }[];
  pixels: { id: string; name: string; domain: string; status: string; events_count: number }[];
}

export default function PartnerDashboard() {
  const { user, userProfile, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user) {
      loadDashboardStats();
    }
  }, [authLoading, user]);

  const loadDashboardStats = async () => {
    try {
      const response = await fetch('/api/dashboard/stats');
      const data = await response.json();
      if (response.ok) {
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getScoreBadgeClass = (score: number) => {
    if (score >= 70) return 'bg-green-lt text-green';
    if (score >= 40) return 'bg-yellow-lt text-yellow';
    return 'bg-red-lt text-red';
  };

  const maxEvents = stats?.charts.eventsByDay
    ? Math.max(...stats.charts.eventsByDay.map(d => d.events), 1)
    : 1;

  const eventTypeColors: Record<string, string> = {
    pageview: 'bg-primary',
    click: 'bg-green',
    scroll: 'bg-azure',
    heartbeat: 'bg-yellow',
    exit: 'bg-red',
    form_submit: 'bg-purple',
  };

  const userName = userProfile?.email?.split('@')[0] || 'Partner';

  if (authLoading) {
    return (
      <Layout title="Partner Dashboard" pageTitle="Partner Dashboard">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <IconLoader2 size={48} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Partner Dashboard" pageTitle="Partner Dashboard">
      {/* Welcome Banner */}
      <div className="card mb-4" style={{ background: 'linear-gradient(135deg, var(--tblr-primary) 0%, #1a56db 100%)' }}>
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-lg-7">
              <h2 className="text-white mb-2">Welcome back, {userName}!</h2>
              <p className="text-white opacity-75 mb-3">
                You have {stats?.overview.activePixels || 0} active pixel{(stats?.overview.activePixels || 0) !== 1 ? 's' : ''} tracking visitor data.
                {stats?.overview.totalVisitors ? ` ${stats.overview.totalVisitors} visitors captured.` : ''}
              </p>
              <div className="btn-list">
                <Link href="/pixels" className="btn bg-white text-primary">
                  <IconCode size={18} className="me-1" />
                  Manage Pixels
                </Link>
                <Link href="/visitors" className="btn btn-outline-light">
                  <IconEye size={18} className="me-1" />
                  View Visitors
                </Link>
              </div>
            </div>
            <div className="col-lg-5 d-none d-lg-block text-end">
              <div className="row text-white text-center">
                <div className="col-4">
                  <div className="display-6 fw-bold">{stats?.overview.totalVisitors?.toLocaleString() || 0}</div>
                  <div className="opacity-75 small">Total Visitors</div>
                </div>
                <div className="col-4">
                  <div className="display-6 fw-bold">{stats?.overview.totalEvents?.toLocaleString() || 0}</div>
                  <div className="opacity-75 small">Total Events</div>
                </div>
                <div className="col-4">
                  <div className="display-6 fw-bold">{stats?.overview.avgLeadScore || 0}</div>
                  <div className="opacity-75 small">Avg Score</div>
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
                <div className="subheader text-muted">Visitors Today</div>
                {stats?.overview.visitorChange !== 0 && (
                  <span className={`badge ${(stats?.overview.visitorChange || 0) >= 0 ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                    {(stats?.overview.visitorChange || 0) >= 0 ? <IconArrowUpRight size={14} /> : <IconArrowDownRight size={14} />}
                    {Math.abs(stats?.overview.visitorChange || 0)}%
                  </span>
                )}
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">{stats?.overview.visitorsToday?.toLocaleString() || 0}</div>
              </div>
              <div className="mt-3">
                <div className="d-flex gap-1">
                  {stats?.charts.eventsByDay.map((day, i) => (
                    <div
                      key={day.date}
                      className="bg-primary rounded"
                      style={{
                        width: '14%',
                        height: `${Math.max((day.events / maxEvents) * 40, 4)}px`,
                        opacity: 0.3 + (i / 7) * 0.7
                      }}
                      title={`${day.day}: ${day.events} events`}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-2 text-muted small">
                {stats?.overview.totalVisitors || 0} total visitors captured
              </div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between">
                <div className="subheader text-muted">Identified Visitors</div>
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">{stats?.overview.identifiedVisitors?.toLocaleString() || 0}</div>
              </div>
              <div className="mt-3">
                <div className="progress" style={{ height: '8px' }}>
                  <div
                    className="progress-bar bg-green"
                    style={{
                      width: stats?.overview.totalVisitors
                        ? `${(stats.overview.identifiedVisitors / stats.overview.totalVisitors) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>
              <div className="mt-2 text-muted small">
                {stats?.overview.totalVisitors
                  ? `${Math.round((stats.overview.identifiedVisitors / stats.overview.totalVisitors) * 100)}% identification rate`
                  : 'No visitors yet'
                }
              </div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between">
                <div className="subheader text-muted">Events Today</div>
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">{stats?.overview.eventsToday?.toLocaleString() || 0}</div>
              </div>
              <div className="mt-3 d-flex gap-2">
                <Link href="/visitors" className="btn btn-sm btn-outline-primary flex-fill">
                  View Visitors
                </Link>
              </div>
              <div className="mt-2 text-muted small">
                {stats?.overview.totalEvents?.toLocaleString() || 0} total events tracked
              </div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center justify-content-between">
                <div className="subheader text-muted">Active Pixels</div>
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">{stats?.overview.activePixels || 0}</div>
              </div>
              <div className="mt-3 d-flex gap-2">
                <Link href="/pixels" className="btn btn-sm btn-outline-primary flex-fill">
                  Manage Pixels
                </Link>
              </div>
              <div className="mt-2 text-muted small">
                Tracking your website visitors
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Row */}
      <div className="row row-deck row-cards">
        {/* Events Chart */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Events (Last 7 Days)</h3>
            </div>
            <div className="card-body pt-0">
              {loading ? (
                <div className="text-center py-4">
                  <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                </div>
              ) : !stats || stats.charts.eventsByDay.every(d => d.events === 0) ? (
                <div className="text-center py-4 text-muted">
                  <IconChartBar size={48} className="mb-2 opacity-50" />
                  <p>No events recorded yet. Events will appear here once your pixel starts tracking.</p>
                </div>
              ) : (
                <>
                  <div className="row mb-3">
                    <div className="col-auto">
                      <div className="d-flex align-items-center">
                        <span className="bg-primary rounded me-2" style={{ width: '12px', height: '12px' }}></span>
                        <span className="text-muted">Events</span>
                      </div>
                    </div>
                  </div>
                  <div className="d-flex align-items-end justify-content-between" style={{ height: '200px' }}>
                    {stats.charts.eventsByDay.map((day) => (
                      <div key={day.date} className="d-flex flex-column align-items-center" style={{ flex: 1 }}>
                        <div className="d-flex gap-1 mb-2" style={{ height: '150px', alignItems: 'flex-end' }}>
                          <div
                            className="bg-primary rounded"
                            style={{
                              width: '24px',
                              height: `${Math.max((day.events / maxEvents) * 150, 4)}px`
                            }}
                            title={`${day.events} events`}
                          />
                        </div>
                        <span className="text-muted small">{day.day}</span>
                        <span className="text-muted small fw-semibold">{day.events}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Event Types */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Event Types</h3>
            </div>
            <div className="card-body pt-0">
              {loading || !stats || stats.charts.eventTypes.length === 0 ? (
                <div className="text-center py-4 text-muted">
                  <p>No events yet</p>
                </div>
              ) : (
                <div className="mb-4">
                  {stats.charts.eventTypes.map((eventType, i) => (
                    <div key={eventType.type} className={i > 0 ? 'mt-3' : ''}>
                      <div className="d-flex justify-content-between mb-1">
                        <span className="text-muted text-capitalize">{eventType.type.replace('_', ' ')}</span>
                        <span className="fw-semibold">{eventType.count.toLocaleString()}</span>
                      </div>
                      <div className="progress" style={{ height: '6px' }}>
                        <div
                          className={`progress-bar ${eventTypeColors[eventType.type] || 'bg-secondary'}`}
                          style={{ width: `${eventType.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Visitors */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Recent Visitors</h3>
              <div className="card-actions">
                <Link href="/visitors" className="btn btn-sm btn-outline-primary">
                  View all
                </Link>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Score</th>
                    <th>Company</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  {loading || !stats ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                        Loading visitors...
                      </td>
                    </tr>
                  ) : stats.recentVisitors.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center text-muted py-4">
                        No visitors yet.{' '}
                        <Link href="/pixels" className="text-primary">Set up your pixel</Link> to start tracking.
                      </td>
                    </tr>
                  ) : (
                    stats.recentVisitors.map((visitor) => (
                      <tr key={visitor.id}>
                        <td>
                          <div className="d-flex align-items-center">
                            <span className={`avatar avatar-sm me-2 ${visitor.is_identified ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                              <IconUser size={16} />
                            </span>
                            <div>
                              <div className="d-flex align-items-center">
                                <span className="text-reset">
                                  {visitor.full_name || visitor.email?.split('@')[0] || 'Anonymous'}
                                </span>
                                {visitor.is_enriched && (
                                  <IconStarFilled size={12} className="ms-1 text-yellow" />
                                )}
                              </div>
                              {visitor.email && (
                                <div className="text-muted small">{visitor.email}</div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${getScoreBadgeClass(visitor.lead_score)}`}>
                            {visitor.lead_score}
                          </span>
                        </td>
                        <td className="text-muted">{visitor.company || '-'}</td>
                        <td className="text-muted">{formatTimeAgo(visitor.last_seen_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Active Pixels */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Your Pixels</h3>
              <div className="card-actions">
                <Link href="/pixels" className="btn btn-sm btn-outline-primary">
                  Manage
                </Link>
              </div>
            </div>
            <div className="list-group list-group-flush">
              {loading || !stats || stats.pixels.length === 0 ? (
                <div className="list-group-item text-center py-4">
                  <IconCode size={32} className="text-muted mb-2" />
                  <p className="text-muted mb-2">No pixels yet</p>
                  <Link href="/pixels" className="btn btn-primary btn-sm">
                    <IconPlus size={16} className="me-1" />
                    Create Pixel
                  </Link>
                </div>
              ) : (
                stats.pixels.map((pixel) => (
                  <div key={pixel.id} className="list-group-item">
                    <div className="d-flex align-items-center">
                      <span className={`avatar avatar-sm me-3 ${pixel.status === 'active' ? 'bg-green-lt' : 'bg-yellow-lt'}`}>
                        <IconCode size={16} />
                      </span>
                      <div className="flex-fill">
                        <div className="fw-semibold">{pixel.name}</div>
                        <div className="text-muted small">{pixel.domain}</div>
                      </div>
                      <div className="text-end">
                        <div className={`badge ${pixel.status === 'active' ? 'bg-green-lt text-green' : 'bg-yellow-lt text-yellow'}`}>
                          {pixel.status}
                        </div>
                        <div className="text-muted small">{pixel.events_count} events</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Top Pages */}
        <div className="col-lg-12">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Top Pages (Last 7 Days)</h3>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Views</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loading || !stats || stats.topPages.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-4">
                        No page views recorded yet
                      </td>
                    </tr>
                  ) : (
                    stats.topPages.map((page) => (
                      <tr key={page.page}>
                        <td>
                          <code className="text-muted">{page.page}</code>
                        </td>
                        <td>{page.views.toLocaleString()}</td>
                        <td>
                          <div className="progress" style={{ width: '100px', height: '4px' }}>
                            <div
                              className="progress-bar bg-primary"
                              style={{ width: `${(page.views / stats.topPages[0].views) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
