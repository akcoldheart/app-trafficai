import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconCode,
  IconUsers,
  IconLoader2,
  IconCheck,
  IconX,
  IconEye,
  IconFilter,
  IconRefresh,
  IconInbox,
} from '@tabler/icons-react';

interface PixelRequest {
  id: string;
  user_id: string;
  name: string;
  domain: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  pixel_id: string | null;
  created_at: string;
  user?: { email: string; full_name: string | null };
}

interface AudienceRequest {
  id: string;
  user_id: string;
  request_type: 'standard' | 'custom';
  name: string;
  form_data: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  audience_id: string | null;
  created_at: string;
  user?: { email: string; full_name: string | null };
}

type RequestType = 'all' | 'pixel' | 'audience';
type StatusFilter = 'pending' | 'all';

export default function AdminRequests() {
  const { userProfile } = useAuth();
  const router = useRouter();
  const isAdmin = userProfile?.role === 'admin';

  const [pixelRequests, setPixelRequests] = useState<PixelRequest[]>([]);
  const [audienceRequests, setAudienceRequests] = useState<AudienceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestType, setRequestType] = useState<RequestType>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Modal state
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<{ type: 'pixel' | 'audience'; request: PixelRequest | AudienceRequest } | null>(null);
  const [adminNotes, setAdminNotes] = useState('');

  const fetchRequests = useCallback(async () => {
    if (!isAdmin) return;

    setLoading(true);
    try {
      const [pixelRes, audienceRes] = await Promise.all([
        fetch('/api/pixel-requests?include_all=true'),
        fetch('/api/audience-requests?include_all=true'),
      ]);

      const [pixelData, audienceData] = await Promise.all([
        pixelRes.json(),
        audienceRes.json(),
      ]);

      if (pixelRes.ok) {
        setPixelRequests(pixelData.requests || []);
      }
      if (audienceRes.ok) {
        setAudienceRequests(audienceData.requests || []);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      router.push('/');
      return;
    }
    fetchRequests();
  }, [isAdmin, router, fetchRequests]);

  const handleApprove = async () => {
    if (!selectedRequest) return;

    setProcessingId(selectedRequest.request.id);
    try {
      const endpoint = selectedRequest.type === 'pixel'
        ? `/api/admin/pixel-requests/${selectedRequest.request.id}/approve`
        : `/api/admin/audience-requests/${selectedRequest.request.id}/approve`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: adminNotes }),
      });

      if (response.ok) {
        fetchRequests();
        setShowApproveModal(false);
        setSelectedRequest(null);
        setAdminNotes('');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to approve request');
      }
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!selectedRequest) return;

    setProcessingId(selectedRequest.request.id);
    try {
      const endpoint = selectedRequest.type === 'pixel'
        ? `/api/admin/pixel-requests/${selectedRequest.request.id}/reject`
        : `/api/admin/audience-requests/${selectedRequest.request.id}/reject`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: adminNotes }),
      });

      if (response.ok) {
        fetchRequests();
        setShowRejectModal(false);
        setSelectedRequest(null);
        setAdminNotes('');
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to reject request');
      }
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Failed to reject request');
    } finally {
      setProcessingId(null);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="badge bg-yellow text-yellow-fg">Pending</span>;
      case 'approved':
        return <span className="badge bg-green text-green-fg">Approved</span>;
      case 'rejected':
        return <span className="badge bg-red text-red-fg">Rejected</span>;
      default:
        return <span className="badge bg-secondary">{status}</span>;
    }
  };

  // Filter requests
  const filteredPixelRequests = pixelRequests.filter(r =>
    statusFilter === 'all' || r.status === statusFilter
  );
  const filteredAudienceRequests = audienceRequests.filter(r =>
    statusFilter === 'all' || r.status === statusFilter
  );

  // Combine and sort all requests by date
  const allRequests: { type: 'pixel' | 'audience'; request: PixelRequest | AudienceRequest }[] = [];

  if (requestType === 'all' || requestType === 'pixel') {
    filteredPixelRequests.forEach(r => allRequests.push({ type: 'pixel', request: r }));
  }
  if (requestType === 'all' || requestType === 'audience') {
    filteredAudienceRequests.forEach(r => allRequests.push({ type: 'audience', request: r }));
  }

  allRequests.sort((a, b) =>
    new Date(b.request.created_at).getTime() - new Date(a.request.created_at).getTime()
  );

  const pendingCount = pixelRequests.filter(r => r.status === 'pending').length +
    audienceRequests.filter(r => r.status === 'pending').length;

  if (!isAdmin) {
    return null;
  }

  return (
    <Layout title="All Requests" pageTitle="All Requests" pagePretitle="Admin">
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <IconInbox className="icon me-2" />
            Pending Requests
            {pendingCount > 0 && (
              <span className="badge bg-warning ms-2">{pendingCount}</span>
            )}
          </h3>
          <div className="card-actions d-flex gap-2">
            <button className="btn btn-ghost-primary btn-sm" onClick={fetchRequests}>
              <IconRefresh size={16} className="me-1" />
              Refresh
            </button>
          </div>
        </div>
        <div className="card-body border-bottom">
          <div className="row g-3">
            <div className="col-auto">
              <div className="btn-group" role="group">
                <button
                  className={`btn btn-sm ${requestType === 'all' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setRequestType('all')}
                >
                  All
                </button>
                <button
                  className={`btn btn-sm ${requestType === 'pixel' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setRequestType('pixel')}
                >
                  <IconCode size={14} className="me-1" />
                  Pixels
                </button>
                <button
                  className={`btn btn-sm ${requestType === 'audience' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setRequestType('audience')}
                >
                  <IconUsers size={14} className="me-1" />
                  Audiences
                </button>
              </div>
            </div>
            <div className="col-auto">
              <div className="input-group input-group-sm">
                <span className="input-group-text">
                  <IconFilter size={14} />
                </span>
                <select
                  className="form-select form-select-sm"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                >
                  <option value="pending">Pending Only</option>
                  <option value="all">All Statuses</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card-body text-center py-5">
            <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-muted mt-2 mb-0">Loading requests...</p>
          </div>
        ) : allRequests.length === 0 ? (
          <div className="card-body text-center py-5">
            <div className="mb-3">
              <span className="avatar avatar-xl bg-success-lt">
                <IconCheck size={32} className="text-success" />
              </span>
            </div>
            <h3 className="mb-2">All caught up!</h3>
            <p className="text-muted mb-0">
              {statusFilter === 'pending'
                ? 'No pending requests to review.'
                : 'No requests found.'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Details</th>
                  <th>Requested By</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="w-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {allRequests.map(({ type, request }) => (
                  <tr key={`${type}-${request.id}`}>
                    <td>
                      <span className={`badge ${type === 'pixel' ? 'bg-purple-lt' : 'bg-blue-lt'}`}>
                        {type === 'pixel' ? (
                          <><IconCode size={12} className="me-1" /> Pixel</>
                        ) : (
                          <><IconUsers size={12} className="me-1" /> Audience</>
                        )}
                      </span>
                    </td>
                    <td>
                      <div className="fw-semibold">{request.name}</div>
                      <div className="text-muted small">
                        {type === 'pixel'
                          ? (request as PixelRequest).domain
                          : `${(request as AudienceRequest).request_type} audience`}
                      </div>
                    </td>
                    <td>
                      <div>{request.user?.email || 'Unknown'}</div>
                      {request.user?.full_name && (
                        <div className="text-muted small">{request.user.full_name}</div>
                      )}
                    </td>
                    <td>{getStatusBadge(request.status)}</td>
                    <td className="text-muted">{formatTimeAgo(request.created_at)}</td>
                    <td>
                      {request.status === 'pending' ? (
                        <div className="d-flex gap-1">
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => {
                              setSelectedRequest({ type, request });
                              setAdminNotes('');
                              setShowApproveModal(true);
                            }}
                            disabled={processingId === request.id}
                            title="Approve"
                          >
                            <IconCheck size={14} />
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => {
                              setSelectedRequest({ type, request });
                              setAdminNotes('');
                              setShowRejectModal(true);
                            }}
                            disabled={processingId === request.id}
                            title="Reject"
                          >
                            <IconX size={14} />
                          </button>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => {
                              router.push(type === 'pixel' ? '/pixels?tab=requests' : '/audiences?tab=requests');
                            }}
                            title="View in context"
                          >
                            <IconEye size={14} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted small">
                          {request.admin_notes && (
                            <span title={request.admin_notes}>Notes attached</span>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {showApproveModal && selectedRequest && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} />
          <div className="modal modal-blur fade show" style={{ display: 'block', zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Approve Request</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowApproveModal(false)}
                  />
                </div>
                <div className="modal-body">
                  <p>
                    Are you sure you want to approve the{' '}
                    <strong>{selectedRequest.type}</strong> request:{' '}
                    <strong>{selectedRequest.request.name}</strong>?
                  </p>
                  <div className="mb-3">
                    <label className="form-label">Admin Notes (optional)</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Add any notes for this approval..."
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowApproveModal(false)}
                    disabled={processingId === selectedRequest.request.id}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={handleApprove}
                    disabled={processingId === selectedRequest.request.id}
                  >
                    {processingId === selectedRequest.request.id ? (
                      <>
                        <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Approving...
                      </>
                    ) : (
                      <>
                        <IconCheck size={14} className="me-1" />
                        Approve
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} />
          <div className="modal modal-blur fade show" style={{ display: 'block', zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Reject Request</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => setShowRejectModal(false)}
                  />
                </div>
                <div className="modal-body">
                  <p>
                    Are you sure you want to reject the{' '}
                    <strong>{selectedRequest.type}</strong> request:{' '}
                    <strong>{selectedRequest.request.name}</strong>?
                  </p>
                  <div className="mb-3">
                    <label className="form-label">Rejection Reason</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      placeholder="Provide a reason for rejection..."
                    />
                  </div>
                </div>
                <div className="modal-footer">
                  <button
                    className="btn btn-secondary"
                    onClick={() => setShowRejectModal(false)}
                    disabled={processingId === selectedRequest.request.id}
                  >
                    Cancel
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleReject}
                    disabled={processingId === selectedRequest.request.id}
                  >
                    {processingId === selectedRequest.request.id ? (
                      <>
                        <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <IconX size={14} className="me-1" />
                        Reject
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
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
