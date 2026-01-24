import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import {
  IconUsers,
  IconCheck,
  IconX,
  IconLoader2,
  IconSearch,
  IconRefresh,
  IconClock,
  IconUser,
  IconChevronDown,
  IconChevronUp,
  IconPlus,
} from '@tabler/icons-react';
import type { AudienceRequest, RequestStatus } from '@/lib/supabase/types';

export default function AdminAudienceRequests() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<AudienceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<RequestStatus | 'all'>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'approve' | 'reject' | 'success'>('approve');
  const [selectedRequest, setSelectedRequest] = useState<AudienceRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [createdAudienceId, setCreatedAudienceId] = useState<string | null>(null);

  // Create audience modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [newAudienceName, setNewAudienceName] = useState('');
  const [newAudienceType, setNewAudienceType] = useState<'standard' | 'custom'>('standard');
  const [newAudienceDescription, setNewAudienceDescription] = useState('');
  const [newAudienceDaysBack, setNewAudienceDaysBack] = useState(7);
  const [createSuccess, setCreateSuccess] = useState(false);
  const [createdForEmail, setCreatedForEmail] = useState('');

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      const url = statusFilter === 'all'
        ? '/api/audience-requests'
        : `/api/audience-requests?status=${statusFilter}`;
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

  const handleOpenModal = (request: AudienceRequest, mode: 'approve' | 'reject') => {
    setSelectedRequest(request);
    setModalMode(mode);
    setAdminNotes('');
    setCreatedAudienceId(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedRequest(null);
    setAdminNotes('');
    setCreatedAudienceId(null);
    setModalMode('approve');
  };

  const handleSubmit = async () => {
    if (!selectedRequest) return;

    setProcessing(true);
    try {
      const endpoint = modalMode === 'approve'
        ? `/api/admin/audience-requests/${selectedRequest.id}/approve`
        : `/api/admin/audience-requests/${selectedRequest.id}/reject`;

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
          ? { ...r, status: modalMode === 'approve' ? 'approved' : 'rejected', admin_notes: adminNotes, audience_id: data.audience_id }
          : r
      ));

      if (modalMode === 'approve' && data.audience_id) {
        // Show success modal
        setCreatedAudienceId(data.audience_id);
        setModalMode('success');
      } else {
        handleCloseModal();
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const toggleExpandRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  // Fetch users for create modal
  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      if (response.ok && data.users) {
        setUsers(data.users.map((u: { id: string; email: string }) => ({ id: u.id, email: u.email })));
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    setSelectedUserId('');
    setUserSearchTerm('');
    setNewAudienceName('');
    setNewAudienceType('standard');
    setNewAudienceDescription('');
    setNewAudienceDaysBack(7);
    setCreateSuccess(false);
    setCreatedAudienceId(null);
    setCreatedForEmail('');
    fetchUsers();
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    if (createSuccess) {
      fetchRequests();
    }
  };

  const handleCreateAudience = async () => {
    if (!selectedUserId || !newAudienceName.trim()) return;

    setProcessing(true);
    try {
      const formData = newAudienceType === 'standard'
        ? { days_back: newAudienceDaysBack, filters: {} }
        : { topic: newAudienceName.trim(), description: newAudienceDescription.trim() };

      const response = await fetch('/api/admin/audiences/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUserId,
          request_type: newAudienceType,
          name: newAudienceName.trim(),
          form_data: formData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create audience');
      }

      setCreatedAudienceId(data.audience_id);
      setCreatedForEmail(data.user_email);
      setCreateSuccess(true);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  const filteredRequests = requests.filter(request => {
    const matchesSearch =
      request.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  const getTypeBadgeClass = (type: string) => {
    return type === 'custom' ? 'bg-purple-lt text-purple' : 'bg-blue-lt text-blue';
  };

  const formatFormData = (formData: Record<string, unknown>, type: string): string => {
    if (type === 'custom') {
      return `Topic: ${formData.topic || 'N/A'}\nDescription: ${formData.description || 'N/A'}`;
    }
    // Standard audience - show filters
    const parts: string[] = [];
    if (formData.days_back) parts.push(`Days back: ${formData.days_back}`);
    if (formData.filters) {
      const filters = formData.filters as Record<string, unknown>;
      if (filters.age) parts.push(`Age: ${JSON.stringify(filters.age)}`);
      if (filters.gender) parts.push(`Gender: ${filters.gender}`);
      if (filters.city) parts.push(`Cities: ${(filters.city as string[]).join(', ')}`);
      if (filters.state) parts.push(`States: ${(filters.state as string[]).join(', ')}`);
      if (filters.businessProfile) {
        const bp = filters.businessProfile as Record<string, string[]>;
        if (bp.industry) parts.push(`Industries: ${bp.industry.join(', ')}`);
        if (bp.department) parts.push(`Departments: ${bp.department.join(', ')}`);
        if (bp.seniority) parts.push(`Seniority: ${bp.seniority.join(', ')}`);
      }
    }
    if (formData.segment) parts.push(`Segments: ${(formData.segment as string[]).join(', ')}`);
    return parts.length > 0 ? parts.join('\n') : 'No filters specified';
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  if (authLoading) {
    return (
      <Layout title="Audience Requests" pageTitle="Audience Requests" pagePretitle="Admin">
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
      title="Audience Requests"
      pageTitle="Audience Requests"
      pagePretitle="Admin"
      pageActions={
        <div className="btn-list">
          <button className="btn btn-primary" onClick={handleOpenCreateModal}>
            <IconPlus size={16} className="me-1" />
            Create Audience for User
          </button>
          <button className="btn btn-outline-primary" onClick={fetchRequests}>
            <IconRefresh size={16} className="me-1" />
            Refresh
          </button>
        </div>
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
            <IconUsers className="icon me-2" />
            Audience Requests
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
            <IconUsers size={48} className="text-muted mb-3" />
            <h4>No audience requests</h4>
            <p className="text-muted">
              {searchTerm || statusFilter !== 'all' ? 'Try adjusting your filters' : 'No requests have been submitted yet'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}></th>
                  <th>Requester</th>
                  <th>Audience Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th className="w-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => (
                  <>
                    <tr key={request.id}>
                      <td>
                        <button
                          className="btn btn-icon btn-sm btn-ghost-secondary"
                          onClick={() => toggleExpandRow(request.id)}
                        >
                          {expandedRow === request.id ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                        </button>
                      </td>
                      <td>
                        <div className="d-flex align-items-center">
                          <span className="avatar avatar-sm bg-blue-lt me-2">
                            <IconUser size={16} />
                          </span>
                          <span className="text-truncate" style={{ maxWidth: '180px' }}>
                            {request.user?.email || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="fw-semibold">{request.name}</span>
                      </td>
                      <td>
                        <span className={`badge ${getTypeBadgeClass(request.request_type)}`}>
                          {request.request_type}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getStatusBadgeClass(request.status)}`}>
                          {request.status === 'pending' && <IconClock size={14} className="me-1" />}
                          {request.status === 'approved' && <IconCheck size={14} className="me-1" />}
                          {request.status === 'rejected' && <IconX size={14} className="me-1" />}
                          {request.status}
                        </span>
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
                              title="Approve"
                            >
                              <IconCheck size={16} />
                            </button>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleOpenModal(request, 'reject')}
                              title="Reject"
                            >
                              <IconX size={16} />
                            </button>
                          </div>
                        ) : (
                          <span className="text-muted">-</span>
                        )}
                      </td>
                    </tr>
                    {expandedRow === request.id && (
                      <tr key={`${request.id}-details`}>
                        <td colSpan={7} className="bg-light">
                          <div className="p-3">
                            <h5 className="mb-2">Request Details</h5>
                            <pre className="mb-0 p-2 bg-white rounded" style={{ whiteSpace: 'pre-wrap', fontSize: '13px' }}>
                              {formatFormData(request.form_data, request.request_type)}
                            </pre>
                            {request.admin_notes && (
                              <div className="mt-2">
                                <strong>Admin Notes:</strong> {request.admin_notes}
                              </div>
                            )}
                            {request.audience_id && (
                              <div className="mt-2">
                                <strong>Audience ID:</strong> <code>{request.audience_id}</code>
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

      {/* Approve/Reject Modal */}
      {showModal && selectedRequest && modalMode !== 'success' && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  {modalMode === 'approve' ? (
                    <>
                      <IconCheck className="icon text-success me-2" />
                      Approve Audience Request
                    </>
                  ) : (
                    <>
                      <IconX className="icon text-danger me-2" />
                      Reject Audience Request
                    </>
                  )}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={handleCloseModal}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Request Details</label>
                  <div className="card card-sm">
                    <div className="card-body">
                      <div className="row mb-2">
                        <div className="col-6">
                          <div className="text-muted small">Requester</div>
                          <div>{selectedRequest.user?.email}</div>
                        </div>
                        <div className="col-3">
                          <div className="text-muted small">Type</div>
                          <span className={`badge ${getTypeBadgeClass(selectedRequest.request_type)}`}>
                            {selectedRequest.request_type}
                          </span>
                        </div>
                        <div className="col-3">
                          <div className="text-muted small">Date</div>
                          <div>{new Date(selectedRequest.created_at).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <hr className="my-2" />
                      <div className="mb-2">
                        <div className="text-muted small">Audience Name</div>
                        <div className="fw-semibold">{selectedRequest.name}</div>
                      </div>
                      <div>
                        <div className="text-muted small">Configuration</div>
                        <pre className="mb-0 p-2 bg-light rounded mt-1" style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
                          {formatFormData(selectedRequest.form_data, selectedRequest.request_type)}
                        </pre>
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
                      Approving this request will create the audience via the Traffic AI API using the
                      user&apos;s API key. The audience will appear in their Audiences list once created.
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseModal}
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
                      {modalMode === 'approve' ? 'Approve & Create Audience' : 'Reject'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {showModal && modalMode === 'success' && selectedRequest && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title">
                  <IconCheck className="icon me-2" />
                  Audience Created Successfully
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={handleCloseModal}
                />
              </div>
              <div className="modal-body">
                <div className="alert alert-success">
                  <h4 className="alert-title">Audience is now available!</h4>
                  <p className="mb-0">
                    The audience has been created for <strong>{selectedRequest.user?.email}</strong>.
                    They can now see it on their Audiences page.
                  </p>
                </div>

                <div className="row g-2">
                  <div className="col-md-6">
                    <div className="card card-sm">
                      <div className="card-body">
                        <div className="text-muted small">Audience Name</div>
                        <div className="fw-semibold">{selectedRequest.name}</div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="card card-sm">
                      <div className="card-body">
                        <div className="text-muted small">Type</div>
                        <span className={`badge ${getTypeBadgeClass(selectedRequest.request_type)}`}>
                          {selectedRequest.request_type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {createdAudienceId && (
                  <div className="mt-3">
                    <div className="card card-sm">
                      <div className="card-body">
                        <div className="text-muted small">Audience ID</div>
                        <code className="fw-semibold">{createdAudienceId}</code>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => router.push('/audiences')}
                >
                  View Audiences
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCloseModal}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Audience Modal */}
      {showCreateModal && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              {!createSuccess ? (
                <>
                  <div className="modal-header">
                    <h5 className="modal-title">
                      <IconPlus className="icon me-2" />
                      Create Audience for User
                    </h5>
                    <button
                      type="button"
                      className="btn-close"
                      onClick={handleCloseCreateModal}
                    />
                  </div>
                  <div className="modal-body">
                    {/* User Selection */}
                    <div className="mb-3">
                      <label className="form-label required">Select User</label>
                      <div className="input-group mb-2">
                        <span className="input-group-text">
                          <IconSearch size={16} />
                        </span>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Search users by email..."
                          value={userSearchTerm}
                          onChange={(e) => setUserSearchTerm(e.target.value)}
                        />
                      </div>
                      {loadingUsers ? (
                        <div className="text-center py-3">
                          <IconLoader2 size={24} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                        </div>
                      ) : (
                        <div className="list-group" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          {filteredUsers.slice(0, 10).map((user) => (
                            <button
                              key={user.id}
                              type="button"
                              className={`list-group-item list-group-item-action d-flex align-items-center ${selectedUserId === user.id ? 'active' : ''}`}
                              onClick={() => setSelectedUserId(user.id)}
                            >
                              <span className={`avatar avatar-xs ${selectedUserId === user.id ? 'bg-white text-primary' : 'bg-blue-lt'} me-2`}>
                                <IconUser size={14} />
                              </span>
                              {user.email}
                            </button>
                          ))}
                          {filteredUsers.length === 0 && (
                            <div className="text-muted text-center py-2">No users found</div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Audience Type Selection */}
                    <div className="mb-3">
                      <label className="form-label required">Audience Type</label>
                      <div className="btn-group w-100" role="group">
                        <input
                          type="radio"
                          className="btn-check"
                          name="audienceType"
                          id="typeStandard"
                          checked={newAudienceType === 'standard'}
                          onChange={() => setNewAudienceType('standard')}
                        />
                        <label className="btn btn-outline-primary" htmlFor="typeStandard">
                          Standard Audience
                        </label>
                        <input
                          type="radio"
                          className="btn-check"
                          name="audienceType"
                          id="typeCustom"
                          checked={newAudienceType === 'custom'}
                          onChange={() => setNewAudienceType('custom')}
                        />
                        <label className="btn btn-outline-primary" htmlFor="typeCustom">
                          Custom Audience
                        </label>
                      </div>
                    </div>

                    {/* Audience Name */}
                    <div className="mb-3">
                      <label className="form-label required">Audience Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Enter audience name"
                        value={newAudienceName}
                        onChange={(e) => setNewAudienceName(e.target.value)}
                      />
                    </div>

                    {newAudienceType === 'standard' ? (
                      <div className="mb-3">
                        <label className="form-label">Days Back</label>
                        <input
                          type="number"
                          className="form-control"
                          min={1}
                          max={90}
                          value={newAudienceDaysBack}
                          onChange={(e) => setNewAudienceDaysBack(parseInt(e.target.value) || 7)}
                        />
                        <small className="form-hint">Number of days of data to include (1-90)</small>
                      </div>
                    ) : (
                      <div className="mb-3">
                        <label className="form-label">Description</label>
                        <textarea
                          className="form-control"
                          rows={3}
                          placeholder="Describe this custom audience..."
                          value={newAudienceDescription}
                          onChange={(e) => setNewAudienceDescription(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="alert alert-info mb-0">
                      <h4 className="alert-title">What happens next?</h4>
                      <p className="mb-0">
                        The audience will be created via the Traffic AI API using the selected user&apos;s
                        API key. It will immediately appear in their Audiences list.
                      </p>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCloseCreateModal}
                      disabled={processing}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleCreateAudience}
                      disabled={processing || !selectedUserId || !newAudienceName.trim()}
                    >
                      {processing ? (
                        <>
                          <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                          Creating...
                        </>
                      ) : (
                        <>
                          <IconPlus size={16} className="me-1" />
                          Create Audience
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="modal-header bg-success text-white">
                    <h5 className="modal-title">
                      <IconCheck className="icon me-2" />
                      Audience Created Successfully
                    </h5>
                    <button
                      type="button"
                      className="btn-close btn-close-white"
                      onClick={handleCloseCreateModal}
                    />
                  </div>
                  <div className="modal-body">
                    <div className="alert alert-success">
                      <h4 className="alert-title">Audience is now available!</h4>
                      <p className="mb-0">
                        The audience has been created for <strong>{createdForEmail}</strong>.
                        They can now see it on their Audiences page.
                      </p>
                    </div>

                    <div className="row g-2">
                      <div className="col-md-6">
                        <div className="card card-sm">
                          <div className="card-body">
                            <div className="text-muted small">Audience Name</div>
                            <div className="fw-semibold">{newAudienceName}</div>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="card card-sm">
                          <div className="card-body">
                            <div className="text-muted small">Type</div>
                            <span className={`badge ${getTypeBadgeClass(newAudienceType)}`}>
                              {newAudienceType}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {createdAudienceId && (
                      <div className="mt-3">
                        <div className="card card-sm">
                          <div className="card-body">
                            <div className="text-muted small">Audience ID</div>
                            <code className="fw-semibold">{createdAudienceId}</code>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setCreateSuccess(false);
                        setSelectedUserId('');
                        setNewAudienceName('');
                        setNewAudienceDescription('');
                      }}
                    >
                      Create Another
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleCloseCreateModal}
                    >
                      Done
                    </button>
                  </div>
                </>
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
