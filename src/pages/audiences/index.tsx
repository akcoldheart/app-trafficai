import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { TrafficAPI, Audience } from '@/lib/api';
import {
  IconPlus,
  IconMoon,
  IconRefresh,
  IconTrash,
  IconUsers,
  IconCheck,
  IconX,
  IconClock,
  IconUser,
  IconLoader2,
  IconEdit,
  IconEye,
} from '@tabler/icons-react';
import type { AudienceRequest, RequestStatus } from '@/lib/supabase/types';

interface EditFormData {
  name: string;
  request_type: 'standard' | 'custom';
  // Standard fields
  days_back: number;
  minAge: string;
  maxAge: string;
  gender: string;
  cities: string;
  states: string;
  industries: string[];
  departments: string[];
  seniority: string[];
  segments: string;
  // Custom fields
  topic: string;
  description: string;
}

export default function Audiences() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audienceRequests, setAudienceRequests] = useState<AudienceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'audiences' | 'requests'>('audiences');
  const [processing, setProcessing] = useState(false);
  const pageSize = 20;

  // Attribute options for dropdowns
  const [industryOptions, setIndustryOptions] = useState<string[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [seniorityOptions, setSeniorityOptions] = useState<string[]>([]);
  const [attributesLoaded, setAttributesLoaded] = useState(false);

  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRequest, setEditingRequest] = useState<AudienceRequest | null>(null);
  const [editFormData, setEditFormData] = useState<EditFormData>({
    name: '',
    request_type: 'standard',
    days_back: 7,
    minAge: '',
    maxAge: '',
    gender: '',
    cities: '',
    states: '',
    industries: [],
    departments: [],
    seniority: [],
    segments: '',
    topic: '',
    description: '',
  });
  const [adminNotes, setAdminNotes] = useState('');

  // Load attribute options for dropdowns
  const loadAttributes = useCallback(async () => {
    if (attributesLoaded) return;

    try {
      const industriesData = await TrafficAPI.getAudienceAttributes('industries');
      setIndustryOptions((industriesData as unknown as { Attributes?: string[]; attributes?: string[] }).Attributes ||
                   (industriesData as unknown as { attributes?: string[] }).attributes || []);
    } catch (error) {
      console.error('Error loading industries:', error);
    }

    try {
      const departmentsData = await TrafficAPI.getAudienceAttributes('departments');
      setDepartmentOptions((departmentsData as unknown as { Attributes?: string[]; attributes?: string[] }).Attributes ||
                    (departmentsData as unknown as { attributes?: string[] }).attributes || []);
    } catch (error) {
      console.error('Error loading departments:', error);
    }

    try {
      const seniorityData = await TrafficAPI.getAudienceAttributes('seniority');
      setSeniorityOptions((seniorityData as unknown as { Attributes?: string[]; attributes?: string[] }).Attributes ||
                  (seniorityData as unknown as { attributes?: string[] }).attributes || []);
    } catch (error) {
      console.error('Error loading seniority:', error);
    }

    setAttributesLoaded(true);
  }, [attributesLoaded]);

  const loadAudiences = useCallback(async (page = 1) => {
    setLoading(true);
    setCurrentPage(page);

    try {
      const data = await TrafficAPI.getAudiences(page, pageSize);
      setAudiences(data.Data || []);
      setTotalRecords(data.total_records || 0);
      setTotalPages(Math.ceil((data.total_records || 0) / pageSize));
    } catch (error) {
      console.error('Error loading audiences:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAudienceRequests = useCallback(async () => {
    try {
      const response = await fetch('/api/audience-requests');
      const data = await response.json();
      if (response.ok) {
        setAudienceRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Error loading audience requests:', error);
    }
  }, []);

  useEffect(() => {
    loadAudiences();
    loadAudienceRequests();
    // Preload attributes for admin modal
    if (isAdmin) {
      loadAttributes();
    }
  }, [loadAudiences, loadAudienceRequests, isAdmin, loadAttributes]);

  // Handle tab query parameter from URL
  useEffect(() => {
    if (router.query.tab === 'requests') {
      setActiveTab('requests');
      // Clear the query parameter from URL
      router.replace('/audiences', undefined, { shallow: true });
    }
  }, [router.query.tab, router]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await TrafficAPI.deleteAudience(deleteId);
      setShowDeleteModal(false);
      setDeleteId(null);
      loadAudiences(currentPage);
    } catch (error) {
      alert('Error deleting audience: ' + (error as Error).message);
    }
  };

  const openEditModal = (request: AudienceRequest) => {
    setEditingRequest(request);
    const formData = request.form_data as Record<string, unknown>;
    const filters = (formData.filters || {}) as Record<string, unknown>;
    const businessProfile = (filters.businessProfile || {}) as Record<string, string[]>;
    const age = (filters.age || {}) as Record<string, number>;

    if (request.request_type === 'custom') {
      setEditFormData({
        name: request.name,
        request_type: 'custom',
        days_back: 7,
        minAge: '',
        maxAge: '',
        gender: '',
        cities: '',
        states: '',
        industries: [],
        departments: [],
        seniority: [],
        segments: '',
        topic: (formData.topic as string) || request.name,
        description: (formData.description as string) || '',
      });
    } else {
      setEditFormData({
        name: request.name,
        request_type: 'standard',
        days_back: (formData.days_back as number) || 7,
        minAge: age.minAge?.toString() || '',
        maxAge: age.maxAge?.toString() || '',
        gender: (filters.gender as string) || '',
        cities: Array.isArray(filters.city) ? (filters.city as string[]).join(', ') : '',
        states: Array.isArray(filters.state) ? (filters.state as string[]).join(', ') : '',
        industries: businessProfile.industry || [],
        departments: businessProfile.department || [],
        seniority: businessProfile.seniority || [],
        segments: Array.isArray(formData.segment) ? (formData.segment as string[]).join(', ') : '',
        topic: '',
        description: '',
      });
    }
    setAdminNotes('');
    setShowEditModal(true);
  };

  const buildEditedFormData = (): Record<string, unknown> => {
    if (editFormData.request_type === 'custom') {
      return {
        topic: editFormData.topic,
        description: editFormData.description,
      };
    }

    const filters: Record<string, unknown> = {};

    // Age filter
    if (editFormData.minAge || editFormData.maxAge) {
      filters.age = {};
      if (editFormData.minAge) (filters.age as Record<string, number>).minAge = parseInt(editFormData.minAge);
      if (editFormData.maxAge) (filters.age as Record<string, number>).maxAge = parseInt(editFormData.maxAge);
    }

    // Gender filter
    if (editFormData.gender) filters.gender = editFormData.gender;

    // City filter
    if (editFormData.cities) {
      filters.city = editFormData.cities.split(',').map((c) => c.trim()).filter((c) => c);
    }

    // State filter
    if (editFormData.states) {
      filters.state = editFormData.states.split(',').map((s) => s.trim()).filter((s) => s);
    }

    // Business profile filters
    const businessProfile: Record<string, string[]> = {};
    if (editFormData.industries.length > 0) businessProfile.industry = editFormData.industries;
    if (editFormData.departments.length > 0) businessProfile.department = editFormData.departments;
    if (editFormData.seniority.length > 0) businessProfile.seniority = editFormData.seniority;
    if (Object.keys(businessProfile).length > 0) filters.businessProfile = businessProfile;

    // Segments
    const segmentList = editFormData.segments ? editFormData.segments.split(',').map((s) => s.trim()).filter((s) => s) : [];

    return {
      filters,
      days_back: editFormData.days_back,
      ...(segmentList.length > 0 ? { segment: segmentList } : {}),
    };
  };

  const handleApproveWithEdit = async () => {
    if (!editingRequest) return;

    setProcessing(true);
    try {
      const editedFormData = buildEditedFormData();
      const response = await fetch(`/api/admin/audience-requests/${editingRequest.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_notes: adminNotes,
          edited_name: editFormData.name,
          edited_form_data: editedFormData,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve request');
      }

      setShowEditModal(false);
      setEditingRequest(null);
      await Promise.all([loadAudiences(currentPage), loadAudienceRequests()]);
      setActiveTab('audiences');
      alert('Request approved! Audience created successfully.');
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRejectRequest = async (request: AudienceRequest) => {
    const reason = prompt('Enter rejection reason (optional):');
    if (reason === null) return;

    setProcessing(true);
    try {
      const response = await fetch(`/api/admin/audience-requests/${request.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject request');
      }

      setAudienceRequests(audienceRequests.map(r =>
        r.id === request.id ? { ...r, status: 'rejected' as RequestStatus, admin_notes: reason } : r
      ));
      alert('Request rejected.');
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this request?')) return;

    try {
      const response = await fetch(`/api/audience-requests/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete request');
      }

      setAudienceRequests(audienceRequests.filter(r => r.id !== id));
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const getRequestStatusBadgeClass = (status: RequestStatus) => {
    switch (status) {
      case 'approved': return 'bg-green-lt text-green';
      case 'rejected': return 'bg-red-lt text-red';
      case 'pending': return 'bg-yellow-lt text-yellow';
      default: return 'bg-secondary-lt';
    }
  };

  const pendingRequestCount = audienceRequests.filter(r => r.status === 'pending').length;
  const start = audiences.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, totalRecords);

  return (
    <Layout title="Audiences" pageTitle="Audiences" pagePretitle="Traffic AI">
      <div className="row row-cards">
        {/* Header Actions */}
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h3 className="mb-1">Manage Audiences</h3>
                  <p className="text-muted mb-0">View, create, and manage your target audiences</p>
                </div>
                <div className="btn-list">
                  <Link href="/audiences/custom" className="btn btn-outline-primary">
                    <IconMoon className="icon" />
                    {isAdmin ? 'Custom Audience' : 'Request Custom'}
                  </Link>
                  <Link href="/audiences/create" className="btn btn-primary">
                    <IconPlus className="icon" />
                    {isAdmin ? 'Create Audience' : 'Request Audience'}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs - Show when admin or when user has requests */}
        {(isAdmin || audienceRequests.length > 0) && (
          <div className="col-12">
            <ul className="nav nav-tabs">
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'audiences' ? 'active' : ''}`}
                  onClick={() => setActiveTab('audiences')}
                >
                  <IconUsers className="icon me-1" />
                  Audiences ({totalRecords})
                </button>
              </li>
              <li className="nav-item">
                <button
                  className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`}
                  onClick={() => setActiveTab('requests')}
                >
                  <IconClock className="icon me-1" />
                  Requests
                  {pendingRequestCount > 0 && (
                    <span className="badge bg-yellow-lt text-yellow ms-2">{pendingRequestCount}</span>
                  )}
                </button>
              </li>
            </ul>
          </div>
        )}

        {/* Audiences Tab */}
        {activeTab === 'audiences' && (
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">{isAdmin ? 'All Audiences' : 'Your Audiences'}</h3>
                <div className="card-actions">
                  <button className="btn btn-sm" onClick={() => loadAudiences(currentPage)}>
                    <IconRefresh className="icon" />
                    Refresh
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Audience ID</th>
                      <th>Total Records</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th className="w-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td colSpan={6} className="text-center py-4">
                          <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                          Loading audiences...
                        </td>
                      </tr>
                    ) : audiences.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center text-muted py-4">
                          No audiences found. <Link href="/audiences/create">{isAdmin ? 'Create your first audience' : 'Request your first audience'}</Link>
                        </td>
                      </tr>
                    ) : (
                      audiences.map((audience) => {
                        const id = audience.id || audience.audienceId || '';
                        return (
                          <tr key={id}>
                            <td>
                              <div className="d-flex align-items-center">
                                <span className="avatar avatar-sm bg-primary-lt me-2">
                                  <IconUsers className="icon" />
                                </span>
                                <span className="text-reset">{audience.name || 'Unnamed Audience'}</span>
                              </div>
                            </td>
                            <td><code className="small">{id}</code></td>
                            <td>{audience.total_records?.toLocaleString() || '-'}</td>
                            <td>
                              <span className={`badge ${
                                (audience as unknown as { status?: string }).status === 'ready' ? 'bg-green' :
                                (audience as unknown as { status?: string }).status === 'processing' ? 'bg-yellow' : 'bg-blue'
                              }`}>
                                {(audience as unknown as { status?: string }).status || 'Active'}
                              </span>
                            </td>
                            <td className="text-muted">
                              {audience.created_at ? new Date(audience.created_at).toLocaleDateString() : '-'}
                            </td>
                            <td>
                              <div className="btn-list flex-nowrap">
                                <Link href={`/audiences/${id}`} className="btn btn-sm">View</Link>
                                <button
                                  className="btn btn-sm btn-outline-danger"
                                  onClick={() => {
                                    setDeleteId(id);
                                    setShowDeleteModal(true);
                                  }}
                                >
                                  <IconTrash className="icon icon-sm" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <div className="card-footer d-flex align-items-center">
                <p className="m-0 text-muted">
                  Showing {start} to {end} of {totalRecords} entries
                </p>
                <ul className="pagination m-0 ms-auto">
                  <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                    <button className="page-link" onClick={() => loadAudiences(currentPage - 1)}>
                      prev
                    </button>
                  </li>
                  {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
                    <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
                      <button className="page-link" onClick={() => loadAudiences(page)}>
                        {page}
                      </button>
                    </li>
                  ))}
                  <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                    <button className="page-link" onClick={() => loadAudiences(currentPage + 1)}>
                      next
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <div className="col-12">
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  {isAdmin ? 'All Audience Requests' : 'Your Requests'}
                </h3>
                <div className="card-actions">
                  <button className="btn btn-sm" onClick={loadAudienceRequests}>
                    <IconRefresh className="icon" />
                    Refresh
                  </button>
                </div>
              </div>
              <div className="table-responsive">
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      {isAdmin && <th>User</th>}
                      <th>Status</th>
                      <th>Submitted</th>
                      <th className="w-1">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audienceRequests.filter(r => r.status === 'pending').length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 6 : 5} className="text-center text-muted py-4">
                          No pending requests
                        </td>
                      </tr>
                    ) : (
                      audienceRequests.filter(r => r.status === 'pending').map((request) => (
                        <tr key={request.id}>
                          <td>
                            <div className="d-flex align-items-center">
                              <span className={`avatar avatar-sm me-2 ${getRequestStatusBadgeClass(request.status)}`}>
                                {request.status === 'pending' && <IconClock className="icon" />}
                                {request.status === 'approved' && <IconCheck className="icon" />}
                                {request.status === 'rejected' && <IconX className="icon" />}
                              </span>
                              <div>
                                <div className="text-reset">{request.name}</div>
                                {request.request_type === 'custom' && (
                                  <small className="text-muted">
                                    {(request.form_data as { description?: string })?.description?.substring(0, 50)}...
                                  </small>
                                )}
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${request.request_type === 'custom' ? 'bg-purple-lt' : 'bg-blue-lt'}`}>
                              {request.request_type}
                            </span>
                          </td>
                          {isAdmin && (
                            <td>
                              <div className="d-flex align-items-center">
                                <IconUser size={14} className="me-1 text-muted" />
                                <span className="small">{request.user?.email || 'Unknown'}</span>
                              </div>
                            </td>
                          )}
                          <td>
                            <span className={`badge ${getRequestStatusBadgeClass(request.status)}`}>
                              {request.status}
                            </span>
                          </td>
                          <td className="text-muted">
                            {new Date(request.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            <div className="btn-list flex-nowrap">
                              {isAdmin && request.status === 'pending' && (
                                <>
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => openEditModal(request)}
                                    disabled={processing}
                                    title="View & Approve"
                                  >
                                    <IconEye size={14} className="me-1" />
                                    Review
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRejectRequest(request)}
                                    disabled={processing}
                                    title="Reject"
                                  >
                                    <IconX size={14} />
                                  </button>
                                </>
                              )}
                              {!isAdmin && request.status === 'pending' && (
                                <button
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => handleDeleteRequest(request.id)}
                                  title="Cancel Request"
                                >
                                  <IconTrash size={14} />
                                </button>
                              )}
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
        )}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal modal-blur fade show" style={{ display: 'block' }} tabIndex={-1}>
          <div className="modal-dialog modal-sm modal-dialog-centered">
            <div className="modal-content">
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowDeleteModal(false)}
              ></button>
              <div className="modal-status bg-danger"></div>
              <div className="modal-body text-center py-4">
                <IconTrash className="icon mb-2 text-danger icon-lg" />
                <h3>Are you sure?</h3>
                <div className="text-muted">
                  Do you really want to delete this audience? This action cannot be undone.
                </div>
              </div>
              <div className="modal-footer">
                <div className="w-100">
                  <div className="row">
                    <div className="col">
                      <button className="btn w-100" onClick={() => setShowDeleteModal(false)}>
                        Cancel
                      </button>
                    </div>
                    <div className="col">
                      <button className="btn btn-danger w-100" onClick={handleDelete}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowDeleteModal(false)}></div>
        </div>
      )}

      {/* Edit/Review Modal */}
      {showEditModal && editingRequest && (
        <>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1040 }}
            onClick={() => setShowEditModal(false)}
          />
          <div
            className="card"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '90%',
              maxWidth: '800px',
              maxHeight: '85vh',
              zIndex: 1050,
              display: 'flex',
              flexDirection: 'column',
              margin: 0,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h3 className="card-title">
                <IconEdit className="icon me-2" />
                Review Audience Request
              </h3>
              <div className="card-actions">
                <button type="button" className="btn-close" onClick={() => setShowEditModal(false)} />
              </div>
            </div>
            <div className="card-body" style={{ overflowY: 'auto', flex: 1 }}>
                <div className="alert alert-info mb-3">
                  <strong>Requester:</strong> {editingRequest.user?.email || 'Unknown'}
                  <span className="ms-3"><strong>Type:</strong> {editingRequest.request_type}</span>
                </div>

                {editFormData.request_type === 'custom' ? (
                  // Custom Audience Form
                  <>
                    <div className="mb-3">
                      <label className="form-label">Topic Name</label>
                      <input
                        type="text"
                        className="form-control"
                        value={editFormData.topic}
                        onChange={(e) => setEditFormData({ ...editFormData, topic: e.target.value, name: e.target.value })}
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Description</label>
                      <textarea
                        className="form-control"
                        rows={4}
                        value={editFormData.description}
                        onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                      />
                    </div>
                  </>
                ) : (
                  // Standard Audience Form
                  <>
                    <div className="row">
                      <div className="col-md-8">
                        <div className="mb-3">
                          <label className="form-label">Audience Name</label>
                          <input
                            type="text"
                            className="form-control"
                            value={editFormData.name}
                            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="mb-3">
                          <label className="form-label">Days Back</label>
                          <input
                            type="number"
                            className="form-control"
                            value={editFormData.days_back}
                            onChange={(e) => setEditFormData({ ...editFormData, days_back: parseInt(e.target.value) || 7 })}
                            min={1}
                            max={365}
                          />
                        </div>
                      </div>
                    </div>

                    <h4 className="mb-3">Demographics</h4>
                    <div className="row">
                      <div className="col-md-4">
                        <div className="mb-3">
                          <label className="form-label">Min Age</label>
                          <input
                            type="number"
                            className="form-control"
                            value={editFormData.minAge}
                            onChange={(e) => setEditFormData({ ...editFormData, minAge: e.target.value })}
                            placeholder="e.g., 25"
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="mb-3">
                          <label className="form-label">Max Age</label>
                          <input
                            type="number"
                            className="form-control"
                            value={editFormData.maxAge}
                            onChange={(e) => setEditFormData({ ...editFormData, maxAge: e.target.value })}
                            placeholder="e.g., 65"
                          />
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="mb-3">
                          <label className="form-label">Gender</label>
                          <select
                            className="form-select"
                            value={editFormData.gender}
                            onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                          >
                            <option value="">Any</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <h4 className="mb-3">Location</h4>
                    <div className="row">
                      <div className="col-md-6">
                        <div className="mb-3">
                          <label className="form-label">Cities</label>
                          <input
                            type="text"
                            className="form-control"
                            value={editFormData.cities}
                            onChange={(e) => setEditFormData({ ...editFormData, cities: e.target.value })}
                            placeholder="e.g., New York, Los Angeles"
                          />
                          <small className="form-hint">Comma-separated</small>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="mb-3">
                          <label className="form-label">States</label>
                          <input
                            type="text"
                            className="form-control"
                            value={editFormData.states}
                            onChange={(e) => setEditFormData({ ...editFormData, states: e.target.value })}
                            placeholder="e.g., CA, NY, TX"
                          />
                          <small className="form-hint">Comma-separated</small>
                        </div>
                      </div>
                    </div>

                    <h4 className="mb-3">Business Profile</h4>
                    <div className="mb-3">
                      <label className="form-label">Industries</label>
                      <select
                        className="form-select"
                        multiple
                        size={6}
                        value={editFormData.industries}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          industries: Array.from(e.target.selectedOptions, (o) => o.value)
                        })}
                      >
                        {industryOptions.map((industry) => (
                          <option key={industry} value={industry}>
                            {industry}
                          </option>
                        ))}
                      </select>
                      <small className="form-hint">Hold Ctrl/Cmd to select multiple industries</small>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Departments</label>
                      <select
                        className="form-select"
                        multiple
                        size={6}
                        value={editFormData.departments}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          departments: Array.from(e.target.selectedOptions, (o) => o.value)
                        })}
                      >
                        {departmentOptions.map((dept) => (
                          <option key={dept} value={dept}>
                            {dept}
                          </option>
                        ))}
                      </select>
                      <small className="form-hint">Hold Ctrl/Cmd to select multiple departments</small>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Seniority Level</label>
                      <select
                        className="form-select"
                        multiple
                        size={5}
                        value={editFormData.seniority}
                        onChange={(e) => setEditFormData({
                          ...editFormData,
                          seniority: Array.from(e.target.selectedOptions, (o) => o.value)
                        })}
                      >
                        {seniorityOptions.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                      <small className="form-hint">Hold Ctrl/Cmd to select multiple levels</small>
                    </div>

                    <h4 className="mb-3">Segments</h4>
                    <div className="mb-3">
                      <label className="form-label">Segment IDs</label>
                      <input
                        type="text"
                        className="form-control"
                        value={editFormData.segments}
                        onChange={(e) => setEditFormData({ ...editFormData, segments: e.target.value })}
                        placeholder="e.g., 100073, 100074"
                      />
                      <small className="form-hint">Comma-separated</small>
                    </div>
                  </>
                )}

                <hr className="my-3" />
                <div className="mb-3">
                  <label className="form-label">Admin Notes (optional)</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Add any notes about this approval..."
                  />
                </div>
              </div>
            <div className="card-footer">
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn" onClick={() => setShowEditModal(false)} disabled={processing}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleApproveWithEdit}
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      Creating...
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} className="me-1" />
                      Approve & Create Audience
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </Layout>
  );
}
