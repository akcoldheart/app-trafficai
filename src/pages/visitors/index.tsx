import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import {
  IconUser,
  IconMail,
  IconBuilding,
  IconWorld,
  IconClock,
  IconEye,
  IconClick,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconFilter,
  IconChevronLeft,
  IconChevronRight,
  IconStar,
  IconStarFilled,
  IconBrandLinkedin,
  IconDeviceDesktop,
  IconExternalLink,
} from '@tabler/icons-react';

interface Visitor {
  id: string;
  visitor_id: string;
  pixel_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  company: string | null;
  job_title: string | null;
  linkedin_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  ip_address: string | null;
  user_agent: string | null;
  first_seen_at: string;
  last_seen_at: string;
  first_page_url: string | null;
  first_referrer: string | null;
  total_pageviews: number;
  total_sessions: number;
  total_time_on_site: number;
  max_scroll_depth: number;
  total_clicks: number;
  form_submissions: number;
  lead_score: number;
  is_identified: boolean;
  is_enriched: boolean;
  metadata: Record<string, unknown> | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface Pixel {
  id: string;
  name: string;
  domain: string;
}

export default function Visitors() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedPixel, setSelectedPixel] = useState<string>('');
  const [identifiedOnly, setIdentifiedOnly] = useState(false);
  const [enrichedOnly, setEnrichedOnly] = useState(false);
  const [minScore, setMinScore] = useState<string>('');
  const [sortBy, setSortBy] = useState('last_seen_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const fetchPixels = useCallback(async () => {
    try {
      const response = await fetch('/api/pixels');
      const data = await response.json();
      if (response.ok) {
        setPixels(data.pixels || []);
      }
    } catch (err) {
      console.error('Error fetching pixels:', err);
    }
  }, []);

  const fetchVisitors = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
        sort: sortBy,
        order: sortOrder,
      });

      if (search) params.set('search', search);
      if (selectedPixel) params.set('pixel_id', selectedPixel);
      if (identifiedOnly) params.set('identified_only', 'true');
      if (enrichedOnly) params.set('enriched_only', 'true');
      if (minScore) params.set('min_score', minScore);

      const response = await fetch(`/api/visitors?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch visitors');
      }

      setVisitors(data.visitors || []);
      setPagination(data.pagination);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, selectedPixel, identifiedOnly, enrichedOnly, minScore, sortBy, sortOrder]);

  useEffect(() => {
    fetchPixels();
  }, [fetchPixels]);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPagination(prev => ({ ...prev, page: 1 }));
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

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins < 60) return `${mins}m ${secs}s`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'bg-green';
    if (score >= 40) return 'bg-yellow';
    return 'bg-red';
  };

  const getScoreBadgeClass = (score: number) => {
    if (score >= 70) return 'bg-green-lt text-green';
    if (score >= 40) return 'bg-yellow-lt text-yellow';
    return 'bg-red-lt text-red';
  };

  const getVisitorName = (visitor: Visitor) => {
    if (visitor.full_name) return visitor.full_name;
    if (visitor.first_name || visitor.last_name) {
      return `${visitor.first_name || ''} ${visitor.last_name || ''}`.trim();
    }
    if (visitor.email) return visitor.email.split('@')[0];
    return 'Anonymous Visitor';
  };

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return { browser: 'Unknown', os: 'Unknown' };

    let browser = 'Unknown';
    let os = 'Unknown';

    if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Edge')) browser = 'Edge';

    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
    else if (ua.includes('Android')) os = 'Android';

    return { browser, os };
  };

  return (
    <Layout title="Visitors" pageTitle="Visitors" pagePretitle="Pixel Tracking">
      <div className="row g-4">
        {/* Filters */}
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <form onSubmit={handleSearch}>
                <div className="row g-3 align-items-end">
                  <div className="col-md-3">
                    <label className="form-label">Search</label>
                    <div className="input-icon">
                      <span className="input-icon-addon">
                        <IconSearch size={16} />
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Email, name, or company..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Pixel</label>
                    <select
                      className="form-select"
                      value={selectedPixel}
                      onChange={(e) => {
                        setSelectedPixel(e.target.value);
                        setPagination(prev => ({ ...prev, page: 1 }));
                      }}
                    >
                      <option value="">All Pixels</option>
                      {pixels.map((pixel) => (
                        <option key={pixel.id} value={pixel.id}>
                          {pixel.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Min Score</label>
                    <select
                      className="form-select"
                      value={minScore}
                      onChange={(e) => {
                        setMinScore(e.target.value);
                        setPagination(prev => ({ ...prev, page: 1 }));
                      }}
                    >
                      <option value="">Any</option>
                      <option value="20">20+</option>
                      <option value="40">40+</option>
                      <option value="60">60+</option>
                      <option value="80">80+</option>
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Sort By</label>
                    <select
                      className="form-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="last_seen_at">Last Seen</option>
                      <option value="first_seen_at">First Seen</option>
                      <option value="lead_score">Lead Score</option>
                      <option value="total_pageviews">Page Views</option>
                    </select>
                  </div>
                  <div className="col-md-1">
                    <label className="form-label">&nbsp;</label>
                    <div className="btn-group w-100">
                      <button
                        type="button"
                        className={`btn ${sortOrder === 'desc' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setSortOrder('desc')}
                        title="Descending"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={`btn ${sortOrder === 'asc' ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => setSortOrder('asc')}
                        title="Ascending"
                      >
                        ↑
                      </button>
                    </div>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">&nbsp;</label>
                    <div className="d-flex gap-2">
                      <button type="submit" className="btn btn-primary flex-fill">
                        <IconFilter size={16} className="me-1" />
                        Filter
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={fetchVisitors}
                        title="Refresh"
                      >
                        <IconRefresh size={16} />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="row mt-3">
                  <div className="col-12">
                    <div className="form-check form-check-inline">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="identifiedOnly"
                        checked={identifiedOnly}
                        onChange={(e) => {
                          setIdentifiedOnly(e.target.checked);
                          setPagination(prev => ({ ...prev, page: 1 }));
                        }}
                      />
                      <label className="form-check-label" htmlFor="identifiedOnly">
                        Identified only
                      </label>
                    </div>
                    <div className="form-check form-check-inline">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="enrichedOnly"
                        checked={enrichedOnly}
                        onChange={(e) => {
                          setEnrichedOnly(e.target.checked);
                          setPagination(prev => ({ ...prev, page: 1 }));
                        }}
                      />
                      <label className="form-check-label" htmlFor="enrichedOnly">
                        Enriched only
                      </label>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Visitors List */}
        <div className={selectedVisitor ? 'col-lg-7' : 'col-12'}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                {loading ? 'Loading...' : `${pagination.total} Visitors`}
              </h3>
            </div>
            {loading ? (
              <div className="card-body text-center py-5">
                <IconLoader2 size={48} className="text-muted mb-3" style={{ animation: 'spin 1s linear infinite' }} />
                <p className="text-muted">Loading visitors...</p>
              </div>
            ) : error ? (
              <div className="card-body">
                <div className="alert alert-danger mb-0">{error}</div>
              </div>
            ) : visitors.length === 0 ? (
              <div className="card-body text-center py-5">
                <IconUser size={48} className="text-muted mb-3" />
                <h4>No visitors found</h4>
                <p className="text-muted">Visitors will appear here once your pixel starts tracking.</p>
              </div>
            ) : (
              <>
                <div className="table-responsive">
                  <table className="table table-vcenter card-table table-hover">
                    <thead>
                      <tr>
                        <th>Visitor</th>
                        <th>Score</th>
                        <th>Activity</th>
                        <th>Last Seen</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visitors.map((visitor) => (
                        <tr
                          key={visitor.id}
                          className={selectedVisitor?.id === visitor.id ? 'bg-primary-lt' : ''}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setSelectedVisitor(visitor)}
                        >
                          <td>
                            <div className="d-flex align-items-center">
                              <span className={`avatar avatar-sm me-2 ${visitor.is_identified ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                                {visitor.is_identified ? (
                                  <IconUser size={16} />
                                ) : (
                                  <IconUser size={16} className="text-muted" />
                                )}
                              </span>
                              <div>
                                <div className="d-flex align-items-center">
                                  <span className="fw-semibold">{getVisitorName(visitor)}</span>
                                  {visitor.is_enriched && (
                                    <IconStarFilled size={12} className="ms-1 text-yellow" title="Enriched" />
                                  )}
                                </div>
                                {visitor.email && (
                                  <div className="text-muted small">{visitor.email}</div>
                                )}
                                {visitor.company && (
                                  <div className="text-muted small">{visitor.company}</div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${getScoreBadgeClass(visitor.lead_score)}`}>
                              {visitor.lead_score}
                            </span>
                          </td>
                          <td>
                            <div className="d-flex gap-3 text-muted small">
                              <span title="Page Views">
                                <IconEye size={14} className="me-1" />
                                {visitor.total_pageviews}
                              </span>
                              <span title="Clicks">
                                <IconClick size={14} className="me-1" />
                                {visitor.total_clicks}
                              </span>
                              <span title="Sessions">
                                <IconClock size={14} className="me-1" />
                                {visitor.total_sessions}
                              </span>
                            </div>
                          </td>
                          <td className="text-muted">
                            {formatTimeAgo(visitor.last_seen_at)}
                          </td>
                          <td>
                            <IconChevronRight size={16} className="text-muted" />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="card-footer d-flex align-items-center justify-content-between">
                    <p className="m-0 text-muted">
                      Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                      {pagination.total} visitors
                    </p>
                    <div className="btn-group">
                      <button
                        className="btn btn-sm"
                        disabled={pagination.page === 1}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      >
                        <IconChevronLeft size={16} />
                        Prev
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={pagination.page === pagination.totalPages}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      >
                        Next
                        <IconChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Visitor Details Panel */}
        {selectedVisitor && (
          <div className="col-lg-5">
            <div className="card sticky-top" style={{ top: '1rem' }}>
              <div className="card-header">
                <h3 className="card-title">Visitor Details</h3>
                <div className="card-actions">
                  <button
                    className="btn btn-ghost-secondary btn-sm"
                    onClick={() => setSelectedVisitor(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="card-body">
                {/* Header */}
                <div className="d-flex align-items-center mb-4">
                  <span className={`avatar avatar-lg me-3 ${selectedVisitor.is_identified ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                    <IconUser size={24} />
                  </span>
                  <div>
                    <h4 className="mb-0">{getVisitorName(selectedVisitor)}</h4>
                    {selectedVisitor.job_title && (
                      <div className="text-muted">{selectedVisitor.job_title}</div>
                    )}
                    <div className="mt-1">
                      <span className={`badge ${getScoreBadgeClass(selectedVisitor.lead_score)} me-1`}>
                        Score: {selectedVisitor.lead_score}
                      </span>
                      {selectedVisitor.is_identified && (
                        <span className="badge bg-green-lt text-green me-1">Identified</span>
                      )}
                      {selectedVisitor.is_enriched && (
                        <span className="badge bg-yellow-lt text-yellow">Enriched</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contact Info */}
                <div className="mb-4">
                  <h5 className="mb-2">Contact</h5>
                  <div className="list-group list-group-flush">
                    {selectedVisitor.email && (
                      <div className="list-group-item px-0 d-flex align-items-center">
                        <IconMail size={16} className="text-muted me-2" />
                        <a href={`mailto:${selectedVisitor.email}`}>{selectedVisitor.email}</a>
                      </div>
                    )}
                    {selectedVisitor.company && (
                      <div className="list-group-item px-0 d-flex align-items-center">
                        <IconBuilding size={16} className="text-muted me-2" />
                        {selectedVisitor.company}
                      </div>
                    )}
                    {selectedVisitor.linkedin_url && (
                      <div className="list-group-item px-0 d-flex align-items-center">
                        <IconBrandLinkedin size={16} className="text-muted me-2" />
                        <a href={selectedVisitor.linkedin_url} target="_blank" rel="noopener noreferrer">
                          LinkedIn Profile <IconExternalLink size={12} />
                        </a>
                      </div>
                    )}
                    {(selectedVisitor.city || selectedVisitor.country) && (
                      <div className="list-group-item px-0 d-flex align-items-center">
                        <IconWorld size={16} className="text-muted me-2" />
                        {[selectedVisitor.city, selectedVisitor.state, selectedVisitor.country]
                          .filter(Boolean)
                          .join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Activity Stats */}
                <div className="mb-4">
                  <h5 className="mb-2">Activity</h5>
                  <div className="row g-2">
                    <div className="col-6">
                      <div className="card card-sm bg-primary-lt">
                        <div className="card-body text-center">
                          <div className="h3 mb-0">{selectedVisitor.total_pageviews}</div>
                          <div className="text-muted small">Page Views</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="card card-sm bg-green-lt">
                        <div className="card-body text-center">
                          <div className="h3 mb-0">{selectedVisitor.total_sessions}</div>
                          <div className="text-muted small">Sessions</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="card card-sm bg-azure-lt">
                        <div className="card-body text-center">
                          <div className="h3 mb-0">{formatDuration(selectedVisitor.total_time_on_site)}</div>
                          <div className="text-muted small">Time on Site</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="card card-sm bg-yellow-lt">
                        <div className="card-body text-center">
                          <div className="h3 mb-0">{selectedVisitor.max_scroll_depth}%</div>
                          <div className="text-muted small">Max Scroll</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Technical Info */}
                <div className="mb-4">
                  <h5 className="mb-2">Technical</h5>
                  <div className="list-group list-group-flush">
                    <div className="list-group-item px-0">
                      <div className="d-flex justify-content-between">
                        <span className="text-muted">First Seen</span>
                        <span>{new Date(selectedVisitor.first_seen_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="list-group-item px-0">
                      <div className="d-flex justify-content-between">
                        <span className="text-muted">Last Seen</span>
                        <span>{new Date(selectedVisitor.last_seen_at).toLocaleString()}</span>
                      </div>
                    </div>
                    {selectedVisitor.user_agent && (
                      <div className="list-group-item px-0">
                        <div className="d-flex justify-content-between">
                          <span className="text-muted">Device</span>
                          <span>
                            <IconDeviceDesktop size={14} className="me-1" />
                            {parseUserAgent(selectedVisitor.user_agent).browser} / {parseUserAgent(selectedVisitor.user_agent).os}
                          </span>
                        </div>
                      </div>
                    )}
                    {selectedVisitor.first_page_url && (
                      <div className="list-group-item px-0">
                        <div className="text-muted small mb-1">First Page</div>
                        <code className="small">{selectedVisitor.first_page_url}</code>
                      </div>
                    )}
                    {selectedVisitor.first_referrer && (
                      <div className="list-group-item px-0">
                        <div className="text-muted small mb-1">Referrer</div>
                        <code className="small">{selectedVisitor.first_referrer || 'Direct'}</code>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lead Score Breakdown */}
                <div>
                  <h5 className="mb-2">Lead Score Breakdown</h5>
                  <div className="progress mb-2" style={{ height: '24px' }}>
                    <div
                      className={`progress-bar ${getScoreColor(selectedVisitor.lead_score)}`}
                      style={{ width: `${selectedVisitor.lead_score}%` }}
                    >
                      {selectedVisitor.lead_score}/100
                    </div>
                  </div>
                  <div className="text-muted small">
                    Based on: {selectedVisitor.total_pageviews} pageviews,{' '}
                    {selectedVisitor.total_sessions} sessions,{' '}
                    {formatDuration(selectedVisitor.total_time_on_site)} time on site,{' '}
                    {selectedVisitor.form_submissions} form submissions
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
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
