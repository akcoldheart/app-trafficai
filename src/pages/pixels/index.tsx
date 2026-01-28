import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconCode,
  IconCopy,
  IconCheck,
  IconPlus,
  IconTrash,
  IconWorldWww,
  IconInfoCircle,
  IconLoader2,
  IconRefresh,
  IconChevronRight,
  IconCircleCheck,
  IconAlertCircle,
  IconClock,
  IconX,
  IconUser,
  IconSearch,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import type { Pixel, PixelStatus, PixelRequest, RequestStatus } from '@/lib/supabase/types';

interface UserOption {
  id: string;
  email: string;
}

export default function Pixels() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [pixelRequests, setPixelRequests] = useState<PixelRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<Pixel | null>(null);
  const [newPixel, setNewPixel] = useState({ name: '', domain: '' });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'pixels' | 'requests'>('pixels');

  // Admin-specific state
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [customInstallationCode, setCustomInstallationCode] = useState('');
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Code editing state
  const [editedCode, setEditedCode] = useState('');
  const [savingCode, setSavingCode] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPixels = useCallback(async (selectFirst = false) => {
    try {
      setLoading(true);
      const response = await fetch('/api/pixels');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch pixels');
      }

      setPixels(data.pixels || []);
      if (selectFirst && data.pixels?.length > 0) {
        setSelectedPixel(data.pixels[0]);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPixelRequests = useCallback(async () => {
    try {
      const url = isAdmin ? '/api/pixel-requests' : '/api/pixel-requests';
      const response = await fetch(url);
      const data = await response.json();

      if (response.ok) {
        setPixelRequests(data.requests || []);
      }
    } catch (err) {
      console.error('Failed to fetch pixel requests:', err);
    }
  }, [isAdmin]);

  const fetchUsers = async () => {
    if (!isAdmin) return;
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

  useEffect(() => {
    fetchPixels(true); // Select first pixel on initial load
    fetchPixelRequests();
  }, [fetchPixels, fetchPixelRequests]);

  // Load custom code when pixel is selected (by ID change only)
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedPixel && selectedPixel.id !== lastSelectedId) {
      setEditedCode(selectedPixel.custom_installation_code || '');
      setSaveMessage(null); // Clear any previous message only when switching pixels
      setLastSelectedId(selectedPixel.id);
    }
  }, [selectedPixel, lastSelectedId]);

  // Handle tab query parameter from URL
  useEffect(() => {
    if (router.query.tab === 'requests') {
      setActiveTab('requests');
      // Clear the query parameter from URL
      router.replace('/pixels', undefined, { shallow: true });
    }
  }, [router.query.tab, router]);

  const getBaseUrl = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return process.env.NEXT_PUBLIC_APP_URL || 'https://app.trafficai.io';
  };

  const getInstallationCode = (pixel: Pixel) => {
    if (pixel.custom_installation_code) {
      return pixel.custom_installation_code;
    }
    const baseUrl = getBaseUrl();
    const version = '1.1.0';
    return `<!-- Traffic AI Pixel - ${pixel.name} -->
<script>
  (function(t,r,a,f,i,c){
    t.TrafficAI=t.TrafficAI||[];
    t.TrafficAI.push({
      'pixelId':'${pixel.pixel_code}',
      'endpoint':'${baseUrl}/api/pixel/track'
    });
    var s=r.createElement('script');
    s.async=true;
    s.src='${baseUrl}/pixel.js?v=${version}';
    var x=r.getElementsByTagName('script')[0];
    x.parentNode.insertBefore(s,x);
  })(window,document);
</script>
<!-- End Traffic AI Pixel -->`;
  };

  // Track if the form was filled from a request
  const [filledFromRequest, setFilledFromRequest] = useState<PixelRequest | null>(null);

  // Open create modal for admin
  const handleOpenCreateModal = (prefillRequest?: PixelRequest) => {
    setShowCreateModal(true);
    setUserSearchTerm('');
    setCustomInstallationCode('');
    setUseCustomCode(false);
    fetchUsers();

    // If called with a prefill request, set the data
    if (prefillRequest) {
      setSelectedUserId(prefillRequest.user_id);
      setNewPixel({ name: prefillRequest.name, domain: prefillRequest.domain });
      setFilledFromRequest(prefillRequest);
    } else {
      setSelectedUserId('');
      setNewPixel({ name: '', domain: '' });
      setFilledFromRequest(null);
    }
  };

  // Handle user selection - auto-fill from pending request if exists
  const handleSelectUser = (userId: string) => {
    setSelectedUserId(userId);

    // Check if this user has a pending request
    const pendingRequest = pixelRequests.find(
      r => r.user_id === userId && r.status === 'pending'
    );

    if (pendingRequest) {
      setNewPixel({ name: pendingRequest.name, domain: pendingRequest.domain });
      setFilledFromRequest(pendingRequest);
    } else {
      // Only clear if we're switching to a user without a request
      // Don't clear if we just switched from a user with a request to avoid losing edits
      if (filledFromRequest && filledFromRequest.user_id !== userId) {
        setNewPixel({ name: '', domain: '' });
        setFilledFromRequest(null);
      }
    }
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setSelectedUserId('');
    setNewPixel({ name: '', domain: '' });
    setCustomInstallationCode('');
    setUseCustomCode(false);
    setFilledFromRequest(null);
  };

  // Admin create pixel for user
  const handleAdminCreatePixel = async () => {
    if (!newPixel.name || !newPixel.domain || !selectedUserId) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        name: newPixel.name,
        domain: newPixel.domain,
        user_id: selectedUserId,
        custom_installation_code: useCustomCode && customInstallationCode.trim() ? customInstallationCode.trim() : null,
      };

      console.log('Creating pixel with payload:', payload);

      const response = await fetch('/api/admin/pixels/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      console.log('Pixel created response:', data);

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create pixel');
      }

      // If this was created from a pending request, approve/delete it
      if (filledFromRequest && filledFromRequest.status === 'pending') {
        try {
          await fetch(`/api/admin/pixel-requests/${filledFromRequest.id}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ admin_notes: 'Approved via Create Pixel modal' }),
          });
          // Update local state to remove the request
          setPixelRequests(pixelRequests.filter(r => r.id !== filledFromRequest.id));
        } catch {
          // Silently ignore - pixel was created successfully
        }
      }

      setPixels([data.pixel, ...pixels]);
      setSelectedPixel(data.pixel);
      handleCloseCreateModal();
      const hasCustomCode = !!data.pixel.custom_installation_code;
      showToast('success', `Pixel "${data.pixel.name}" created successfully!${hasCustomCode ? ' (with custom code)' : ''}`);
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  // Regular user create/request
  const handleCreatePixel = async () => {
    if (!newPixel.name || !newPixel.domain) return;

    setCreating(true);
    try {
      if (isAdmin) {
        const response = await fetch('/api/pixels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPixel),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create pixel');
        }

        setPixels([data.pixel, ...pixels]);
        setNewPixel({ name: '', domain: '' });
        setShowCreateForm(false);
        setSelectedPixel(data.pixel);
      } else {
        const response = await fetch('/api/pixel-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newPixel),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to submit pixel request');
        }

        setPixelRequests([data.request, ...pixelRequests]);
        setNewPixel({ name: '', domain: '' });
        setShowCreateForm(false);
        setActiveTab('requests');
        showToast('success', 'Your pixel request has been submitted for admin approval.');
      }
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  // Approve request
  const handleApproveRequest = async (request: PixelRequest) => {
    if (!confirm(`Approve pixel request "${request.name}" for ${request.user?.email}?`)) return;

    setProcessing(true);
    try {
      const response = await fetch(`/api/admin/pixel-requests/${request.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: '' }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to approve request');
      }

      // Refresh both pixels and requests to get updated data
      await Promise.all([fetchPixels(), fetchPixelRequests()]);

      // Select the newly created pixel and switch to pixels tab
      if (data.pixel) {
        setSelectedPixel(data.pixel);
        setActiveTab('pixels');
      }
      showToast('success', 'Request approved! Pixel created successfully.');
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  // Reject request
  const handleRejectRequest = async (request: PixelRequest) => {
    const reason = prompt('Enter rejection reason (optional):');
    if (reason === null) return; // User cancelled

    setProcessing(true);
    try {
      const response = await fetch(`/api/admin/pixel-requests/${request.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_notes: reason }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to reject request');
      }

      setPixelRequests(pixelRequests.map(r =>
        r.id === request.id ? { ...r, status: 'rejected' as RequestStatus, admin_notes: reason } : r
      ));
      showToast('info', 'Request rejected.');
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeletePixel = async (id: string) => {
    if (!confirm('Are you sure you want to delete this pixel? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/pixels/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete pixel');
      }

      const updatedPixels = pixels.filter(p => p.id !== id);
      setPixels(updatedPixels);
      if (selectedPixel?.id === id) {
        setSelectedPixel(updatedPixels[0] || null);
      }
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  };

  const handleDeleteRequest = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this request?')) {
      return;
    }

    try {
      const response = await fetch(`/api/pixel-requests/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete request');
      }

      setPixelRequests(pixelRequests.filter(r => r.id !== id));
    } catch (err) {
      showToast('error', (err as Error).message);
    }
  };

  const handleSaveCode = async () => {
    if (!selectedPixel) return;

    setSavingCode(true);
    setSaveMessage(null);
    try {
      const response = await fetch(`/api/pixels/${selectedPixel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          custom_installation_code: editedCode.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update pixel');
      }

      // Update pixel in state
      const updatedPixel = { ...selectedPixel, custom_installation_code: editedCode.trim() || null };
      setPixels(pixels.map(p => p.id === selectedPixel.id ? updatedPixel : p));
      setSelectedPixel(updatedPixel);
      setSaveMessage({ type: 'success', text: 'Installation code saved successfully!' });

      // Clear message after 3 seconds
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setSaveMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingCode(false);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadgeClass = (status: PixelStatus) => {
    switch (status) {
      case 'active': return 'bg-green-lt text-green';
      case 'pending': return 'bg-yellow-lt text-yellow';
      default: return 'bg-secondary-lt';
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

  const pendingRequestCount = pixelRequests.filter(r => r.status === 'pending').length;
  const filteredUsers = users.filter(u => u.email.toLowerCase().includes(userSearchTerm.toLowerCase()));
  const selectedUser = users.find(u => u.id === selectedUserId);

  if (loading) {
    return (
      <Layout title="Pixel Creation" pageTitle="Pixel Creation" pagePretitle="Traffic AI">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <div className="text-center">
            <IconLoader2 size={48} className="text-muted mb-3" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-muted">Loading pixels...</p>
          </div>
        </div>
        <style jsx>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout title="Pixel Creation" pageTitle="Pixel Creation" pagePretitle="Traffic AI">
        <div className="alert alert-danger">
          <div className="d-flex align-items-center">
            <div className="flex-fill">{error}</div>
            <button className="btn btn-outline-danger btn-sm" onClick={() => fetchPixels()}>
              <IconRefresh size={16} className="me-1" />Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Pixel Creation" pageTitle="Pixel Creation" pagePretitle="Traffic AI">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`alert alert-${toast.type === 'success' ? 'success' : toast.type === 'error' ? 'danger' : 'info'} alert-dismissible mb-4`}
          style={{
            position: 'fixed',
            top: '80px',
            right: '20px',
            zIndex: 9999,
            minWidth: '300px',
            maxWidth: '450px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            animation: 'slideIn 0.3s ease-out',
          }}
        >
          <div className="d-flex align-items-center">
            {toast.type === 'success' && <IconCircleCheck size={20} className="me-2" />}
            {toast.type === 'error' && <IconAlertCircle size={20} className="me-2" />}
            {toast.type === 'info' && <IconInfoCircle size={20} className="me-2" />}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            className="btn-close"
            onClick={() => setToast(null)}
            aria-label="Close"
          />
        </div>
      )}

      <div className="row g-4">
        {/* Left Column - Pixel List */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{isAdmin ? 'All Pixels' : 'Your Pixels'}</h3>
              <div className="card-actions">
                {isAdmin ? (
                  <button className="btn btn-primary btn-sm" onClick={() => handleOpenCreateModal()}>
                    <IconPlus size={16} className="me-1" />
                    Create for User
                  </button>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => setShowCreateForm(true)}>
                    <IconPlus size={16} className="me-1" />
                    Request Pixel
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            {(isAdmin || pixelRequests.length > 0) && (
              <div className="card-header border-0 pt-0">
                <ul className="nav nav-tabs card-header-tabs">
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeTab === 'pixels' ? 'active' : ''}`}
                      onClick={() => setActiveTab('pixels')}
                    >
                      Pixels ({pixels.length})
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`}
                      onClick={() => setActiveTab('requests')}
                    >
                      Requests
                      {pendingRequestCount > 0 && (
                        <span className="badge bg-yellow-lt text-yellow ms-1">{pendingRequestCount}</span>
                      )}
                    </button>
                  </li>
                </ul>
              </div>
            )}

            <div className="list-group list-group-flush" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              {/* Create Form for non-admin */}
              {!isAdmin && showCreateForm && (
                <div className="list-group-item p-3" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                  <div className="mb-3">
                    <label className="form-label">Pixel Name</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="e.g., Main Website"
                      value={newPixel.name}
                      onChange={(e) => setNewPixel({ ...newPixel, name: e.target.value })}
                      disabled={creating}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Domain</label>
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="example.com"
                      value={newPixel.domain}
                      onChange={(e) => setNewPixel({ ...newPixel, domain: e.target.value })}
                      disabled={creating}
                    />
                  </div>
                  <div className="alert alert-info py-2 mb-3" style={{ fontSize: '12px' }}>
                    <IconInfoCircle size={14} className="me-1" />
                    Your request will be reviewed by an admin.
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-primary btn-sm flex-fill"
                      onClick={handleCreatePixel}
                      disabled={!newPixel.name || !newPixel.domain || creating}
                    >
                      {creating ? 'Submitting...' : 'Submit Request'}
                    </button>
                    <button
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => { setShowCreateForm(false); setNewPixel({ name: '', domain: '' }); }}
                      disabled={creating}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Pixels Tab */}
              {activeTab === 'pixels' && (
                <>
                  {pixels.length === 0 ? (
                    <div className="list-group-item text-center py-4">
                      <IconCode size={32} className="text-muted mb-2" />
                      <h4 className="mb-2">No pixels yet</h4>
                      <p className="text-muted mb-0" style={{ fontSize: '13px' }}>
                        {isAdmin ? 'Create pixels for users to start tracking' : 'Request a pixel to get started'}
                      </p>
                    </div>
                  ) : (
                    pixels.map((pixel) => (
                      <div
                        key={pixel.id}
                        className={`list-group-item list-group-item-action d-flex align-items-center ${selectedPixel?.id === pixel.id ? 'active' : ''}`}
                        onClick={() => setSelectedPixel(pixel)}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className={`avatar avatar-sm me-3 ${pixel.status === 'active' ? 'bg-green-lt' : 'bg-azure-lt'}`}>
                          <IconCode size={16} />
                        </span>
                        <div className="flex-fill" style={{ minWidth: 0 }}>
                          <div className="d-flex align-items-center">
                            <span className="fw-semibold text-truncate">{pixel.name}</span>
                            <span className={`badge ms-2 ${getStatusBadgeClass(pixel.status)}`} style={{ fontSize: '10px' }}>
                              {pixel.status}
                            </span>
                            {pixel.custom_installation_code && (
                              <span className="badge bg-purple-lt text-purple ms-1" style={{ fontSize: '9px' }}>custom</span>
                            )}
                          </div>
                          <div className={`text-truncate ${selectedPixel?.id === pixel.id ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '12px' }}>
                            {pixel.domain}
                          </div>
                          {isAdmin && (pixel as any).user?.email && (
                            <div className={`text-truncate ${selectedPixel?.id === pixel.id ? 'text-white-50' : 'text-muted'}`} style={{ fontSize: '11px' }}>
                              <IconUser size={11} className="me-1" />{(pixel as any).user.email}
                            </div>
                          )}
                        </div>
                        <IconChevronRight size={16} className={selectedPixel?.id === pixel.id ? 'text-white' : 'text-muted'} />
                      </div>
                    ))
                  )}
                </>
              )}

              {/* Requests Tab */}
              {activeTab === 'requests' && (
                <>
                  {pixelRequests.filter(r => r.status === 'pending').length === 0 ? (
                    <div className="list-group-item text-center py-4">
                      <p className="text-muted mb-0">No pending requests</p>
                    </div>
                  ) : (
                    pixelRequests.filter(r => r.status === 'pending').map((request) => (
                      <div key={request.id} className="list-group-item">
                        <div className="d-flex align-items-start">
                          <span className={`avatar avatar-sm me-3 ${getRequestStatusBadgeClass(request.status)}`}>
                            {request.status === 'pending' && <IconClock size={16} />}
                            {request.status === 'approved' && <IconCheck size={16} />}
                            {request.status === 'rejected' && <IconX size={16} />}
                          </span>
                          <div className="flex-fill" style={{ minWidth: 0 }}>
                            <div className="d-flex align-items-center">
                              <span className="fw-semibold">{request.name}</span>
                              <span className={`badge ms-2 ${getRequestStatusBadgeClass(request.status)}`} style={{ fontSize: '10px' }}>
                                {request.status}
                              </span>
                            </div>
                            <div className="text-muted" style={{ fontSize: '12px' }}>{request.domain}</div>
                            {isAdmin && request.user?.email && (
                              <div className="text-muted" style={{ fontSize: '11px' }}>
                                <IconUser size={12} className="me-1" />{request.user.email}
                              </div>
                            )}
                            {request.admin_notes && (
                              <div className="text-muted small mt-1">Note: {request.admin_notes}</div>
                            )}
                          </div>
                          <div className="d-flex gap-1">
                            {isAdmin && request.status === 'pending' && (
                              <>
                                <button
                                  className="btn btn-success btn-sm"
                                  onClick={() => handleApproveRequest(request)}
                                  disabled={processing}
                                  title="Quick Approve"
                                >
                                  <IconCheck size={14} />
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
                                className="btn btn-ghost-danger btn-sm"
                                onClick={() => handleDeleteRequest(request.id)}
                                title="Cancel"
                              >
                                <IconTrash size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Pixel Details */}
        <div className="col-lg-8">
          {selectedPixel ? (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title d-flex align-items-center">
                    {selectedPixel.name}
                    <span className={`badge ms-2 ${getStatusBadgeClass(selectedPixel.status)}`}>{selectedPixel.status}</span>
                    {selectedPixel.custom_installation_code && (
                      <span className="badge bg-purple-lt text-purple ms-1">Custom Code</span>
                    )}
                  </h3>
                  <div className="text-muted" style={{ fontSize: '13px' }}>
                    <IconWorldWww size={14} className="me-1" />{selectedPixel.domain}
                  </div>
                </div>
                <div className="card-actions">
                  <button className="btn btn-ghost-danger btn-sm" onClick={() => handleDeletePixel(selectedPixel.id)}>
                    <IconTrash size={16} className="me-1" />Delete
                  </button>
                </div>
              </div>
              <div className="card-body">
                {/* Stats */}
                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <div className="card card-sm">
                      <div className="card-body">
                        <div className="d-flex align-items-center">
                          <span className="avatar bg-primary-lt me-3"><IconCode size={20} /></span>
                          <div className="flex-fill">
                            <div className="text-muted" style={{ fontSize: '12px' }}>Pixel ID</div>
                            <div className="d-flex align-items-center gap-2">
                              <code style={{ fontSize: '11px' }}>{selectedPixel.pixel_code}</code>
                              <button
                                className={`btn btn-icon btn-sm ${copiedId === 'pixelId' ? 'btn-success' : 'btn-ghost-secondary'}`}
                                onClick={() => copyToClipboard(selectedPixel.pixel_code, 'pixelId')}
                                style={{ padding: '2px 6px' }}
                              >
                                {copiedId === 'pixelId' ? <IconCheck size={12} /> : <IconCopy size={12} />}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="card card-sm">
                      <div className="card-body">
                        <div className="d-flex align-items-center">
                          <span className="avatar bg-green-lt me-3"><IconCircleCheck size={20} /></span>
                          <div>
                            <div className="text-muted" style={{ fontSize: '12px' }}>Events</div>
                            <div className="fw-semibold">{selectedPixel.events_count.toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="card card-sm">
                      <div className="card-body">
                        <div className="d-flex align-items-center">
                          <span className={`avatar ${selectedPixel.status === 'active' ? 'bg-green-lt' : 'bg-yellow-lt'} me-3`}>
                            {selectedPixel.status === 'active' ? <IconCircleCheck size={20} /> : <IconAlertCircle size={20} />}
                          </span>
                          <div>
                            <div className="text-muted" style={{ fontSize: '12px' }}>Status</div>
                            <div className="fw-semibold text-capitalize">{selectedPixel.status}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Installation Code */}
                <div className="mb-4">
                  <h4 className="mb-3">Installation Code</h4>

                  {isAdmin ? (
                    // Admin view - editable code
                    <div>
                      <div className="alert alert-info mb-3 py-2">
                        <IconInfoCircle size={16} className="me-2" />
                        Enter custom code below or leave empty to use auto-generated code. Copy and paste in the <code>&lt;head&gt;</code> section.
                      </div>
                      <div className="position-relative">
                        <textarea
                          className="form-control font-monospace"
                          rows={10}
                          value={editedCode}
                          onChange={(e) => setEditedCode(e.target.value)}
                          placeholder={getInstallationCode(selectedPixel)}
                          style={{ fontSize: '12px', backgroundColor: '#1e293b', color: '#e2e8f0', resize: 'vertical' }}
                        />
                        <button
                          className={`btn btn-sm ${copiedId === 'code' ? 'btn-success' : 'btn-primary'} position-absolute`}
                          style={{ top: '12px', right: '12px' }}
                          onClick={() => copyToClipboard(editedCode || getInstallationCode(selectedPixel), 'code')}
                        >
                          {copiedId === 'code' ? <><IconCheck size={14} className="me-1" />Copied!</> : <><IconCopy size={14} className="me-1" />Copy</>}
                        </button>
                      </div>
                      <div className="d-flex justify-content-between align-items-center mt-2">
                        <div className="d-flex align-items-center gap-2">
                          <small className="text-muted">
                            {editedCode ? 'Using custom code' : 'Using auto-generated code (type to customize)'}
                          </small>
                          {saveMessage && (
                            <span className={`badge ${saveMessage.type === 'success' ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                              {saveMessage.type === 'success' ? <IconCheck size={12} className="me-1" /> : <IconX size={12} className="me-1" />}
                              {saveMessage.text}
                            </span>
                          )}
                        </div>
                        <div className="d-flex gap-2">
                          {editedCode !== (selectedPixel.custom_installation_code || '') && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={handleSaveCode}
                              disabled={savingCode}
                            >
                              {savingCode ? (
                                <><IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />Saving...</>
                              ) : (
                                <><IconDeviceFloppy size={14} className="me-1" />Save Changes</>
                              )}
                            </button>
                          )}
                          {editedCode && (
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => setEditedCode('')}
                              disabled={savingCode}
                              title="Clear custom code and use auto-generated"
                            >
                              Reset to Auto
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    // User view - read-only code
                    <>
                      <div className="alert alert-info mb-3">
                        <IconInfoCircle size={18} className="me-2" />
                        Copy this code and paste it in the <code>&lt;head&gt;</code> section of your website.
                      </div>
                      <div className="position-relative">
                        <pre
                          className="p-3 rounded mb-0"
                          style={{ backgroundColor: '#1e293b', color: '#e2e8f0', fontSize: '12px', lineHeight: '1.5', overflow: 'auto', maxHeight: '250px' }}
                        >
                          <code>{getInstallationCode(selectedPixel)}</code>
                        </pre>
                        <button
                          className={`btn ${copiedId === 'code' ? 'btn-success' : 'btn-primary'} position-absolute`}
                          style={{ top: '12px', right: '12px' }}
                          onClick={() => copyToClipboard(getInstallationCode(selectedPixel), 'code')}
                        >
                          {copiedId === 'code' ? <><IconCheck size={16} className="me-1" />Copied!</> : <><IconCopy size={16} className="me-1" />Copy Code</>}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {/* Quick Install */}
                <div>
                  <h4 className="mb-3">Quick Installation</h4>
                  <div className="row g-3">
                    {[
                      { name: 'WordPress', icon: 'wordpress/wordpress-original.svg', desc: 'Plugin or theme editor' },
                      { name: 'Shopify', icon: 'woocommerce/woocommerce-original.svg', desc: 'Add to theme.liquid' },
                      { name: 'Manual', icon: 'html5/html5-original.svg', desc: 'Paste in HTML head' },
                    ].map((opt) => (
                      <div className="col-md-4" key={opt.name}>
                        <div className="card card-sm card-link" style={{ cursor: 'pointer' }}>
                          <div className="card-body text-center py-3">
                            <img src={`https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${opt.icon}`} alt={opt.name} width="28" height="28" className="mb-2" />
                            <div className="fw-semibold" style={{ fontSize: '13px' }}>{opt.name}</div>
                            <div className="text-muted" style={{ fontSize: '11px' }}>{opt.desc}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body text-center py-5">
                <span className="avatar avatar-xl bg-azure-lt mb-3"><IconCode size={32} /></span>
                <h3>Select a Pixel</h3>
                <p className="text-muted mb-0">Choose a pixel from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Pixel for User Modal (Admin only) */}
      {showCreateModal && isAdmin && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><IconPlus className="icon me-2" />Create Pixel for User</h5>
                <button type="button" className="btn-close" onClick={handleCloseCreateModal} />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label required">Select User</label>
                  <div className="input-group mb-2">
                    <span className="input-group-text"><IconSearch size={16} /></span>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Search users by email..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                    />
                  </div>
                  {selectedUser && (
                    <div className="alert alert-success py-2 mb-2">
                      <strong>Selected:</strong> {selectedUser.email}
                      {filledFromRequest && (
                        <span className="badge bg-yellow-lt text-yellow ms-2">
                          <IconClock size={12} className="me-1" />
                          Has pending request
                        </span>
                      )}
                    </div>
                  )}
                  <div className="list-group" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                    {loadingUsers ? (
                      <div className="list-group-item text-center"><IconLoader2 size={20} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} /></div>
                    ) : filteredUsers.length === 0 ? (
                      <div className="list-group-item text-center text-muted">No users found</div>
                    ) : (
                      filteredUsers.slice(0, 8).map((user) => {
                        const hasPendingRequest = pixelRequests.some(r => r.user_id === user.id && r.status === 'pending');
                        return (
                          <button
                            key={user.id}
                            type="button"
                            className={`list-group-item list-group-item-action d-flex align-items-center ${selectedUserId === user.id ? 'active' : ''}`}
                            onClick={() => handleSelectUser(user.id)}
                          >
                            <span className={`avatar avatar-xs ${selectedUserId === user.id ? 'bg-white text-primary' : 'bg-blue-lt'} me-2`}>
                              <IconUser size={12} />
                            </span>
                            {user.email}
                            {hasPendingRequest && (
                              <span className={`badge ms-auto ${selectedUserId === user.id ? 'bg-white text-primary' : 'bg-yellow-lt text-yellow'}`} style={{ fontSize: '9px' }}>
                                Request
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {filledFromRequest && (
                  <div className="alert alert-info py-2 mb-3">
                    <IconInfoCircle size={14} className="me-1" />
                    <strong>Auto-filled from pending request:</strong> &quot;{filledFromRequest.name}&quot; - {filledFromRequest.domain}
                    <br /><small className="text-muted">You can edit these values before creating the pixel.</small>
                  </div>
                )}

                <div className="row">
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label className="form-label required">Pixel Name</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="e.g., Main Website"
                        value={newPixel.name}
                        onChange={(e) => {
                          setNewPixel({ ...newPixel, name: e.target.value });
                        }}
                      />
                    </div>
                  </div>
                  <div className="col-md-6">
                    <div className="mb-3">
                      <label className="form-label required">Domain</label>
                      <div className="input-group">
                        <span className="input-group-text"><IconWorldWww size={16} /></span>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="example.com"
                          value={newPixel.domain}
                          onChange={(e) => {
                            setNewPixel({ ...newPixel, domain: e.target.value });
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={useCustomCode}
                      onChange={(e) => setUseCustomCode(e.target.checked)}
                    />
                    <span className="form-check-label">Use custom installation code</span>
                  </label>
                </div>

                {useCustomCode && (
                  <div className="mb-3">
                    <label className="form-label">Custom Installation Code</label>
                    <textarea
                      className="form-control font-monospace"
                      rows={8}
                      placeholder="<!-- Your custom tracking code -->"
                      value={customInstallationCode}
                      onChange={(e) => setCustomInstallationCode(e.target.value)}
                      style={{ fontSize: '12px', backgroundColor: '#1e293b', color: '#e2e8f0' }}
                    />
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseCreateModal} disabled={processing}>Cancel</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAdminCreatePixel}
                  disabled={processing || !selectedUserId || !newPixel.name || !newPixel.domain}
                >
                  {processing ? <><IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />Creating...</> : <><IconPlus size={16} className="me-1" />Create Pixel</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </Layout>
  );
}
