// Traffic AI Dashboard
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconPlus,
  IconSearch,
  IconEye,
  IconArrowUpRight,
  IconArrowDownRight,
  IconCode,
  IconLoader2,
  IconStarFilled,
  IconUser,
  IconChartBar,
  IconUsersGroup,
  IconShieldCheck,
  IconTrophy,
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
    // Admin-only fields
    totalUsers?: number;
    adminCount?: number;
    teamCount?: number;
    userCount?: number;
  };
  charts: {
    visitorsByDay: { date: string; day: string; visitors: number }[];
    pageviewsByDay: { date: string; day: string; pageviews: number }[];
    activityTypes: { type: string; count: number; percentage: number }[];
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
    user_id?: string;
  }[];
  pixels: { id: string; name: string; domain: string; status: string; events_count: number; user_id?: string }[];
  // Admin-only: top performing pixels
  topPixels?: {
    pixelId: string;
    name: string;
    domain: string;
    status: string;
    eventsCount: number;
    ownerEmail: string;
    visitorCount: number;
    identifiedCount: number;
    avgLeadScore: number;
  }[];
  // Admin-only: partner performance breakdown
  partnerPerformance?: {
    id: string;
    email: string;
    role: string;
    company: string | null;
    joinedAt: string;
    stats: {
      pixels: number;
      activePixels: number;
      visitors: number;
      events: number;
    };
  }[];
}

export default function Dashboard() {
  const { userProfile, loading: authLoading } = useAuth();
  const isAdmin = userProfile?.role === 'admin';
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    // Wait for auth to finish loading before fetching data
    if (authLoading) return;

    loadDashboardStats();
  }, [authLoading, isAdmin]);

  const loadDashboardStats = async () => {
    try {
      // Admin users get all-partners data
      const endpoint = isAdmin ? '/api/admin/dashboard/stats' : '/api/dashboard/stats';
      const response = await fetch(endpoint);
      const data = await response.json();
      if (response.ok) {
        setStats(data);
      }
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
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

  const maxVisitors = stats?.charts.visitorsByDay
    ? Math.max(...stats.charts.visitorsByDay.map(d => d.visitors), 1)
    : 1;

  const activityTypeColors: Record<string, string> = {
    pageviews: 'bg-primary',
    clicks: 'bg-green',
    sessions: 'bg-azure',
    'form submissions': 'bg-purple',
  };

  return (
    <Layout title="Dashboard" pageTitle={isAdmin ? "Admin Dashboard" : "Dashboard"}>
      {/* Welcome Banner */}
      <div className="card mb-4" style={{ background: isAdmin ? 'linear-gradient(135deg, rgb(137, 38, 220) 0%, rgb(153, 27, 27) 100%)' : 'linear-gradient(135deg, var(--tblr-primary) 0%, #1a56db 100%)' }}>
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-lg-7">
              <h2 className="text-white mb-2">
                {isAdmin ? 'Admin Overview' : 'Welcome back!'}
              </h2>
              <p className="text-white opacity-75 mb-3">
                {isAdmin ? (
                  <>
                    Monitoring {stats?.overview.totalUsers || 0} users across the platform.
                    {stats?.overview.totalVisitors ? ` ${stats.overview.totalVisitors.toLocaleString()} total visitors captured.` : ''}
                  </>
                ) : (
                  <>
                    You have {stats?.overview.activePixels || 0} active pixel{(stats?.overview.activePixels || 0) !== 1 ? 's' : ''} tracking visitor data.
                    {stats?.overview.totalVisitors ? ` ${stats.overview.totalVisitors} visitors captured.` : ''}
                  </>
                )}
              </p>
              <div className="btn-list">
                {isAdmin ? (
                  <>
                    <Link href="/admin/users" className="btn bg-white text-purple">
                      <IconUsersGroup size={18} className="me-1" />
                      Manage Users
                    </Link>
                    <Link href="/admin/roles" className="btn btn-outline-light">
                      <IconShieldCheck size={18} className="me-1" />
                      Manage Roles
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href="/pixels" className="btn bg-white text-primary">
                      <IconCode size={18} className="me-1" />
                      Manage Pixels
                    </Link>
                    <Link href="/visitors" className="btn btn-outline-light">
                      <IconEye size={18} className="me-1" />
                      View Visitors
                    </Link>
                  </>
                )}
              </div>
            </div>
            <div className="col-lg-5 d-none d-lg-block">
              <div className="row text-white text-center" style={{ marginRight: '2rem' }}>
                {isAdmin ? (
                  <>
                    <div className="col-3">
                      <div className="display-6 fw-bold" style={{ whiteSpace: 'nowrap' }}>{stats?.overview.totalUsers || 0}</div>
                      <div className="opacity-75 small">Users</div>
                    </div>
                    <div className="col-3">
                      <div className="display-6 fw-bold" style={{ whiteSpace: 'nowrap' }}>{stats?.overview.activePixels || 0}</div>
                      <div className="opacity-75 small">Pixels</div>
                    </div>
                    <div className="col-3">
                      <div className="display-6 fw-bold" style={{ whiteSpace: 'nowrap' }}>{stats?.overview.totalVisitors?.toLocaleString() || 0}</div>
                      <div className="opacity-75 small">Visitors</div>
                    </div>
                    <div className="col-3">
                      <div className="display-6 fw-bold" style={{ whiteSpace: 'nowrap' }}>{stats?.overview.totalEvents?.toLocaleString() || 0}</div>
                      <div className="opacity-75 small">Events</div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="col-4">
                      <div className="display-6 fw-bold" style={{ whiteSpace: 'nowrap' }}>{stats?.overview.totalVisitors?.toLocaleString() || 0}</div>
                      <div className="opacity-75 small">Total Visitors</div>
                    </div>
                    <div className="col-4">
                      <div className="display-6 fw-bold" style={{ whiteSpace: 'nowrap' }}>{stats?.overview.totalEvents?.toLocaleString() || 0}</div>
                      <div className="opacity-75 small">Total Events</div>
                    </div>
                    <div className="col-4">
                      <div className="display-6 fw-bold" style={{ whiteSpace: 'nowrap' }}>{stats?.overview.avgLeadScore || 0}</div>
                      <div className="opacity-75 small">Avg Score</div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin: User Role Stats */}
      {isAdmin && (
        <div className="row row-deck row-cards mb-4">
          <div className="col-sm-6 col-lg-3">
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center">
                  <span className="avatar bg-red-lt me-3">
                    <IconShieldCheck size={24} />
                  </span>
                  <div>
                    <div className="subheader text-muted">Admin Users</div>
                    <div className="h2 mb-0">{stats?.overview.adminCount || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center">
                  <span className="avatar bg-blue-lt me-3">
                    <IconUsersGroup size={24} />
                  </span>
                  <div>
                    <div className="subheader text-muted">Team Members</div>
                    <div className="h2 mb-0">{stats?.overview.teamCount || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center">
                  <span className="avatar bg-green-lt me-3">
                    <IconUser size={24} />
                  </span>
                  <div>
                    <div className="subheader text-muted">Users</div>
                    <div className="h2 mb-0">{stats?.overview.userCount || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="col-sm-6 col-lg-3">
            <div className="card">
              <div className="card-body">
                <div className="d-flex align-items-center">
                  <span className="avatar bg-purple-lt me-3">
                    <IconTrophy size={24} />
                  </span>
                  <div>
                    <div className="subheader text-muted">Avg Lead Score</div>
                    <div className="h2 mb-0">{stats?.overview.avgLeadScore || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  {stats?.charts.visitorsByDay.map((day, i) => (
                    <div
                      key={day.date}
                      className="bg-primary rounded"
                      style={{
                        width: '14%',
                        height: `${Math.max((day.visitors / maxVisitors) * 40, 4)}px`,
                        opacity: 0.3 + (i / 7) * 0.7
                      }}
                      title={`${day.day}: ${day.visitors} new visitors`}
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
                <div className="subheader text-muted">Enriched Visitors</div>
              </div>
              <div className="d-flex align-items-baseline mt-2">
                <div className="h1 mb-0 me-2">{stats?.overview.enrichedVisitors?.toLocaleString() || 0}</div>
              </div>
              <div className="mt-3">
                <div className="progress" style={{ height: '8px' }}>
                  <div
                    className="progress-bar bg-purple"
                    style={{
                      width: stats?.overview.totalVisitors
                        ? `${(stats.overview.enrichedVisitors / stats.overview.totalVisitors) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
              </div>
              <div className="mt-2 text-muted small">
                {stats?.overview.totalVisitors
                  ? `${Math.round(((stats?.overview.enrichedVisitors || 0) / stats.overview.totalVisitors) * 100)}% enrichment rate`
                  : 'No visitors yet'
                }
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Row */}
      <div className="row row-deck row-cards mb-4">
        {/* Admin: Top Performing Pixels (replaces Events chart for admins) */}
        {isAdmin && stats?.topPixels && stats.topPixels.length > 0 && (
          <div className="col-12">
            <div className="card">
              <div className="card-header border-0">
                <h3 className="card-title">
                  <IconCode size={20} className="me-2 text-primary" />
                  Top Performing Pixels
                </h3>
                {stats.topPixels.length > 10 && (
                  <div className="card-actions">
                    <Link href="/pixels" className="btn btn-sm btn-outline-primary">
                      View all
                    </Link>
                  </div>
                )}
              </div>
              <div className="table-responsive">
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th style={{ width: '40px' }}>#</th>
                      <th>Pixel</th>
                      <th>Owner</th>
                      <th className="text-center">Visitors</th>
                      <th className="text-center">Identified</th>
                      <th className="text-center">Avg Score</th>
                      <th className="text-center">Events</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topPixels.slice(0, 10).map((pixel, index) => {
                      const maxVisitors = stats.topPixels?.[0]?.visitorCount || 1;
                      const visitorPercent = (pixel.visitorCount / maxVisitors) * 100;
                      const identifiedPercent = pixel.visitorCount > 0
                        ? Math.round((pixel.identifiedCount / pixel.visitorCount) * 100)
                        : 0;
                      return (
                        <tr key={pixel.pixelId}>
                          <td className="text-muted">{index + 1}</td>
                          <td>
                            <div className="d-flex align-items-center">
                              <span className={`avatar avatar-sm me-2 ${pixel.status === 'active' ? 'bg-green-lt' : 'bg-yellow-lt'}`}>
                                <IconCode size={16} />
                              </span>
                              <div>
                                <div className="fw-semibold">{pixel.name}</div>
                                <div className="text-muted small">{pixel.domain}</div>
                              </div>
                            </div>
                          </td>
                          <td className="text-muted">{pixel.ownerEmail}</td>
                          <td>
                            <div className="d-flex align-items-center justify-content-center">
                              <span className="fw-semibold me-2">{pixel.visitorCount.toLocaleString()}</span>
                              <div className="progress" style={{ width: '60px', height: '6px' }}>
                                <div
                                  className="progress-bar bg-primary"
                                  style={{ width: `${visitorPercent}%` }}
                                />
                              </div>
                            </div>
                          </td>
                          <td className="text-center">
                            <span className="fw-semibold">{pixel.identifiedCount.toLocaleString()}</span>
                            <span className="text-muted small ms-1">({identifiedPercent}%)</span>
                          </td>
                          <td className="text-center">
                            <span className={`badge ${getScoreBadgeClass(pixel.avgLeadScore)}`}>
                              {pixel.avgLeadScore}
                            </span>
                          </td>
                          <td className="text-center fw-semibold">{pixel.eventsCount.toLocaleString()}</td>
                          <td className="text-center">
                            <span className={`badge ${pixel.status === 'active' ? 'bg-green-lt text-green' : 'bg-yellow-lt text-yellow'}`}>
                              {pixel.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {stats.topPixels.length > 10 && (
                <div className="card-footer text-center">
                  <Link href="/pixels" className="text-primary">
                    View all {stats.topPixels.length} pixels
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Non-admin: New Visitors Chart */}
        {!isAdmin && (
          <div className="col-lg-8">
            <div className="card">
              <div className="card-header border-0">
                <h3 className="card-title">New Visitors (Last 7 Days)</h3>
              </div>
              <div className="card-body pt-0">
                {!stats ? (
                  <div className="text-center py-4">
                    <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : stats.charts.visitorsByDay.every(d => d.visitors === 0) ? (
                  <div className="text-center py-4 text-muted">
                    <IconChartBar size={48} className="mb-2 opacity-50" />
                    <p>No visitors recorded yet. Visitors will appear here once your pixel starts tracking.</p>
                  </div>
                ) : (
                  <>
                    <div className="row mb-3">
                      <div className="col-auto">
                        <div className="d-flex align-items-center">
                          <span className="bg-primary rounded me-2" style={{ width: '12px', height: '12px' }}></span>
                          <span className="text-muted">New Visitors</span>
                        </div>
                      </div>
                    </div>
                    <div className="d-flex align-items-end justify-content-between" style={{ height: '200px' }}>
                      {stats.charts.visitorsByDay.map((day) => (
                        <div key={day.date} className="d-flex flex-column align-items-center" style={{ flex: 1 }}>
                          <div className="d-flex gap-1 mb-2" style={{ height: '150px', alignItems: 'flex-end' }}>
                            <div
                              className="bg-primary rounded"
                              style={{
                                width: '24px',
                                height: `${Math.max((day.visitors / maxVisitors) * 150, 4)}px`
                              }}
                              title={`${day.visitors} new visitors`}
                            />
                          </div>
                          <span className="text-muted small">{day.day}</span>
                          <span className="text-muted small fw-semibold">{day.visitors}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Non-admin: Visitor Activity */}
        {!isAdmin && (
          <div className="col-lg-4">
            <div className="card">
              <div className="card-header border-0">
                <h3 className="card-title">Visitor Activity</h3>
              </div>
              <div className="card-body pt-0">
                {!stats || stats.charts.activityTypes.length === 0 ? (
                  <div className="text-center py-4 text-muted">
                    <p>No visitor activity yet</p>
                  </div>
                ) : (
                  <div className="mb-4">
                    {stats.charts.activityTypes.map((activity, i) => (
                      <div key={activity.type} className={i > 0 ? 'mt-3' : ''}>
                        <div className="d-flex justify-content-between mb-1">
                          <span className="text-muted text-capitalize">{activity.type}</span>
                          <span className="fw-semibold">{activity.count.toLocaleString()}</span>
                        </div>
                        <div className="progress" style={{ height: '6px' }}>
                          <div
                            className={`progress-bar ${activityTypeColors[activity.type] || 'bg-secondary'}`}
                            style={{ width: `${activity.percentage}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
                  {!stats ? (
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
              <h3 className="card-title">{isAdmin ? 'All Pixels' : 'Your Pixels'}</h3>
              <div className="card-actions">
                <Link href="/pixels" className="btn btn-sm btn-outline-primary">
                  Manage
                </Link>
              </div>
            </div>
            <div className="list-group list-group-flush">
              {!stats || stats.pixels.length === 0 ? (
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

      </div>

      {/* Top Pages & Quick Actions */}
      <div className="row row-deck row-cards mb-4">
        {/* Top Pages */}
        <div className="col-lg-6">
          <div className="card">
            <div className="card-header border-0">
              <h3 className="card-title">Top Entry Pages (Last 7 Days)</h3>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Page</th>
                    <th>Visitors</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {!stats || stats.topPages.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-4">
                        No entry pages recorded yet
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
                  <Link href="/visitors" className="card card-sm card-link card-link-pop">
                    <div className="card-body">
                      <div className="d-flex align-items-center">
                        <span className="avatar bg-azure me-3">
                          <IconEye size={20} className="text-white" />
                        </span>
                        <div>
                          <div className="fw-semibold">View Visitors</div>
                          <div className="text-muted small">See who visited</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
                <div className="col-6">
                  <Link href="/pixels" className="card card-sm card-link card-link-pop">
                    <div className="card-body">
                      <div className="d-flex align-items-center">
                        <span className="avatar bg-yellow me-3">
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
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Admin: Partner Performance */}
      {isAdmin && stats?.partnerPerformance && stats.partnerPerformance.length > 0 && (
        <div className="row row-deck row-cards">
          <div className="col-12">
            <div className="card">
              <div className="card-header border-0">
                <h3 className="card-title">
                  <IconTrophy size={20} className="me-2 text-yellow" />
                  User Performance
                </h3>
                <div className="card-actions">
                  <Link href="/admin/users" className="btn btn-sm btn-outline-primary">
                    Manage Users
                  </Link>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th className="text-center">Pixels</th>
                      <th className="text-center">Visitors</th>
                      <th className="text-center">Events</th>
                      <th>Performance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.partnerPerformance.slice(0, 10).map((partner, index) => {
                      const maxEvents = stats.partnerPerformance?.[0]?.stats.events || 1;
                      const performancePercent = (partner.stats.events / maxEvents) * 100;
                      return (
                        <tr key={partner.id}>
                          <td>
                            <div className="d-flex align-items-center">
                              <span className={`avatar avatar-sm me-2 ${
                                partner.role === 'admin' ? 'bg-red-lt' :
                                partner.role === 'team' ? 'bg-blue-lt' : 'bg-green-lt'
                              }`}>
                                {index === 0 ? (
                                  <IconTrophy size={16} className="text-yellow" />
                                ) : (
                                  <IconUser size={16} />
                                )}
                              </span>
                              <div>
                                <div className="fw-semibold">{partner.email}</div>
                                {partner.company && (
                                  <div className="text-muted small">{partner.company}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${
                              partner.role === 'admin' ? 'bg-red-lt text-red' :
                              partner.role === 'team' ? 'bg-blue-lt text-blue' : 'bg-green-lt text-green'
                            }`}>
                              {partner.role}
                            </span>
                          </td>
                          <td className="text-center">
                            <span className="fw-semibold">{partner.stats.activePixels}</span>
                            <span className="text-muted">/{partner.stats.pixels}</span>
                          </td>
                          <td className="text-center fw-semibold">{partner.stats.visitors.toLocaleString()}</td>
                          <td className="text-center fw-semibold">{partner.stats.events.toLocaleString()}</td>
                          <td>
                            <div className="d-flex align-items-center">
                              <div className="flex-fill me-2">
                                <div className="progress" style={{ height: '8px' }}>
                                  <div
                                    className={`progress-bar ${
                                      index === 0 ? 'bg-yellow' :
                                      index === 1 ? 'bg-secondary' :
                                      index === 2 ? 'bg-orange' : 'bg-primary'
                                    }`}
                                    style={{ width: `${performancePercent}%` }}
                                  />
                                </div>
                              </div>
                              <span className="text-muted small" style={{ width: '40px' }}>
                                {Math.round(performancePercent)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {stats.partnerPerformance.length > 10 && (
                <div className="card-footer text-center">
                  <Link href="/admin/users" className="text-primary">
                    View all {stats.partnerPerformance.length} users
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Layout>
  );
}
