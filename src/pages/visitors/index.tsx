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
  IconStarFilled,
  IconBrandLinkedin,
  IconDeviceDesktop,
  IconExternalLink,
  IconX,
  IconArrowsSort,
  IconFileText,
  IconLink,
  IconForms,
  IconPlayerPlay,
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

interface JourneyEvent {
  type: string;
  url?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

interface VisitorDetails {
  visitor: Visitor;
  journey: JourneyEvent[];
  summary: {
    pageviews: number;
    clicks: number;
    scrolls: number;
    forms: number;
    totalTime: number;
  };
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
  const [visitorDetails, setVisitorDetails] = useState<VisitorDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

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

  const fetchVisitorDetails = useCallback(async (visitorId: string) => {
    try {
      setLoadingDetails(true);
      const response = await fetch(`/api/visitors/${visitorId}`);
      const data = await response.json();

      if (response.ok) {
        setVisitorDetails(data);
      } else {
        console.error('Error fetching visitor details:', data.error);
      }
    } catch (err) {
      console.error('Error fetching visitor details:', err);
    } finally {
      setLoadingDetails(false);
    }
  }, []);

  useEffect(() => {
    fetchPixels();
  }, [fetchPixels]);

  useEffect(() => {
    fetchVisitors();
  }, [fetchVisitors]);

  useEffect(() => {
    if (selectedVisitor) {
      fetchVisitorDetails(selectedVisitor.id);
    } else {
      setVisitorDetails(null);
    }
  }, [selectedVisitor, fetchVisitorDetails]);

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
    if (score >= 70) return '#2fb344';
    if (score >= 40) return '#f59f00';
    return '#d63939';
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
      {/* Filters Card */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <form onSubmit={handleSearch}>
            <div className="row g-3 align-items-end">
              <div className="col-lg-3 col-md-6">
                <label className="form-label small text-muted">Search</label>
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
              <div className="col-lg-2 col-md-6">
                <label className="form-label small text-muted">Pixel</label>
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
              <div className="col-lg-2 col-md-4">
                <label className="form-label small text-muted">Min Score</label>
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
              <div className="col-lg-2 col-md-4">
                <label className="form-label small text-muted">Sort By</label>
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
              <div className="col-lg-3 col-md-4">
                <label className="form-label small text-muted">&nbsp;</label>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className={`btn btn-icon ${sortOrder === 'desc' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => setSortOrder('desc')}
                    title="Newest first"
                  >
                    <IconArrowsSort size={18} />
                  </button>
                  <button type="submit" className="btn btn-primary flex-fill">
                    <IconFilter size={16} className="me-1" />
                    Apply
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-icon"
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
                <label className="form-check form-check-inline">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={identifiedOnly}
                    onChange={(e) => {
                      setIdentifiedOnly(e.target.checked);
                      setPagination(prev => ({ ...prev, page: 1 }));
                    }}
                  />
                  <span className="form-check-label">Identified only</span>
                </label>
                <label className="form-check form-check-inline">
                  <input
                    type="checkbox"
                    className="form-check-input"
                    checked={enrichedOnly}
                    onChange={(e) => {
                      setEnrichedOnly(e.target.checked);
                      setPagination(prev => ({ ...prev, page: 1 }));
                    }}
                  />
                  <span className="form-check-label">Enriched only</span>
                </label>
              </div>
            </div>
          </form>
        </div>
      </div>

      <div className="row g-4">
        {/* Visitors List */}
        <div className={selectedVisitor ? 'col-lg-7' : 'col-12'}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                {loading ? (
                  <span className="text-muted">Loading...</span>
                ) : (
                  <>{pagination.total.toLocaleString()} Visitor{pagination.total !== 1 ? 's' : ''}</>
                )}
              </h3>
            </div>
            {loading ? (
              <div className="card-body text-center py-5">
                <IconLoader2 size={40} className="text-primary mb-3" style={{ animation: 'spin 1s linear infinite' }} />
                <p className="text-muted mb-0">Loading visitors...</p>
              </div>
            ) : error ? (
              <div className="card-body">
                <div className="alert alert-danger mb-0">{error}</div>
              </div>
            ) : visitors.length === 0 ? (
              <div className="card-body text-center py-5">
                <div className="mb-3">
                  <span className="avatar avatar-xl bg-primary-lt">
                    <IconUser size={32} />
                  </span>
                </div>
                <h4>No visitors found</h4>
                <p className="text-muted mb-0">Visitors will appear here once your pixel starts tracking.</p>
              </div>
            ) : (
              <>
                <div className="list-group list-group-flush list-group-hoverable">
                  {visitors.map((visitor) => (
                    <div
                      key={visitor.id}
                      className={`list-group-item ${selectedVisitor?.id === visitor.id ? 'bg-primary-lt' : ''}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedVisitor(visitor)}
                    >
                      <div className="row align-items-center g-3">
                        <div className="col-auto">
                          <span
                            className="avatar"
                            style={{
                              backgroundColor: visitor.is_identified ? '#d4edda' : '#e9ecef',
                              color: visitor.is_identified ? '#28a745' : '#6c757d'
                            }}
                          >
                            <IconUser size={20} />
                          </span>
                        </div>
                        <div className="col">
                          <div className="d-flex align-items-center mb-1">
                            <span className="fw-semibold">{getVisitorName(visitor)}</span>
                            {visitor.is_enriched && (
                              <IconStarFilled size={14} className="ms-2 text-warning" title="Enriched" />
                            )}
                          </div>
                          <div className="text-muted small">
                            {visitor.email || visitor.company || `Visitor ${visitor.visitor_id.substring(0, 8)}`}
                          </div>
                        </div>
                        <div className="col-auto">
                          <div
                            className="badge"
                            style={{
                              backgroundColor: `${getScoreColor(visitor.lead_score)}20`,
                              color: getScoreColor(visitor.lead_score),
                              fontWeight: 600,
                              fontSize: '13px',
                              padding: '6px 10px'
                            }}
                          >
                            {visitor.lead_score}
                          </div>
                        </div>
                        <div className="col-auto d-none d-md-block">
                          <div className="d-flex gap-3 text-muted small">
                            <span title="Page Views" className="d-flex align-items-center">
                              <IconEye size={14} className="me-1" />
                              {visitor.total_pageviews}
                            </span>
                            <span title="Clicks" className="d-flex align-items-center">
                              <IconClick size={14} className="me-1" />
                              {visitor.total_clicks}
                            </span>
                            <span title="Sessions" className="d-flex align-items-center">
                              <IconClock size={14} className="me-1" />
                              {visitor.total_sessions}
                            </span>
                          </div>
                        </div>
                        <div className="col-auto">
                          <span className="text-muted small">{formatTimeAgo(visitor.last_seen_at)}</span>
                        </div>
                        <div className="col-auto">
                          <IconChevronRight size={16} className="text-muted" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Pagination */}
                {pagination.totalPages > 1 && (
                  <div className="card-footer d-flex align-items-center justify-content-between">
                    <p className="m-0 text-muted small">
                      Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
                    </p>
                    <div className="btn-group">
                      <button
                        className="btn btn-sm"
                        disabled={pagination.page === 1}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                      >
                        <IconChevronLeft size={16} />
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={pagination.page === pagination.totalPages}
                        onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                      >
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
                    className="btn btn-ghost-secondary btn-icon btn-sm"
                    onClick={() => setSelectedVisitor(null)}
                  >
                    <IconX size={18} />
                  </button>
                </div>
              </div>
              <div className="card-body">
                {/* Header */}
                <div className="text-center mb-4 pb-4 border-bottom">
                  <span
                    className="avatar avatar-xl mb-3"
                    style={{
                      backgroundColor: selectedVisitor.is_identified ? '#d4edda' : '#e9ecef',
                      color: selectedVisitor.is_identified ? '#28a745' : '#6c757d'
                    }}
                  >
                    <IconUser size={32} />
                  </span>
                  <h3 className="mb-1">{getVisitorName(selectedVisitor)}</h3>
                  {selectedVisitor.job_title && (
                    <div className="text-muted mb-2">{selectedVisitor.job_title}</div>
                  )}
                  <div className="d-flex justify-content-center gap-2">
                    <span
                      className="badge"
                      style={{
                        backgroundColor: `${getScoreColor(selectedVisitor.lead_score)}20`,
                        color: getScoreColor(selectedVisitor.lead_score),
                        fontWeight: 600,
                        padding: '6px 12px'
                      }}
                    >
                      Score: {selectedVisitor.lead_score}
                    </span>
                    {selectedVisitor.is_identified && (
                      <span className="badge bg-success-lt text-success">Identified</span>
                    )}
                    {selectedVisitor.is_enriched && (
                      <span className="badge bg-warning-lt text-warning">Enriched</span>
                    )}
                  </div>
                </div>

                {/* Contact Info */}
                {(selectedVisitor.email || selectedVisitor.company || selectedVisitor.linkedin_url || selectedVisitor.city) && (
                  <div className="mb-4">
                    <h5 className="text-muted small text-uppercase mb-3">Contact Information</h5>
                    <div className="list-group list-group-flush">
                      {selectedVisitor.email && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-primary-lt me-3">
                            <IconMail size={14} />
                          </span>
                          <a href={`mailto:${selectedVisitor.email}`} className="text-reset">
                            {selectedVisitor.email}
                          </a>
                        </div>
                      )}
                      {selectedVisitor.company && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-azure-lt me-3">
                            <IconBuilding size={14} />
                          </span>
                          {selectedVisitor.company}
                        </div>
                      )}
                      {selectedVisitor.linkedin_url && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-blue-lt me-3">
                            <IconBrandLinkedin size={14} />
                          </span>
                          <a href={selectedVisitor.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-reset">
                            LinkedIn <IconExternalLink size={12} className="ms-1" />
                          </a>
                        </div>
                      )}
                      {(selectedVisitor.city || selectedVisitor.country) && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-green-lt me-3">
                            <IconWorld size={14} />
                          </span>
                          {[selectedVisitor.city, selectedVisitor.state, selectedVisitor.country]
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Activity Stats */}
                <div className="mb-4">
                  <h5 className="text-muted small text-uppercase mb-3">Activity Overview</h5>
                  <div className="row g-3">
                    <div className="col-6">
                      <div className="card bg-primary-lt border-0">
                        <div className="card-body text-center py-3">
                          <div className="h2 mb-0 fw-bold text-primary">{selectedVisitor.total_pageviews}</div>
                          <div className="small fw-semibold">Page Views</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="card bg-success-lt border-0">
                        <div className="card-body text-center py-3">
                          <div className="h2 mb-0 fw-bold text-success">{selectedVisitor.total_sessions}</div>
                          <div className="small fw-semibold">Sessions</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="card bg-info-lt border-0">
                        <div className="card-body text-center py-3">
                          <div className="h2 mb-0 fw-bold text-info">{formatDuration(selectedVisitor.total_time_on_site)}</div>
                          <div className="small fw-semibold">Time on Site</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="card bg-warning-lt border-0">
                        <div className="card-body text-center py-3">
                          <div className="h2 mb-0 fw-bold text-warning">{selectedVisitor.max_scroll_depth}%</div>
                          <div className="small fw-semibold">Max Scroll</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="row g-3 mt-1">
                    <div className="col-6">
                      <div className="card bg-secondary-lt border-0">
                        <div className="card-body text-center py-3">
                          <div className="h2 mb-0 fw-bold">{selectedVisitor.total_clicks}</div>
                          <div className="small fw-semibold">Total Clicks</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-6">
                      <div className="card bg-purple-lt border-0">
                        <div className="card-body text-center py-3">
                          <div className="h2 mb-0 fw-bold text-purple">{selectedVisitor.form_submissions}</div>
                          <div className="small fw-semibold">Form Submissions</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Lead Score Progress */}
                <div className="mb-4">
                  <h5 className="text-muted small text-uppercase mb-3">Lead Score</h5>
                  <div className="progress mb-2" style={{ height: '12px', borderRadius: '6px' }}>
                    <div
                      className="progress-bar"
                      style={{
                        width: `${selectedVisitor.lead_score}%`,
                        backgroundColor: getScoreColor(selectedVisitor.lead_score),
                        borderRadius: '6px'
                      }}
                    />
                  </div>
                  <div className="d-flex justify-content-between text-muted small">
                    <span>0</span>
                    <span className="fw-semibold">{selectedVisitor.lead_score}/100</span>
                    <span>100</span>
                  </div>
                </div>

                {/* Activity Timeline / Journey */}
                <div className="mb-4">
                  <h5 className="text-muted small text-uppercase mb-3">Activity Timeline</h5>
                  {loadingDetails ? (
                    <div className="text-center py-3">
                      <IconLoader2 size={24} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : visitorDetails?.journey && visitorDetails.journey.length > 0 ? (
                    <div className="timeline-list" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                      {visitorDetails.journey.map((event, index) => (
                        <div key={index} className="d-flex align-items-start mb-3">
                          <div className="me-3">
                            <span
                              className="avatar avatar-sm"
                              style={{
                                backgroundColor:
                                  event.type === 'Opened Page' ? '#e8f4fd' :
                                  event.type === 'Clicked Link' ? '#fff3cd' :
                                  event.type === 'Submitted Form' ? '#d4edda' : '#f8f9fa',
                                color:
                                  event.type === 'Opened Page' ? '#0d6efd' :
                                  event.type === 'Clicked Link' ? '#856404' :
                                  event.type === 'Submitted Form' ? '#28a745' : '#6c757d',
                              }}
                            >
                              {event.type === 'Opened Page' && <IconFileText size={14} />}
                              {event.type === 'Clicked Link' && <IconLink size={14} />}
                              {event.type === 'Submitted Form' && <IconForms size={14} />}
                              {!['Opened Page', 'Clicked Link', 'Submitted Form'].includes(event.type) && <IconPlayerPlay size={14} />}
                            </span>
                          </div>
                          <div className="flex-fill">
                            <div className="fw-semibold small">{event.type}</div>
                            {event.url && (
                              <div className="text-muted small text-break">
                                <code style={{ fontSize: '11px' }}>
                                  {(() => {
                                    try {
                                      return new URL(event.url).pathname;
                                    } catch {
                                      return event.url;
                                    }
                                  })()}
                                </code>
                              </div>
                            )}
                            {event.data?.text && (
                              <div className="text-muted small">&quot;{String(event.data.text).substring(0, 50)}&quot;</div>
                            )}
                            <div className="text-muted" style={{ fontSize: '10px' }}>
                              {new Date(event.timestamp).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-muted small text-center py-3">
                      No activity recorded yet
                    </div>
                  )}
                </div>

                {/* Technical Info */}
                <div>
                  <h5 className="text-muted small text-uppercase mb-3">Technical Details</h5>
                  <table className="table table-sm mb-0">
                    <tbody>
                      <tr>
                        <td className="text-muted" style={{ width: '40%' }}>First Seen</td>
                        <td>{new Date(selectedVisitor.first_seen_at).toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="text-muted">Last Seen</td>
                        <td>{new Date(selectedVisitor.last_seen_at).toLocaleString()}</td>
                      </tr>
                      {selectedVisitor.user_agent && (
                        <tr>
                          <td className="text-muted">Device</td>
                          <td>
                            <IconDeviceDesktop size={14} className="me-1" />
                            {parseUserAgent(selectedVisitor.user_agent).browser} / {parseUserAgent(selectedVisitor.user_agent).os}
                          </td>
                        </tr>
                      )}
                      {selectedVisitor.first_page_url && (
                        <tr>
                          <td className="text-muted">First Page</td>
                          <td className="text-break">
                            <code className="small">
                              {(() => {
                                try {
                                  return new URL(selectedVisitor.first_page_url).pathname;
                                } catch {
                                  return selectedVisitor.first_page_url;
                                }
                              })()}
                            </code>
                          </td>
                        </tr>
                      )}
                      {selectedVisitor.first_referrer && (
                        <tr>
                          <td className="text-muted">Referrer</td>
                          <td className="text-break">
                            <code className="small">{selectedVisitor.first_referrer || 'Direct'}</code>
                          </td>
                        </tr>
                      )}
                      <tr>
                        <td className="text-muted">Visitor ID</td>
                        <td>
                          <code className="small">{selectedVisitor.visitor_id.substring(0, 12)}...</code>
                        </td>
                      </tr>
                    </tbody>
                  </table>
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
