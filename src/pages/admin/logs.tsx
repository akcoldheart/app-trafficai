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
  IconChevronDown,
  IconChevronUp,
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
  user_email: string | null;
  user_name: string | null;
  user_company: string | null;
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
        return <IconBrandStripe size={18} />;
      case 'webhook':
        return <IconWebhook size={18} />;
      case 'api':
        return <IconApi size={18} />;
      case 'error':
        return <IconAlertCircle size={18} />;
      default:
        return <IconInfoCircle size={18} />;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <IconCheck size={16} className="text-success" />;
      case 'error':
        return <IconX size={16} className="text-danger" />;
      case 'warning':
        return <IconAlertTriangle size={16} className="text-warning" />;
      default:
        return <IconInfoCircle size={16} className="text-info" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'success';
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'stripe':
        return 'purple';
      case 'webhook':
        return 'cyan';
      case 'api':
        return 'azure';
      case 'error':
        return 'danger';
      default:
        return 'secondary';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Format message to replace UUID with user name/email if available
  const formatMessage = (log: LogEntry) => {
    let message = log.message;
    if (log.user_id && (log.user_name || log.user_email)) {
      const displayName = log.user_name || log.user_email || '';
      // Replace UUID pattern with user name/email
      message = message.replace(log.user_id, displayName);
      // Also replace "User UUID" pattern
      message = message.replace(/User\s+[a-f0-9-]{36}/gi, displayName);
    }
    return message;
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (authLoading) {
    return (
      <Layout title="System Logs" pageTitle="System Logs">
        <div className="d-flex justify-content-center align-items-center py-5">
          <IconLoader2 size={32} className="text-primary spinner" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="System Logs" pageTitle="System Logs">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title d-flex align-items-center gap-2">
            <IconWebhook size={24} className="text-primary" />
            Webhook & API Logs
          </h3>
          <div className="card-actions d-flex gap-2">
            <button
              className="btn btn-outline-danger btn-sm d-flex align-items-center gap-1"
              onClick={() => setShowClearModal(true)}
            >
              <IconTrash size={16} />
              Clear Logs
            </button>
            <button
              className="btn btn-primary btn-sm d-flex align-items-center gap-1"
              onClick={fetchLogs}
              disabled={loading}
            >
              <IconRefresh size={16} className={loading ? 'spinner' : ''} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="card-body border-bottom py-3">
          <div className="row g-3 align-items-center">
            <div className="col-md-4">
              <div className="input-icon">
                <span className="input-icon-addon">
                  <IconSearch size={18} />
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
                <span className="input-group-text bg-transparent border-end-0">
                  <IconFilter size={16} />
                </span>
                <select
                  className="form-select border-start-0"
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
              <span className="badge bg-primary-lt fs-6">{total} logs</span>
            </div>
          </div>
        </div>

        {/* Logs List */}
        <div className="card-body p-0">
          {error ? (
            <div className="p-4">
              <div className="alert alert-danger mb-0">{error}</div>
            </div>
          ) : loading ? (
            <div className="text-center py-5">
              <IconLoader2 size={40} className="text-primary spinner" />
              <p className="text-muted mt-3 mb-0">Loading logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-5">
              <IconWebhook size={64} className="text-muted mb-3" strokeWidth={1} />
              <h4 className="text-muted">No logs found</h4>
              <p className="text-muted mb-0">
                {searchTerm || typeFilter !== 'all' || statusFilter !== 'all'
                  ? 'Try adjusting your filters'
                  : 'Webhook and API logs will appear here'}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-vcenter card-table table-hover">
                <thead>
                  <tr>
                    <th style={{ width: '40px' }}></th>
                    <th>Type</th>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Message</th>
                    <th>User</th>
                    <th>Timestamp</th>
                    <th style={{ width: '40px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <>
                      <tr
                        key={log.id}
                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div className={`avatar avatar-sm bg-${getStatusColor(log.status)}-lt`}>
                            {getStatusIcon(log.status)}
                          </div>
                        </td>
                        <td>
                          <span className={`badge bg-${getTypeColor(log.type)}-lt d-inline-flex align-items-center gap-1`}>
                            {getTypeIcon(log.type)}
                            <span className="text-capitalize">{log.type}</span>
                          </span>
                        </td>
                        <td>
                          <code className="text-primary fw-bold small">{log.event_name}</code>
                        </td>
                        <td>
                          <span className={`badge bg-${getStatusColor(log.status)}-lt text-capitalize`}>
                            {log.status}
                          </span>
                        </td>
                        <td>
                          <div className="text-muted small text-truncate" style={{ maxWidth: '300px' }}>
                            {formatMessage(log)}
                          </div>
                        </td>
                        <td>
                          {(log.user_email || log.user_name) ? (
                            <div>
                              {log.user_name && <div className="fw-medium small">{log.user_name}</div>}
                              {log.user_email && <div className="text-cyan small">{log.user_email}</div>}
                            </div>
                          ) : log.user_id ? (
                            <code className="text-muted small">{log.user_id.slice(0, 8)}...</code>
                          ) : (
                            <span className="text-muted small">-</span>
                          )}
                        </td>
                        <td>
                          <div className="text-muted small text-nowrap">
                            {formatDate(log.created_at)}
                          </div>
                        </td>
                        <td>
                          <span className="text-muted">
                            {expandedLogId === log.id ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded Details Row */}
                      {expandedLogId === log.id && (
                        <tr key={`${log.id}-details`}>
                          <td colSpan={8} className="bg-surface-secondary" style={{ padding: '16px 24px' }}>
                            <div className="row g-3">
                              {/* User Details */}
                              {log.user_id && (
                                <div className="col-md-6">
                                  <div className="card border mb-0">
                                    <div className="card-body py-3">
                                      <h6 className="card-subtitle mb-2 d-flex align-items-center gap-2">
                                        <IconUser size={14} className="text-primary" />
                                        <span>Account Details</span>
                                      </h6>
                                      <div className="d-flex flex-column gap-1">
                                        {log.user_name && (
                                          <div className="small"><span className="text-muted" style={{ display: 'inline-block', width: '60px' }}>Name:</span> <strong>{log.user_name}</strong></div>
                                        )}
                                        {log.user_email && (
                                          <div className="small"><span className="text-muted" style={{ display: 'inline-block', width: '60px' }}>Email:</span> <code className="text-cyan">{log.user_email}</code></div>
                                        )}
                                        {log.user_company && (
                                          <div className="small"><span className="text-muted" style={{ display: 'inline-block', width: '60px' }}>Company:</span> {log.user_company}</div>
                                        )}
                                        <div className="small"><span className="text-muted" style={{ display: 'inline-block', width: '60px' }}>User ID:</span> <code className="text-yellow small">{log.user_id}</code></div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Event Info */}
                              <div className={log.user_id ? 'col-md-6' : 'col-12'}>
                                <div className="card border mb-0">
                                  <div className="card-body py-3">
                                    <h6 className="card-subtitle mb-2 d-flex align-items-center gap-2">
                                      <IconCode size={14} className="text-primary" />
                                      <span>Event Info</span>
                                    </h6>
                                    <div className="d-flex flex-column gap-1">
                                      <div className="small"><span className="text-muted" style={{ display: 'inline-block', width: '60px' }}>Event:</span> <code className="text-pink">{log.event_name}</code></div>
                                      <div className="small"><span className="text-muted" style={{ display: 'inline-block', width: '60px' }}>Time:</span> {formatDate(log.created_at)}</div>
                                      {log.ip_address && (
                                        <div className="small"><span className="text-muted" style={{ display: 'inline-block', width: '60px' }}>IP:</span> <code className="text-azure">{log.ip_address}</code></div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Request Data */}
                              {log.request_data && Object.keys(log.request_data).length > 0 && (
                                <div className="col-md-6">
                                  <h6 className="mb-2 d-flex align-items-center gap-2 small">
                                    <IconCode size={14} className="text-azure" />
                                    <span>Request Data</span>
                                  </h6>
                                  <pre className="code-block p-3 rounded small mb-0" style={{ maxHeight: '200px', overflow: 'auto' }}>
                                    {JSON.stringify(log.request_data, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Response Data */}
                              {log.response_data && Object.keys(log.response_data).length > 0 && (
                                <div className="col-md-6">
                                  <h6 className="mb-2 d-flex align-items-center gap-2 small">
                                    <IconCheck size={14} className="text-success" />
                                    <span>Response Data</span>
                                  </h6>
                                  <pre className="code-block p-3 rounded small mb-0" style={{ maxHeight: '200px', overflow: 'auto' }}>
                                    {JSON.stringify(log.response_data, null, 2)}
                                  </pre>
                                </div>
                              )}

                              {/* Error Details */}
                              {log.error_details && (
                                <div className="col-12">
                                  <h6 className="text-danger mb-2 d-flex align-items-center gap-2 small">
                                    <IconAlertCircle size={14} />
                                    <span>Error Details</span>
                                  </h6>
                                  <pre className="bg-danger-lt text-danger p-3 rounded small mb-0">
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
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="card-footer d-flex align-items-center justify-content-between">
            <p className="m-0 text-muted small">
              Showing {page * PAGE_SIZE + 1} to {Math.min((page + 1) * PAGE_SIZE, total)} of {total} logs
            </p>
            <div className="btn-group">
              <button
                className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
              >
                <IconChevronLeft size={16} />
                Previous
              </button>
              <button
                className="btn btn-outline-secondary btn-sm d-flex align-items-center gap-1"
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
                <p className="text-muted">Choose an option to clear logs:</p>
                <div className="d-grid gap-2">
                  <button
                    className="btn btn-outline-warning"
                    onClick={() => handleClearLogs(7)}
                    disabled={clearing}
                  >
                    {clearing && <IconLoader2 size={16} className="me-2 spinner" />}
                    Clear logs older than 7 days
                  </button>
                  <button
                    className="btn btn-outline-warning"
                    onClick={() => handleClearLogs(30)}
                    disabled={clearing}
                  >
                    {clearing && <IconLoader2 size={16} className="me-2 spinner" />}
                    Clear logs older than 30 days
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => handleClearLogs()}
                    disabled={clearing}
                  >
                    {clearing && <IconLoader2 size={16} className="me-2 spinner" />}
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

      <style jsx global>{`
        .spinner {
          animation: spin 1s linear infinite;
        }
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
        .code-block {
          background-color: var(--tblr-bg-surface-secondary);
          color: var(--tblr-body-color);
          border: 1px solid var(--tblr-border-color);
        }
      `}</style>
    </Layout>
  );
}
