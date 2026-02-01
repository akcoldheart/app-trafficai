import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import {
  IconWebhook,
  IconApi,
  IconBrandStripe,
  IconAlertCircle,
  IconInfoCircle,
  IconCheck,
  IconX,
  IconLoader2,
  IconSearch,
  IconRefresh,
  IconTrash,
  IconFilter,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconUser,
  IconCode,
  IconAlertTriangle,
} from '@tabler/icons-react';

interface LogEntry {
  id: string;
  type: 'webhook' | 'api' | 'stripe' | 'error' | 'info';
  event_name: string;
  status: 'success' | 'error' | 'warning' | 'info';
  message: string;
  request_data: Record<string, unknown> | null;
  response_data: Record<string, unknown> | null;
  error_details: string | null;
  user_id: string | null;
  ip_address: string | null;
  created_at: string;
}

const PAGE_SIZE = 50;

export default function AdminLogs() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  // Filters
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Expanded log details
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Clear logs modal
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: PAGE_SIZE.toString(),
        offset: (page * PAGE_SIZE).toString(),
      });

      if (typeFilter !== 'all') params.append('type', typeFilter);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      if (searchTerm) params.append('search', searchTerm);

      const response = await fetch(`/api/admin/logs?${params}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch logs');
      }

      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [page, typeFilter, statusFilter, searchTerm]);

  useEffect(() => {
    if (!authLoading && userProfile?.role !== 'admin') {
      router.push('/dashboard');
      return;
    }

    if (!authLoading && userProfile?.role === 'admin') {
      fetchLogs();
    }
  }, [authLoading, userProfile, router, fetchLogs]);

  const handleClearLogs = async (olderThan?: number) => {
    setClearing(true);
    try {
      const response = await fetch('/api/admin/logs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(olderThan ? { olderThan } : { clearAll: true }),
      });

      if (response.ok) {
        fetchLogs();
        setShowClearModal(false);
      }
    } catch (err) {
      console.error('Error clearing logs:', err);
    } finally {
      setClearing(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'stripe':
        return <IconBrandStripe size={16} />;
      case 'webhook':
        return <IconWebhook size={16} />;
      case 'api':
        return <IconApi size={16} />;
      case 'error':
        return <IconAlertCircle size={16} />;
      default:
        return <IconInfoCircle size={16} />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <span className="badge bg-green-lt"><IconCheck size={12} className="me-1" />Success</span>;
      case 'error':
        return <span className="badge bg-red-lt"><IconX size={12} className="me-1" />Error</span>;
      case 'warning':
        return <span className="badge bg-yellow-lt"><IconAlertTriangle size={12} className="me-1" />Warning</span>;
      default:
        return <span className="badge bg-blue-lt"><IconInfoCircle size={12} className="me-1" />Info</span>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'stripe':
        return <span className="badge bg-purple-lt">{getTypeIcon(type)} Stripe</span>;
      case 'webhook':
        return <span className="badge bg-cyan-lt">{getTypeIcon(type)} Webhook</span>;
      case 'api':
        return <span className="badge bg-azure-lt">{getTypeIcon(type)} API</span>;
      case 'error':
        return <span className="badge bg-red-lt">{getTypeIcon(type)} Error</span>;
      default:
        return <span className="badge bg-secondary-lt">{getTypeIcon(type)} Info</span>;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (authLoading) {
    return (
      <Layout title="System Logs" pageTitle="System Logs">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="System Logs" pageTitle="System Logs">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <IconWebhook className="icon me-2" />
            Webhook & API Logs
          </h3>
          <div className="card-actions">
            <button
              className="btn btn-ghost-danger btn-sm me-2"
              onClick={() => setShowClearModal(true)}
            >
              <IconTrash size={16} className="me-1" />
              Clear Logs
            </button>
            <button
              className="btn btn-ghost-primary btn-sm"
              onClick={fetchLogs}
              disabled={loading}
            >
              <IconRefresh size={16} className={loading ? 'me-1' : 'me-1'} style={loading ? { animation: 'spin 1s linear infinite' } : {}} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card-body border-bottom py-3">
          <div className="row g-3 align-items-center">
            <div className="col-md-4">
              <div className="input-group">
                <span className="input-group-text">
                  <IconSearch size={16} />
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setPage(0);
                  }}
                />
              </div>
            </div>
            <div className="col-md-3">
              <div className="input-group">
                <span className="input-group-text">
                  <IconFilter size={16} />
                </span>
                <select
                  className="form-select"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setPage(0);
                  }}
                >
                  <option value="all">All Types</option>
                  <option value="stripe">Stripe</option>
                  <option value="webhook">Webhook</option>
                  <option value="api">API</option>
                  <option value="error">Error</option>
                  <option value="info">Info</option>
                </select>
              </div>
            </div>
            <div className="col-md-3">
              <select
                className="form-select"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">All Status</option>
                <option value="success">Success</option>
                <option value="error">Error</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div className="col-md-2 text-end">
              <span className="text-muted">{total} logs</span>
            </div>
          </div>
        </div>

        {/* Logs Table */}
        <div className="table-responsive">
          {error ? (
            <div className="card-body">
              <div className="alert alert-danger mb-0">{error}</div>
            </div>
          ) : loading ? (
            <div className="card-body text-center py-5">
              <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
              <p className="text-muted mt-2">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="card-body text-center py-5">
              <IconWebhook size={48} className="text-muted mb-3" />
              <h4>No logs found</h4>
              <p className="text-muted">
                {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Webhook and API logs will appear here'}
              </p>
            </div>
          ) : (
            <table className="table table-vcenter card-table table-hover">
              <thead>
                <tr>
                  <th style={{ width: '160px' }}>Time</th>
                  <th style={{ width: '100px' }}>Type</th>
                  <th style={{ width: '100px' }}>Status</th>
                  <th>Event</th>
                  <th>Message</th>
                  <th style={{ width: '50px' }}></th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <>
                    <tr
                      key={log.id}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                      className={expandedLogId === log.id ? 'bg-light' : ''}
                    >
                      <td className="text-muted small">
                        <IconClock size={12} className="me-1" />
                        {formatDate(log.created_at)}
                      </td>
                      <td>{getTypeBadge(log.type)}</td>
                      <td>{getStatusBadge(log.status)}</td>
                      <td>
                        <code className="small">{log.event_name}</code>
                      </td>
                      <td className="text-truncate" style={{ maxWidth: '300px' }}>
                        {log.message}
                      </td>
                      <td>
                        <IconCode size={16} className="text-muted" />
                      </td>
                    </tr>
                    {expandedLogId === log.id && (
                      <tr key={`${log.id}-details`}>
                        <td colSpan={6} className="bg-light p-3">
                          <div className="row g-3">
                            {log.user_id && (
                              <div className="col-md-6">
                                <strong className="small text-muted">User ID:</strong>
                                <div className="small font-monospace">{log.user_id}</div>
                              </div>
                            )}
                            {log.ip_address && (
                              <div className="col-md-6">
                                <strong className="small text-muted">IP Address:</strong>
                                <div className="small font-monospace">{log.ip_address}</div>
                              </div>
                            )}
                            {log.request_data && (
                              <div className="col-12">
                                <strong className="small text-muted">Request Data:</strong>
                                <pre className="bg-dark text-light p-2 rounded small mb-0" style={{ maxHeight: '200px', overflow: 'auto' }}>
                                  {JSON.stringify(log.request_data, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.response_data && (
                              <div className="col-12">
                                <strong className="small text-muted">Response Data:</strong>
                                <pre className="bg-dark text-light p-2 rounded small mb-0" style={{ maxHeight: '200px', overflow: 'auto' }}>
                                  {JSON.stringify(log.response_data, null, 2)}
                                </pre>
                              </div>
                            )}
                            {log.error_details && (
                              <div className="col-12">
                                <strong className="small text-danger">Error Details:</strong>
                                <pre className="bg-danger-lt text-danger p-2 rounded small mb-0">
                                  {log.error_details}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="card-footer d-flex align-items-center justify-content-between">
            <p className="m-0 text-muted">
              Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, total)} of {total} logs
            </p>
            <div className="btn-group">
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
              >
                <IconChevronLeft size={16} />
                Previous
              </button>
              <button
                className="btn btn-outline-secondary btn-sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
              >
                Next
                <IconChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Clear Logs Modal */}
      {showClearModal && (
        <div className="modal modal-blur fade show" style={{ display: 'block' }} tabIndex={-1}>
          <div className="modal-dialog modal-sm modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Clear Logs</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowClearModal(false)}
                />
              </div>
              <div className="modal-body">
                <p>Choose an option to clear logs:</p>
                <div className="d-grid gap-2">
                  <button
                    className="btn btn-outline-warning"
                    onClick={() => handleClearLogs(7)}
                    disabled={clearing}
                  >
                    {clearing ? <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} /> : null}
                    Clear logs older than 7 days
                  </button>
                  <button
                    className="btn btn-outline-warning"
                    onClick={() => handleClearLogs(30)}
                    disabled={clearing}
                  >
                    {clearing ? <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} /> : null}
                    Clear logs older than 30 days
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleClearLogs()}
                    disabled={clearing}
                  >
                    {clearing ? <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} /> : null}
                    Clear ALL logs
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowClearModal(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowClearModal(false)} />
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .modal-backdrop {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 1040;
        }
        .modal {
          z-index: 1050;
        }
      `}</style>
    </Layout>
  );
}
