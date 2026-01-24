import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import {
  IconCode,
  IconCheck,
  IconX,
  IconLoader2,
  IconSearch,
  IconRefresh,
  IconClock,
  IconWorldWww,
  IconUser,
  IconExternalLink,
} from '@tabler/icons-react';
import type { PixelRequest, RequestStatus } from '@/lib/supabase/types';

export default function AdminPixelRequests() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<PixelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'approve' | 'reject'>('approve');
  const [selectedRequest, setSelectedRequest] = useState<PixelRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const url = statusFilter === 'all'
        ? '/api/pixel-requests'
        : `/api/pixel-requests?status=${statusFilter}`;
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch requests');
      }

      setRequests(data.requests || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    if (!authLoading && userProfile && userProfile.role !== 'admin') {
      router.push('/');
      return;
    }

    if (!authLoading && userProfile?.role === 'admin') {
      fetchRequests();
    }
  }, [authLoading, userProfile, router, fetchRequests]);

  const handleOpenModal = (request: PixelRequest, mode: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setModalMode(mode);
    setAdminNotes('');
    setShowModal(true);
  };

  const handleSubmit = async () => {
    if (!selectedRequest) return;

    setProcessing(true);
    try {
      const endpoint = modalMode === 'approve'
        ? `/api/admin/pixel-requests/${selectedRequest.id}/approve`
        : `/api/admin/pixel-requests/${selectedRequest.id}/reject`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: adminNotes }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${modalMode} request`);
      }

      // Update local state
      setRequests(requests.map(r =>
        r.id === selectedRequest.id
          ? { ...r, status: modalMode === 'approve' ? 'approved' : 'rejected', admin_notes: adminNotes }
          : r
      ));

      setShowModal(false);
      setSelectedRequest(null);
      setAdminNotes('');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const filteredRequests = requests.filter(request => {
    const matchesSearch =
      request.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.user?.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getStatusBadgeClass = (status: RequestStatus) => {
    switch (status) {
      case 'approved': return 'bg-green-lt text-green';
      case 'rejected': return 'bg-red-lt text-red';
      case 'pending': return 'bg-yellow-lt text-yellow';
      default: return 'bg-secondary-lt';
    }
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (authLoading) {
    return (
      <Layout title="Pixel Requests" pageTitle="Pixel Requests" pagePretitle="Admin">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <IconLoader2 size={48} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  if (!userProfile || userProfile.role !== 'admin') {
    return null;
  }

  return (
    <Layout
      title="Pixel Requests"
      pageTitle="Pixel Requests"
      pagePretitle="Admin"
      pageActions={
        <button className="btn btn-outline-primary" onClick={fetchRequests}>
          <IconRefresh size={16} className="me-1" />
          Refresh
        </button>
      }
    >
      {error && (
        <div className="alert alert-danger mb-4">
          {error}
          <button className="btn btn-sm btn-outline-danger ms-3" onClick={fetchRequests}>
            Retry
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <IconCode className="icon me-2" />
            Pixel Requests
            {pendingCount > 0 && (
              <span className="badge bg-yellow-lt text-yellow ms-2">{pendingCount} pending</span>
            )}
          </h3>
          <div className="card-actions d-flex gap-2">
            <select
              className="form-select form-select-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RequestStatus | 'all')}
              style={{ width: '130px' }}
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <div className="input-group input-group-sm" style={{ width: '250px' }}>
              <span className="input-group-text">
                <IconSearch size={16} />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card-body text-center py-5">
            <IconLoader2 size={48} className="text-muted mb-3" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-muted">Loading requests...</p>
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="card-body text-center py-5">
            <IconCode size={48} className="text-muted mb-3" />
            <h4>No pixel requests</h4>
            <p className="text-muted">
              {searchTerm || statusFilter !== 'all' ? 'Try adjusting your filters' : 'No requests have been submitted yet'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Requester</th>
                  <th>Pixel Name</th>
                  <th>Domain</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="w-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div className="d-flex align-items-center">
                        <span className="avatar avatar-sm bg-blue-lt me-2">
                          <IconUser size={16} />
                        </span>
                        <span className="text-truncate" style={{ maxWidth: '200px' }}>
                          {request.user?.email || 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className="fw-semibold">{request.name}</span>
                    </td>
                    <td>
                      <div className="d-flex align-items-center">
                        <IconWorldWww size={16} className="text-muted me-1" />
                        {request.domain}
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${getStatusBadgeClass(request.status)}`}>
                        {request.status === 'pending' && <IconClock size={14} className="me-1" />}
                        {request.status === 'approved' && <IconCheck size={14} className="me-1" />}
                        {request.status === 'rejected' && <IconX size={14} className="me-1" />}
                        {request.status}
                      </span>
                      {request.admin_notes && (
                        <div className="text-muted small mt-1" style={{ maxWidth: '200px' }}>
                          Note: {request.admin_notes}
                        </div>
                      )}
                    </td>
                    <td className="text-muted">
                      {new Date(request.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      {request.status === 'pending' ? (
                        <div className="btn-group">
                          <button
                            className="btn btn-sm btn-success"
                            onClick={() => handleOpenModal(request, 'approve')}
                          >
                            <IconCheck size={16} />
                          </button>
                          <button
                            className="btn btn-sm btn-danger"
                            onClick={() => handleOpenModal(request, 'reject')}
                          >
                            <IconX size={16} />
                          </button>
                        </div>
                      ) : request.status === 'approved' && request.pixel_id ? (
                        <button
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => router.push('/pixels')}
                        >
                          <IconExternalLink size={16} className="me-1" />
                          View
                        </button>
                      ) : (
                        <span className="text-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approve/Reject Modal */}
      {showModal && selectedRequest && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {modalMode === 'approve' ? (
                    <>
                      <IconCheck className="icon text-success me-2" />
                      Approve Pixel Request
                    </>
                  ) : (
                    <>
                      <IconX className="icon text-danger me-2" />
                      Reject Pixel Request
                    </>
                  )}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Request Details</label>
                  <div className="card card-sm">
                    <div className="card-body">
                      <div className="row">
                        <div className="col-6">
                          <div className="text-muted small">Requester</div>
                          <div>{selectedRequest.user?.email}</div>
                        </div>
                        <div className="col-6">
                          <div className="text-muted small">Date</div>
                          <div>{new Date(selectedRequest.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <hr className="my-2" />
                      <div className="row">
                        <div className="col-6">
                          <div className="text-muted small">Pixel Name</div>
                          <div className="fw-semibold">{selectedRequest.name}</div>
                        </div>
                        <div className="col-6">
                          <div className="text-muted small">Domain</div>
                          <div>{selectedRequest.domain}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Admin Notes (optional)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder={modalMode === 'approve' ? 'Add any notes for the user...' : 'Provide a reason for rejection...'}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                  />
                </div>
                {modalMode === 'approve' && (
                  <div className="alert alert-info mb-0">
                    <h4 className="alert-title">What happens next?</h4>
                    <p className="mb-0">
                      Approving this request will create a new pixel for the user. They will be able to see
                      and use it immediately on their Pixels page.
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={processing}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`btn ${modalMode === 'approve' ? 'btn-success' : 'btn-danger'}`}
                  onClick={handleSubmit}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      Processing...
                    </>
                  ) : (
                    <>
                      {modalMode === 'approve' ? <IconCheck size={16} className="me-1" /> : <IconX size={16} className="me-1" />}
                      {modalMode === 'approve' ? 'Approve' : 'Reject'}
                    </>
                  )}
                </button>
              </div>
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
