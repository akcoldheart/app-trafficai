import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { TrafficAPI } from '@/lib/api';
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
  IconTrash,
  IconEdit,
  IconPlus,
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

interface EditFormData {
  name: string;
  request_type: 'standard' | 'custom';
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
  topic: string;
  description: string;
}

// Static fallback options for dropdowns
const STATIC_INDUSTRIES = [
  'Accounting', 'Advertising', 'Aerospace', 'Agriculture', 'Automotive',
  'Banking', 'Biotechnology', 'Broadcasting', 'Business Services', 'Chemicals',
  'Communications', 'Computer Hardware', 'Computer Software', 'Construction',
  'Consulting', 'Consumer Products', 'Education', 'Electronics', 'Energy',
  'Engineering', 'Entertainment', 'Environmental', 'Finance', 'Food & Beverage',
  'Government', 'Healthcare', 'Hospitality', 'Insurance', 'Internet',
  'Legal', 'Manufacturing', 'Marketing', 'Media', 'Medical Devices',
  'Mining', 'Non-Profit', 'Pharmaceuticals', 'Real Estate', 'Real Estate Agents And Brokers',
  'Retail', 'Semiconductors', 'Technology', 'Telecommunications', 'Transportation',
  'Travel', 'Utilities', 'Venture Capital', 'Wholesale',
];

const STATIC_DEPARTMENTS = [
  'Accounting', 'Administrative', 'Business Development', 'Community And Social Services',
  'Customer Service', 'Engineering', 'Executive', 'Finance', 'General Management',
  'Human Resources', 'Information Technology', 'Legal', 'Marketing',
  'Operations', 'Product Management', 'Project Management', 'Public Relations',
  'Purchasing', 'Quality Assurance', 'Research & Development', 'Sales',
  'Strategy', 'Supply Chain', 'Training',
];

const STATIC_SENIORITY = [
  'Entry', 'Individual Contributor', 'Manager', 'Senior Manager',
  'Director', 'Senior Director', 'VP', 'SVP', 'EVP', 'C-Level', 'Owner', 'Partner',
];

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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<{ type: 'pixel' | 'audience'; request: PixelRequest | AudienceRequest } | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Pixel creation fields for approve modal
  const [pixelCode, setPixelCode] = useState('');
  const [customInstallationCode, setCustomInstallationCode] = useState('');

  // Audience form state (matching audiences page)
  const [editingAudienceRequest, setEditingAudienceRequest] = useState<AudienceRequest | null>(null);
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

  // Dropdown options
  const [industryOptions, setIndustryOptions] = useState<string[]>(STATIC_INDUSTRIES);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>(STATIC_DEPARTMENTS);
  const [seniorityOptions, setSeniorityOptions] = useState<string[]>(STATIC_SENIORITY);
  const [attributesLoaded, setAttributesLoaded] = useState(false);

  // Manual upload modal state
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualAudienceUrl, setManualAudienceUrl] = useState('');
  const [manualAudienceName, setManualAudienceName] = useState('');
  const [manualAudienceData, setManualAudienceData] = useState('');
  const [fetchingManualAudience, setFetchingManualAudience] = useState(false);
  const [creatingManualAudience, setCreatingManualAudience] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Helper to extract attributes from various response formats
  const extractAttributes = (data: unknown): string[] => {
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (Array.isArray(obj.Attributes)) return obj.Attributes;
      if (Array.isArray(obj.attributes)) return obj.attributes;
      if (Array.isArray(obj.data)) return obj.data;
    }
    return [];
  };

  // Load attribute options for dropdowns
  const loadAttributes = useCallback(async () => {
    if (attributesLoaded) return;

    try {
      const industriesData = await TrafficAPI.getAudienceAttributes('industries');
      const extracted = extractAttributes(industriesData);
      if (extracted.length > 0) setIndustryOptions(extracted);
    } catch (error) {
      console.error('Error loading industries, using static list:', error);
    }

    try {
      const departmentsData = await TrafficAPI.getAudienceAttributes('departments');
      const extracted = extractAttributes(departmentsData);
      if (extracted.length > 0) setDepartmentOptions(extracted);
    } catch (error) {
      console.error('Error loading departments, using static list:', error);
    }

    try {
      const seniorityData = await TrafficAPI.getAudienceAttributes('seniority');
      const extracted = extractAttributes(seniorityData);
      if (extracted.length > 0) setSeniorityOptions(extracted);
    } catch (error) {
      console.error('Error loading seniority, using static list:', error);
    }

    setAttributesLoaded(true);
  }, [attributesLoaded]);

  // Open audience review modal
  const openAudienceReviewModal = (request: AudienceRequest) => {
    setEditingAudienceRequest(request);
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
    loadAttributes();
    setShowApproveModal(true);
  };

  // Build edited form data for API
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

  // Fetch audience data from manual URL
  const handleFetchManualAudience = async () => {
    if (!manualAudienceUrl) return;

    setFetchingManualAudience(true);
    try {
      const response = await fetch('/api/proxy/fetch-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ url: manualAudienceUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error: ${response.status}`);
      }

      setManualAudienceData(JSON.stringify(data, null, 2));
      showToast('Data fetched successfully!', 'success');
    } catch (error) {
      showToast('Error fetching data: ' + (error as Error).message, 'error');
    } finally {
      setFetchingManualAudience(false);
    }
  };

  // Create manual audience from fetched/uploaded data
  const handleCreateManualAudience = async () => {
    if (!manualAudienceName || !manualAudienceData) {
      showToast('Please provide a name and audience data', 'error');
      return;
    }

    setCreatingManualAudience(true);
    try {
      let audienceData;
      try {
        audienceData = JSON.parse(manualAudienceData);
      } catch {
        showToast('Invalid JSON data', 'error');
        setCreatingManualAudience(false);
        return;
      }

      // Use editingAudienceRequest to link to the request
      const linkedRequestId = editingAudienceRequest?.id || null;

      const response = await fetch('/api/admin/audiences/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: manualAudienceName,
          data: audienceData,
          request_id: linkedRequestId,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create audience');
      }

      showToast('Audience created successfully!', 'success');
      setShowManualModal(false);
      setManualAudienceUrl('');
      setManualAudienceName('');
      setManualAudienceData('');

      // Close the review modal and refresh requests
      if (editingAudienceRequest) {
        setShowApproveModal(false);
        setEditingAudienceRequest(null);
        setSelectedRequest(null);
      }
      fetchRequests();
    } catch (error) {
      showToast('Error: ' + (error as Error).message, 'error');
    } finally {
      setCreatingManualAudience(false);
    }
  };

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

    // For pixel requests, validate required fields
    if (selectedRequest.type === 'pixel') {
      if (!pixelCode.trim()) {
        showToast('Pixel ID is required', 'error');
        return;
      }
      if (!customInstallationCode.trim()) {
        showToast('Custom Installation Code is required', 'error');
        return;
      }

      setProcessingId(selectedRequest.request.id);
      try {
        const response = await fetch(`/api/admin/pixel-requests/${selectedRequest.request.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_notes: adminNotes,
            pixel_code: pixelCode.trim(),
            custom_installation_code: customInstallationCode.trim(),
          }),
        });

        if (response.ok) {
          fetchRequests();
          setShowApproveModal(false);
          setSelectedRequest(null);
          setAdminNotes('');
          setPixelCode('');
          setCustomInstallationCode('');
          showToast('Pixel created successfully!', 'success');
        } else {
          const data = await response.json();
          showToast(data.error || 'Failed to create pixel', 'error');
        }
      } catch (error) {
        console.error('Error approving request:', error);
        showToast('Failed to create pixel', 'error');
      } finally {
        setProcessingId(null);
      }
      return;
    }

    // For audience requests, use the form data
    if (selectedRequest.type === 'audience' && editingAudienceRequest) {
      if (!editFormData.name.trim()) {
        showToast('Audience name is required', 'error');
        return;
      }

      setProcessingId(selectedRequest.request.id);
      try {
        const editedFormData = buildEditedFormData();
        const response = await fetch(`/api/admin/audience-requests/${selectedRequest.request.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_notes: adminNotes,
            edited_name: editFormData.name,
            edited_form_data: editedFormData,
          }),
        });

        if (response.ok) {
          fetchRequests();
          setShowApproveModal(false);
          setSelectedRequest(null);
          setEditingAudienceRequest(null);
          setAdminNotes('');
          showToast('Audience created successfully!', 'success');
        } else {
          const data = await response.json();
          showToast(data.error || 'Failed to create audience', 'error');
        }
      } catch (error) {
        console.error('Error approving request:', error);
        showToast('Failed to create audience', 'error');
      } finally {
        setProcessingId(null);
      }
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

  const handleDelete = async () => {
    if (!selectedRequest) return;

    setProcessingId(selectedRequest.request.id);
    try {
      const endpoint = selectedRequest.type === 'pixel'
        ? `/api/pixel-requests/${selectedRequest.request.id}`
        : `/api/audience-requests/${selectedRequest.request.id}`;

      const response = await fetch(endpoint, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchRequests();
        setShowDeleteModal(false);
        setSelectedRequest(null);
        showToast('Request deleted successfully', 'success');
      } else {
        const data = await response.json();
        showToast(data.error || 'Failed to delete request', 'error');
      }
    } catch (error) {
      console.error('Error deleting request:', error);
      showToast('Failed to delete request', 'error');
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
    <Layout title="All Requests" pageTitle="All Requests">
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
                      <div className="d-flex gap-1">
                        {request.status === 'pending' && (
                          <>
                            <button
                              className="btn btn-success btn-sm"
                              onClick={() => {
                                setSelectedRequest({ type, request });
                                setAdminNotes('');
                                if (type === 'pixel') {
                                  setPixelCode('');
                                  setCustomInstallationCode('');
                                  setShowApproveModal(true);
                                } else {
                                  // Use the full review modal for audience requests
                                  openAudienceReviewModal(request as AudienceRequest);
                                }
                              }}
                              disabled={processingId === request.id}
                              title={type === 'pixel' ? 'Approve' : 'Review'}
                            >
                              {type === 'pixel' ? <IconCheck size={14} /> : <IconEye size={14} />}
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
                          </>
                        )}
                        <button
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => {
                            setSelectedRequest({ type, request });
                            setShowDeleteModal(true);
                          }}
                          disabled={processingId === request.id}
                          title="Delete"
                        >
                          <IconTrash size={14} />
                        </button>
                      </div>
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
            <div className={`modal-dialog modal-dialog-centered modal-dialog-scrollable ${selectedRequest.type === 'audience' ? 'modal-xl' : 'modal-lg'}`}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    {selectedRequest.type === 'pixel' ? (
                      'Create Pixel for User'
                    ) : (
                      <>
                        <IconEdit size={18} className="me-2" />
                        Review Audience Request
                      </>
                    )}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowApproveModal(false);
                      setEditingAudienceRequest(null);
                    }}
                  />
                </div>
                <div className="modal-body">
                  {/* Request Summary */}
                  <div className="alert alert-info mb-4">
                    <div className="d-flex align-items-center">
                      {selectedRequest.type === 'pixel' ? (
                        <IconCode size={20} className="me-2" />
                      ) : (
                        <IconUsers size={20} className="me-2" />
                      )}
                      <div>
                        <strong>{selectedRequest.request.name}</strong>
                        <div className="text-muted small">
                          {selectedRequest.type === 'pixel'
                            ? (selectedRequest.request as PixelRequest).domain
                            : `${(selectedRequest.request as AudienceRequest).request_type} audience`}
                          {' • '}
                          {selectedRequest.request.user?.email}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Pixel-specific fields */}
                  {selectedRequest.type === 'pixel' && (
                    <>
                      <div className="mb-3">
                        <label className="form-label required">
                          <span className="badge bg-primary me-2">1</span>
                          Pixel ID
                        </label>
                        <input
                          type="text"
                          className="form-control font-monospace"
                          value={pixelCode}
                          onChange={(e) => setPixelCode(e.target.value)}
                          placeholder="e.g., 588b2ebe-b6ec-4a0d-b896-fc29986afe74"
                        />
                        <small className="text-muted">Enter the UUID pixel identifier from your tracking provider</small>
                      </div>

                      <div className="mb-3">
                        <label className="form-label required">
                          <span className="badge bg-primary me-2">2</span>
                          Custom Installation Code
                        </label>
                        <textarea
                          className="form-control font-monospace"
                          rows={5}
                          value={customInstallationCode}
                          onChange={(e) => setCustomInstallationCode(e.target.value)}
                          placeholder='<script src="https://cdn.example.com/pixels/YOUR-PIXEL-ID/" async></script>'
                          style={{ fontSize: '12px', backgroundColor: '#1e293b', color: '#e2e8f0' }}
                        />
                        <small className="text-muted">Paste the custom tracking script code</small>
                      </div>

                      <hr className="my-3" />
                    </>
                  )}

                  {/* Audience-specific fields - Full form like Audiences page */}
                  {selectedRequest.type === 'audience' && editingAudienceRequest && (
                    <>
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
                              size={5}
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
                            <small className="form-hint">Hold Ctrl/Cmd to select multiple</small>
                          </div>
                          <div className="mb-3">
                            <label className="form-label">Departments</label>
                            <select
                              className="form-select"
                              multiple
                              size={5}
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
                            <small className="form-hint">Hold Ctrl/Cmd to select multiple</small>
                          </div>
                          <div className="mb-3">
                            <label className="form-label">Seniority Level</label>
                            <select
                              className="form-select"
                              multiple
                              size={4}
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
                            <small className="form-hint">Hold Ctrl/Cmd to select multiple</small>
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
                    </>
                  )}

                  {/* Pixel Admin Notes */}
                  {selectedRequest.type === 'pixel' && (
                    <div className="mb-3">
                      <label className="form-label">
                        <span className="badge bg-primary me-2">3</span>
                        Admin Notes (optional)
                      </label>
                      <textarea
                        className="form-control"
                        rows={2}
                        value={adminNotes}
                        onChange={(e) => setAdminNotes(e.target.value)}
                        placeholder="Add any notes for this approval..."
                      />
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <div className="d-flex justify-content-between w-100">
                    {/* Manual Upload button on left for audience requests */}
                    {selectedRequest.type === 'audience' ? (
                      <button
                        type="button"
                        className="btn btn-outline-primary"
                        onClick={() => {
                          setManualAudienceName(editFormData.name || editingAudienceRequest?.name || '');
                          setManualAudienceUrl('');
                          setManualAudienceData('');
                          setShowManualModal(true);
                        }}
                        disabled={processingId === selectedRequest.request.id}
                      >
                        <IconPlus size={16} className="me-1" />
                        Manual Upload
                      </button>
                    ) : (
                      <div></div>
                    )}

                    {/* Cancel and Approve buttons on right */}
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          setShowApproveModal(false);
                          setEditingAudienceRequest(null);
                        }}
                        disabled={processingId === selectedRequest.request.id}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-success"
                        onClick={handleApprove}
                        disabled={
                          processingId === selectedRequest.request.id ||
                          (selectedRequest.type === 'pixel' && (!pixelCode.trim() || !customInstallationCode.trim())) ||
                          (selectedRequest.type === 'audience' && !editFormData.name.trim())
                        }
                      >
                        {processingId === selectedRequest.request.id ? (
                          <>
                            <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                            {selectedRequest.type === 'pixel' ? 'Creating Pixel...' : 'Creating Audience...'}
                          </>
                        ) : (
                          <>
                            <IconCheck size={14} className="me-1" />
                            {selectedRequest.type === 'pixel' ? 'Create Pixel' : 'Approve & Create Audience'}
                          </>
                        )}
                      </button>
                    </div>
                  </div>
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

      {/* Delete Modal */}
      {showDeleteModal && selectedRequest && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }} />
          <div className="modal modal-blur fade show" style={{ display: 'block', zIndex: 1050 }}>
            <div className="modal-dialog modal-sm modal-dialog-centered">
              <div className="modal-content">
                <div className="modal-status bg-danger" />
                <div className="modal-body text-center py-4">
                  <IconTrash size={48} className="text-danger mb-3" />
                  <h3>Delete Request?</h3>
                  <p className="text-muted">
                    Are you sure you want to delete the{' '}
                    <strong>{selectedRequest.type}</strong> request:{' '}
                    <strong>{selectedRequest.request.name}</strong>?
                    <br />
                    This action cannot be undone.
                  </p>
                </div>
                <div className="modal-footer">
                  <div className="w-100">
                    <div className="row">
                      <div className="col">
                        <button
                          className="btn w-100"
                          onClick={() => setShowDeleteModal(false)}
                          disabled={processingId === selectedRequest.request.id}
                        >
                          Cancel
                        </button>
                      </div>
                      <div className="col">
                        <button
                          className="btn btn-danger w-100"
                          onClick={handleDelete}
                          disabled={processingId === selectedRequest.request.id}
                        >
                          {processingId === selectedRequest.request.id ? (
                            <>
                              <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                              Deleting...
                            </>
                          ) : (
                            'Delete'
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Manual Audience Upload Modal */}
      {showManualModal && (
        <>
          <div
            className="modal-backdrop fade show"
            style={{ zIndex: 1060 }}
            onClick={() => setShowManualModal(false)}
          />
          <div
            className="card"
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1070,
              width: '700px',
              maxWidth: '95vw',
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div className="card-header">
              <h3 className="card-title">
                <IconPlus size={20} className="me-2" />
                Manual Audience Upload
              </h3>
              <div className="card-actions">
                <button type="button" className="btn-close" onClick={() => setShowManualModal(false)} />
              </div>
            </div>
            <div className="card-body" style={{ overflowY: 'auto', flex: 1 }}>
              {/* Show which request this will be linked to */}
              {editingAudienceRequest && (
                <div className="alert alert-info mb-3">
                  <strong>Note:</strong> This audience will be assigned to request: {editingAudienceRequest.name}
                </div>
              )}

              <div className="mb-3">
                <label className="form-label">Audience Name <span className="text-danger">*</span></label>
                <input
                  type="text"
                  className="form-control"
                  value={manualAudienceName}
                  onChange={(e) => setManualAudienceName(e.target.value)}
                  placeholder="Enter audience name"
                />
              </div>

              <div className="mb-3">
                <label className="form-label">Fetch from URL (Optional)</label>
                <div className="input-group">
                  <input
                    type="url"
                    className="form-control"
                    value={manualAudienceUrl}
                    onChange={(e) => setManualAudienceUrl(e.target.value)}
                    placeholder="https://api.example.com/audience-data"
                  />
                  <button
                    className="btn btn-outline-primary"
                    onClick={handleFetchManualAudience}
                    disabled={fetchingManualAudience || !manualAudienceUrl}
                  >
                    {fetchingManualAudience ? (
                      <IconLoader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                      'Fetch'
                    )}
                  </button>
                </div>
                <small className="form-hint">Enter a URL to fetch audience data, or paste JSON below. API key from Settings will be used automatically.</small>
              </div>

              <div className="mb-3">
                <label className="form-label">Audience Data (JSON) <span className="text-danger">*</span></label>
                <textarea
                  className="form-control font-monospace"
                  rows={10}
                  value={manualAudienceData}
                  onChange={(e) => setManualAudienceData(e.target.value)}
                  placeholder={`Paste audience JSON data here...

Example format:
{
  "contacts": [
    {
      "email": "john@example.com",
      "first_name": "John",
      "last_name": "Doe",
      "company": "Acme Corp"
    }
  ]
}`}
                />
              </div>
            </div>
            <div className="card-footer">
              <div className="d-flex justify-content-end gap-2">
                <button type="button" className="btn" onClick={() => setShowManualModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCreateManualAudience}
                  disabled={creatingManualAudience || !manualAudienceName || !manualAudienceData}
                >
                  {creatingManualAudience ? (
                    <>
                      <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      Creating...
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} className="me-1" />
                      Create Audience
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Toast Notification */}
      {toast && (
        <div
          className="toast show position-fixed"
          style={{
            top: '20px',
            right: '20px',
            zIndex: 9999,
            minWidth: '300px',
          }}
        >
          <div className={`toast-header ${
            toast.type === 'success' ? 'bg-success text-white' : 'bg-danger text-white'
          }`}>
            <strong className="me-auto">
              {toast.type === 'success' ? 'Success' : 'Error'}
            </strong>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={() => setToast(null)}
            ></button>
          </div>
          <div className="toast-body">
            {toast.message}
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
