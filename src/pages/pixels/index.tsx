import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import InstallationGuideModal from '@/components/InstallationGuideModal';
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
  IconDeviceFloppy,
  IconPencil,
  IconApi,
  IconBriefcase,
  IconCoin,
  IconUserCircle,
  IconUsers,
  IconHome,
  IconMapPin,
} from '@tabler/icons-react';
import type { Pixel, PixelStatus, PixelRequest, RequestStatus } from '@/lib/supabase/types';

interface UserOption {
  id: string;
  email: string;
  role?: string;
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
  const allDataPoints = ['business', 'financial', 'personal', 'family', 'housing', 'location'];
  const [newPixel, setNewPixel] = useState({ name: '', domain: '', data_points: [] as string[] });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeTab, setActiveTab] = useState<'pixels' | 'requests'>('pixels');

  // Admin-specific state
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [customInstallationCode, setCustomInstallationCode] = useState('');
  const [customPixelId, setCustomPixelId] = useState('');
  const [processing, setProcessing] = useState(false);

  // Code editing state
  const [editedCode, setEditedCode] = useState('');
  const [isEditingCode, setIsEditingCode] = useState(false);
  const [savingCode, setSavingCode] = useState(false);

  // Pixel Code editing state (admin only)
  const [editedPixelId, setEditedPixelId] = useState('');
  const [isEditingPixelId, setIsEditingPixelId] = useState(false);
  const [savingPixelId, setSavingPixelId] = useState(false);

  // Visitors API URL editing state (admin only)
  const [editedApiUrl, setEditedApiUrl] = useState('');
  const [isEditingApiUrl, setIsEditingApiUrl] = useState(false);
  const [savingApiUrl, setSavingApiUrl] = useState(false);
  const [apiUrlMessage, setApiUrlMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Visitors API URL for create modal
  const [visitorsApiUrl, setVisitorsApiUrl] = useState('');

  // Installation guide modal state
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState('');
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
        setUsers(data.users.map((u: { id: string; email: string; role?: string }) => ({
          id: u.id,
          email: u.email,
          role: u.role
        })));
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  };

  // Handle initial load and tab query parameter from URL
  useEffect(() => {
    // Wait for router to be ready before checking query params
    if (!router.isReady) return;

    // Check if coming from requests tab
    const isRequestsTab = router.query.tab === 'requests';

    if (isRequestsTab) {
      setActiveTab('requests');
      // Clear the query parameter from URL
      router.replace('/pixels', undefined, { shallow: true });
    }

    // Fetch pixels - only auto-select first if not on requests tab
    fetchPixels(!isRequestsTab);
    fetchPixelRequests();
  }, [router.isReady]); // Run when router is ready

  // Load custom code and pixel ID when pixel is selected (by ID change only)
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedPixel && selectedPixel.id !== lastSelectedId) {
      setEditedCode(selectedPixel.custom_installation_code || '');
      setEditedPixelId(selectedPixel.pixel_code || '');
      setEditedApiUrl(selectedPixel.visitors_api_url || '');
      setIsEditingCode(false); // Exit edit mode when switching pixels
      setIsEditingPixelId(false); // Exit pixel ID edit mode when switching pixels
      setIsEditingApiUrl(false); // Exit API URL edit mode when switching pixels
      setSaveMessage(null); // Clear any previous message only when switching pixels
      setApiUrlMessage(null);
      setLastSelectedId(selectedPixel.id);
    }
  }, [selectedPixel, lastSelectedId]);

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
    setCustomInstallationCode('');
    setCustomPixelId('');
    setVisitorsApiUrl('');
    fetchUsers();

    // If called with a prefill request, set the data
    if (prefillRequest) {
      setSelectedUserId(prefillRequest.user_id);
      setNewPixel({ name: prefillRequest.name, domain: prefillRequest.domain, data_points: prefillRequest.data_points || [] });
      setFilledFromRequest(prefillRequest);
    } else {
      setSelectedUserId('');
      setNewPixel({ name: '', domain: '', data_points: [] });
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
      setNewPixel({ name: pendingRequest.name, domain: pendingRequest.domain, data_points: pendingRequest.data_points || [] });
      setFilledFromRequest(pendingRequest);
    } else {
      // Only clear if we're switching to a user without a request
      // Don't clear if we just switched from a user with a request to avoid losing edits
      if (filledFromRequest && filledFromRequest.user_id !== userId) {
        setNewPixel({ name: '', domain: '', data_points: [] });
        setFilledFromRequest(null);
      }
    }
  };

  const handleCloseCreateModal = () => {
    setShowCreateModal(false);
    setSelectedUserId('');
    setNewPixel({ name: '', domain: '', data_points: [] });
    setCustomInstallationCode('');
    setCustomPixelId('');
    setVisitorsApiUrl('');
    setFilledFromRequest(null);
  };

  // Admin create pixel for user
  const handleAdminCreatePixel = async () => {
    if (!newPixel.name || !newPixel.domain || !selectedUserId) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    if (!customPixelId.trim()) {
      showToast('error', 'Please enter a Pixel Code');
      return;
    }

    if (!customInstallationCode.trim()) {
      showToast('error', 'Please enter the custom installation code');
      return;
    }

    setProcessing(true);
    try {
      const payload: Record<string, string> = {
        name: newPixel.name,
        domain: newPixel.domain,
        user_id: selectedUserId,
        pixel_id: customPixelId.trim(),
        custom_installation_code: customInstallationCode.trim(),
      };

      if (visitorsApiUrl.trim()) {
        payload.visitors_api_url = visitorsApiUrl.trim();
      }

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

      // If this was created from a pending request, delete the request (pixel already created)
      if (filledFromRequest && filledFromRequest.status === 'pending') {
        try {
          // Just delete the request - don't call approve as that creates another pixel
          await fetch(`/api/pixel-requests/${filledFromRequest.id}`, {
            method: 'DELETE',
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
        setNewPixel({ name: '', domain: '', data_points: [] });
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
        setNewPixel({ name: '', domain: '', data_points: [] });
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

  // Approve request - opens the create modal pre-filled with request data
  const handleApproveRequest = (request: PixelRequest) => {
    // Open the create modal with request data pre-filled
    // This allows admin to add custom code before creating
    handleOpenCreateModal(request);
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

  const handleSavePixelId = async () => {
    if (!selectedPixel || !isAdmin) return;

    setSavingPixelId(true);
    try {
      const response = await fetch(`/api/pixels/${selectedPixel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixel_code: editedPixelId.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update pixel ID');
      }

      // Update pixel in state
      const updatedPixel = { ...selectedPixel, pixel_code: editedPixelId.trim() };
      setPixels(pixels.map(p => p.id === selectedPixel.id ? updatedPixel : p));
      setSelectedPixel(updatedPixel);
      setIsEditingPixelId(false);
      showToast('success', 'Pixel Code updated successfully!');
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setSavingPixelId(false);
    }
  };

  const handleSaveApiUrl = async () => {
    if (!selectedPixel || !isAdmin) return;

    setSavingApiUrl(true);
    setApiUrlMessage(null);
    try {
      const response = await fetch(`/api/pixels/${selectedPixel.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitors_api_url: editedApiUrl.trim() || null,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update visitors API URL');
      }

      const updatedPixel = { ...selectedPixel, visitors_api_url: editedApiUrl.trim() || null };
      setPixels(pixels.map(p => p.id === selectedPixel.id ? updatedPixel : p));
      setSelectedPixel(updatedPixel);
      setIsEditingApiUrl(false);
      setApiUrlMessage({ type: 'success', text: 'API URL saved successfully!' });
      setTimeout(() => setApiUrlMessage(null), 3000);
    } catch (err) {
      setApiUrlMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setSavingApiUrl(false);
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

  if (loading) {
    return (
      <Layout title="Pixels" pageTitle="Pixels">
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
      <Layout title="Pixels" pageTitle="Pixels">
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
    <Layout title="Pixels" pageTitle="Pixels">
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
                      onClick={() => {
                        setActiveTab('pixels');
                        // Select first pixel if none selected
                        if (!selectedPixel && pixels.length > 0) {
                          setSelectedPixel(pixels[0]);
                        }
                      }}
                    >
                      Pixels ({pixels.length})
                    </button>
                  </li>
                  <li className="nav-item">
                    <button
                      className={`nav-link ${activeTab === 'requests' ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab('requests');
                        // Clear selected pixel when viewing requests
                        setSelectedPixel(null);
                      }}
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
                  <div className="mb-3">
                    <div className="d-flex align-items-center justify-content-between mb-2">
                      <label className="form-label mb-0">Data Points <span className="text-muted fw-normal" style={{ fontSize: '11px' }}>(optional)</span></label>
                      <span
                        className="text-primary"
                        style={{ fontSize: '11px', cursor: 'pointer', fontWeight: 500 }}
                        onClick={() => {
                          const allSelected = newPixel.data_points.length === allDataPoints.length;
                          setNewPixel({ ...newPixel, data_points: allSelected ? [] : [...allDataPoints] });
                        }}
                      >
                        {newPixel.data_points.length === allDataPoints.length ? 'Deselect all' : 'Select all'}
                      </span>
                    </div>
                    <div className="row g-2">
                      {[
                        { key: 'business', label: 'Business', icon: IconBriefcase, desc: 'Company & job info' },
                        { key: 'financial', label: 'Financial', icon: IconCoin, desc: 'Income & net worth' },
                        { key: 'personal', label: 'Personal', icon: IconUserCircle, desc: 'Age, gender & email' },
                        { key: 'family', label: 'Family', icon: IconUsers, desc: 'Marital & children' },
                        { key: 'housing', label: 'Housing', icon: IconHome, desc: 'Homeowner status' },
                        { key: 'location', label: 'Location', icon: IconMapPin, desc: 'City, state & zip' },
                      ].map((point) => {
                        const isSelected = newPixel.data_points.includes(point.key);
                        const PointIcon = point.icon;
                        return (
                          <div key={point.key} className="col-6">
                            <div
                              onClick={() => {
                                if (creating) return;
                                setNewPixel({
                                  ...newPixel,
                                  data_points: isSelected
                                    ? newPixel.data_points.filter((d) => d !== point.key)
                                    : [...newPixel.data_points, point.key],
                                });
                              }}
                              style={{
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: isSelected ? '1.5px solid rgba(32, 107, 196, 0.6)' : '1.5px solid var(--tblr-border-color)',
                                backgroundColor: isSelected ? 'rgba(32, 107, 196, 0.08)' : 'transparent',
                                cursor: creating ? 'not-allowed' : 'pointer',
                                transition: 'all 0.15s ease',
                                opacity: creating ? 0.6 : 1,
                              }}
                            >
                              <div className="d-flex align-items-center gap-2">
                                <div style={{
                                  width: '28px',
                                  height: '28px',
                                  borderRadius: '6px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: isSelected ? 'rgba(32, 107, 196, 0.15)' : 'var(--tblr-bg-surface-secondary)',
                                  color: isSelected ? '#4299e1' : 'var(--tblr-secondary)',
                                  flexShrink: 0,
                                  transition: 'all 0.15s ease',
                                }}>
                                  <PointIcon size={14} />
                                </div>
                                <div className="flex-fill" style={{ minWidth: 0 }}>
                                  <div style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 500, color: isSelected ? '#4299e1' : 'var(--tblr-body-color)' }}>
                                    {point.label}
                                  </div>
                                  <div className="text-muted" style={{ fontSize: '10px', lineHeight: 1.2 }}>{point.desc}</div>
                                </div>
                                {isSelected && (
                                  <IconCheck size={14} style={{ color: '#4299e1', flexShrink: 0 }} />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mb-3" style={{
                    background: 'linear-gradient(135deg, rgba(32, 107, 196, 0.06), rgba(32, 196, 140, 0.06))',
                    border: '1px solid rgba(32, 196, 140, 0.15)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                  }}>
                    <div className="d-flex align-items-center gap-2" style={{ fontSize: '11px', color: 'var(--tblr-body-color)' }}>
                      <IconCircleCheck size={14} style={{ color: '#20c997', flexShrink: 0 }} />
                      <span>
                        All visitors include <strong>Name</strong>, <strong>Email</strong> &amp; <strong>Phone</strong> by default
                      </span>
                    </div>
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
                      onClick={() => { setShowCreateForm(false); setNewPixel({ name: '', domain: '', data_points: [] }); }}
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
                            {request.data_points && request.data_points.length > 0 && (
                              <div className="d-flex flex-wrap gap-1 mt-1">
                                {request.data_points.map((dp) => (
                                  <span key={dp} className="badge" style={{
                                    fontSize: '10px',
                                    fontWeight: 500,
                                    backgroundColor: 'rgba(32, 107, 196, 0.12)',
                                    color: '#4299e1',
                                    borderRadius: '10px',
                                    padding: '2px 8px',
                                  }}>
                                    {dp}
                                  </span>
                                ))}
                              </div>
                            )}
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
                                  title="Create Pixel"
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
                  <div className="col-md-6">
                    <div className="card card-sm h-100">
                      <div className="card-body py-3">
                        <div className="d-flex align-items-center">
                          <span className="avatar bg-primary-lt me-3"><IconCode size={20} /></span>
                          <div className="flex-fill" style={{ minWidth: 0 }}>
                            <div className="text-muted" style={{ fontSize: '12px' }}>Pixel Code</div>
                            {isAdmin && isEditingPixelId ? (
                              <div className="d-flex align-items-center gap-2">
                                <input
                                  type="text"
                                  className="form-control form-control-sm font-monospace"
                                  value={editedPixelId}
                                  onChange={(e) => setEditedPixelId(e.target.value)}
                                  style={{ fontSize: '12px' }}
                                  autoFocus
                                />
                                <button
                                  className="btn btn-icon btn-sm btn-primary flex-shrink-0"
                                  onClick={handleSavePixelId}
                                  disabled={savingPixelId || !editedPixelId.trim()}
                                  style={{ padding: '2px 6px' }}
                                  title="Save"
                                >
                                  {savingPixelId ? <IconLoader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <IconCheck size={12} />}
                                </button>
                                <button
                                  className="btn btn-icon btn-sm btn-ghost-secondary flex-shrink-0"
                                  onClick={() => {
                                    setEditedPixelId(selectedPixel.pixel_code);
                                    setIsEditingPixelId(false);
                                  }}
                                  disabled={savingPixelId}
                                  style={{ padding: '2px 6px' }}
                                  title="Cancel"
                                >
                                  <IconX size={12} />
                                </button>
                              </div>
                            ) : (
                              <div className="d-flex align-items-center gap-2">
                                <code
                                  className="text-truncate d-block"
                                  style={{ fontSize: '12px', maxWidth: '180px' }}
                                  title={selectedPixel.pixel_code}
                                >
                                  {selectedPixel.pixel_code}
                                </code>
                                <button
                                  className={`btn btn-icon btn-sm flex-shrink-0 ${copiedId === 'pixelId' ? 'btn-success' : 'btn-ghost-secondary'}`}
                                  onClick={() => copyToClipboard(selectedPixel.pixel_code, 'pixelId')}
                                  style={{ padding: '2px 6px' }}
                                  title="Copy Pixel Code"
                                >
                                  {copiedId === 'pixelId' ? <IconCheck size={12} /> : <IconCopy size={12} />}
                                </button>
                                {isAdmin && (
                                  <button
                                    className="btn btn-icon btn-sm btn-ghost-secondary flex-shrink-0"
                                    onClick={() => setIsEditingPixelId(true)}
                                    style={{ padding: '2px 6px' }}
                                    title="Edit Pixel Code"
                                  >
                                    <IconPencil size={12} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <div className="card card-sm h-100">
                      <div className="card-body py-3">
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
                  <div className="col-md-3">
                    <div className="card card-sm h-100">
                      <div className="card-body py-3">
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
                    // Admin view - with edit mode toggle
                    <div className="card" style={{ backgroundColor: '#1e293b', border: 'none' }}>
                      <div className="card-body p-0">
                        <div
                          className="p-3"
                          style={{
                            backgroundColor: '#0f172a',
                            borderRadius: '8px 8px 0 0',
                            borderBottom: '1px solid #334155'
                          }}
                        >
                          <div className="d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center">
                              <IconCode size={16} className="me-2" style={{ color: '#94a3b8' }} />
                              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>Installation Script</span>
                              {isEditingCode && (
                                <span className="badge bg-yellow-lt text-yellow ms-2" style={{ fontSize: '10px' }}>Editing</span>
                              )}
                            </div>
                            <button
                              className={`btn btn-sm ${copiedId === 'code' ? 'btn-success' : 'btn-primary'}`}
                              onClick={() => copyToClipboard(editedCode || getInstallationCode(selectedPixel), 'code')}
                            >
                              {copiedId === 'code' ? <><IconCheck size={14} className="me-1" />Copied!</> : <><IconCopy size={14} className="me-1" />Copy</>}
                            </button>
                          </div>
                        </div>
                        <div className="p-4">
                          {isEditingCode ? (
                            <textarea
                              className="form-control font-monospace border-0"
                              rows={6}
                              value={editedCode}
                              onChange={(e) => setEditedCode(e.target.value)}
                              placeholder="Enter installation code..."
                              autoFocus
                              style={{
                                fontSize: '13px',
                                backgroundColor: 'transparent',
                                color: '#e2e8f0',
                                resize: 'vertical',
                                lineHeight: '1.6'
                              }}
                            />
                          ) : (
                            <pre
                              className="mb-0"
                              style={{
                                color: '#e2e8f0',
                                fontSize: '13px',
                                lineHeight: '1.6',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-all',
                                margin: 0,
                                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace'
                              }}
                            >
                              <code>{editedCode || <span style={{ color: '#64748b', fontStyle: 'italic' }}>No installation code set</span>}</code>
                            </pre>
                          )}
                        </div>
                        <div
                          className="p-3 d-flex align-items-center justify-content-between"
                          style={{
                            backgroundColor: '#0f172a',
                            borderRadius: '0 0 8px 8px',
                            borderTop: '1px solid #334155'
                          }}
                        >
                          <div className="d-flex align-items-center gap-2">
                            {saveMessage && (
                              <span className={`badge ${saveMessage.type === 'success' ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                                {saveMessage.type === 'success' ? <IconCheck size={12} className="me-1" /> : <IconX size={12} className="me-1" />}
                                {saveMessage.text}
                              </span>
                            )}
                          </div>
                          <div className="d-flex gap-2">
                            {isEditingCode ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost-secondary btn-sm"
                                  onClick={() => {
                                    setEditedCode(selectedPixel.custom_installation_code || '');
                                    setIsEditingCode(false);
                                  }}
                                  disabled={savingCode}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={() => {
                                    handleSaveCode();
                                    setIsEditingCode(false);
                                  }}
                                  disabled={savingCode || editedCode === (selectedPixel.custom_installation_code || '')}
                                >
                                  {savingCode ? (
                                    <><IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />Saving...</>
                                  ) : (
                                    <><IconDeviceFloppy size={14} className="me-1" />Save</>
                                  )}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-ghost-secondary btn-sm"
                                onClick={() => setIsEditingCode(true)}
                              >
                                <IconPencil size={14} className="me-1" />Edit
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // User view - read-only code
                    <div className="card" style={{ backgroundColor: '#1e293b', border: 'none' }}>
                      <div className="card-body p-0">
                        <div
                          className="p-3"
                          style={{
                            backgroundColor: '#0f172a',
                            borderRadius: '8px 8px 0 0',
                            borderBottom: '1px solid #334155'
                          }}
                        >
                          <div className="d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center">
                              <IconCode size={16} className="me-2" style={{ color: '#94a3b8' }} />
                              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>Installation Script</span>
                            </div>
                            <span className="badge bg-green-lt text-green" style={{ fontSize: '10px' }}>Ready to use</span>
                          </div>
                        </div>
                        <div className="p-4">
                          <pre
                            className="mb-0"
                            style={{
                              color: '#e2e8f0',
                              fontSize: '13px',
                              lineHeight: '1.6',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all',
                              margin: 0,
                              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace'
                            }}
                          >
                            <code>{getInstallationCode(selectedPixel)}</code>
                          </pre>
                        </div>
                        <div
                          className="p-3 d-flex align-items-center justify-content-between"
                          style={{
                            backgroundColor: '#0f172a',
                            borderRadius: '0 0 8px 8px',
                            borderTop: '1px solid #334155'
                          }}
                        >
                          <small style={{ color: '#64748b' }}>
                            <IconInfoCircle size={14} className="me-1" />
                            Paste in the <code style={{ color: '#a5b4fc' }}>&lt;head&gt;</code> section of your website
                          </small>
                          <button
                            className={`btn btn-sm ${copiedId === 'code' ? 'btn-success' : 'btn-primary'}`}
                            onClick={() => copyToClipboard(getInstallationCode(selectedPixel), 'code')}
                          >
                            {copiedId === 'code' ? <><IconCheck size={14} className="me-1" />Copied!</> : <><IconCopy size={14} className="me-1" />Copy Code</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Visitors API URL - Admin only */}
                {isAdmin && (
                  <div className="mb-4">
                    <h4 className="mb-3">Visitors API URL</h4>
                    <div className="card" style={{ backgroundColor: '#1e293b', border: 'none' }}>
                      <div className="card-body p-0">
                        <div
                          className="p-3"
                          style={{
                            backgroundColor: '#0f172a',
                            borderRadius: '8px 8px 0 0',
                            borderBottom: '1px solid #334155'
                          }}
                        >
                          <div className="d-flex align-items-center justify-content-between">
                            <div className="d-flex align-items-center">
                              <IconApi size={16} className="me-2" style={{ color: '#94a3b8' }} />
                              <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 500 }}>External API Endpoint</span>
                              {isEditingApiUrl && (
                                <span className="badge bg-yellow-lt text-yellow ms-2" style={{ fontSize: '10px' }}>Editing</span>
                              )}
                            </div>
                            <div className="d-flex align-items-center gap-2">
                              {selectedPixel.visitors_api_last_fetched_at && (
                                <span style={{ color: '#64748b', fontSize: '11px' }}>
                                  Last fetched: {new Date(selectedPixel.visitors_api_last_fetched_at).toLocaleString()}
                                </span>
                              )}
                              {selectedPixel.visitors_api_last_fetch_status && (
                                <span className={`badge ${selectedPixel.visitors_api_last_fetch_status.startsWith('success') ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`} style={{ fontSize: '10px' }}>
                                  {selectedPixel.visitors_api_last_fetch_status.startsWith('success') ? 'Success' : 'Error'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="p-4">
                          {isEditingApiUrl ? (
                            <input
                              type="url"
                              className="form-control font-monospace border-0"
                              value={editedApiUrl}
                              onChange={(e) => setEditedApiUrl(e.target.value)}
                              placeholder="https://api.audiencelab.io/segments/UUID?page=1&page_size=50"
                              autoFocus
                              style={{
                                fontSize: '13px',
                                backgroundColor: 'transparent',
                                color: '#e2e8f0',
                              }}
                            />
                          ) : (
                            <div style={{ minHeight: '38px', display: 'flex', alignItems: 'center' }}>
                              {selectedPixel.visitors_api_url ? (
                                <code style={{
                                  color: '#a5b4fc',
                                  fontSize: '13px',
                                  wordBreak: 'break-all',
                                  fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace'
                                }}>
                                  {selectedPixel.visitors_api_url}
                                </code>
                              ) : (
                                <span style={{ color: '#64748b', fontStyle: 'italic', fontSize: '13px' }}>
                                  No API URL configured
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        <div
                          className="p-3 d-flex align-items-center justify-content-between"
                          style={{
                            backgroundColor: '#0f172a',
                            borderRadius: '0 0 8px 8px',
                            borderTop: '1px solid #334155'
                          }}
                        >
                          <div className="d-flex align-items-center gap-2">
                            {apiUrlMessage && (
                              <span className={`badge ${apiUrlMessage.type === 'success' ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                                {apiUrlMessage.type === 'success' ? <IconCheck size={12} className="me-1" /> : <IconX size={12} className="me-1" />}
                                {apiUrlMessage.text}
                              </span>
                            )}
                          </div>
                          <div className="d-flex gap-2">
                            {isEditingApiUrl ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost-secondary btn-sm"
                                  onClick={() => {
                                    setEditedApiUrl(selectedPixel.visitors_api_url || '');
                                    setIsEditingApiUrl(false);
                                  }}
                                  disabled={savingApiUrl}
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary btn-sm"
                                  onClick={handleSaveApiUrl}
                                  disabled={savingApiUrl || editedApiUrl === (selectedPixel.visitors_api_url || '')}
                                >
                                  {savingApiUrl ? (
                                    <><IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />Saving...</>
                                  ) : (
                                    <><IconDeviceFloppy size={14} className="me-1" />Save</>
                                  )}
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-ghost-secondary btn-sm"
                                onClick={() => setIsEditingApiUrl(true)}
                              >
                                <IconPencil size={14} className="me-1" />Edit
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quick Install - Only show for non-admin users */}
                {!isAdmin && (
                  <div>
                    <h4 className="mb-3">Quick Installation</h4>
                    <div className="row g-3">
                      {[
                        { name: 'WordPress', platform: 'wordpress', icon: 'wordpress/wordpress-original.svg', desc: 'Plugin or theme editor' },
                        { name: 'Shopify', platform: 'shopify', icon: 'woocommerce/woocommerce-original.svg', desc: 'Add to theme.liquid' },
                        { name: 'Manual', platform: 'manual', icon: 'html5/html5-original.svg', desc: 'Paste in HTML head' },
                      ].map((opt) => (
                        <div className="col-md-4" key={opt.name}>
                          <div
                            className="card card-sm card-link"
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              setSelectedPlatform(opt.platform);
                              setGuideModalOpen(true);
                            }}
                          >
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
                )}
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body text-center py-5">
                <span className={`avatar avatar-xl ${activeTab === 'requests' ? 'bg-yellow-lt' : 'bg-azure-lt'} mb-3`}>
                  {activeTab === 'requests' ? <IconClock size={32} /> : <IconCode size={32} />}
                </span>
                <h3>{activeTab === 'requests' ? 'Pending Requests' : 'Select a Pixel'}</h3>
                <p className="text-muted mb-0">
                  {activeTab === 'requests'
                    ? 'Review and approve pixel requests from users'
                    : 'Choose a pixel from the list to view details'}
                </p>
              </div>

              {/* Quick Install - Show even without a pixel selected for non-admin users */}
              {!isAdmin && activeTab === 'pixels' && (
                <div className="card-body border-top">
                  <h4 className="mb-3">Installation Guides</h4>
                  <p className="text-muted mb-3" style={{ fontSize: '13px' }}>
                    Learn how to install the Traffic AI pixel on your website
                  </p>
                  <div className="row g-3">
                    {[
                      { name: 'WordPress', platform: 'wordpress', icon: 'wordpress/wordpress-original.svg', desc: 'Plugin or theme editor' },
                      { name: 'Shopify', platform: 'shopify', icon: 'woocommerce/woocommerce-original.svg', desc: 'Add to theme.liquid' },
                      { name: 'Manual', platform: 'manual', icon: 'html5/html5-original.svg', desc: 'Paste in HTML head' },
                    ].map((opt) => (
                      <div className="col-md-4" key={opt.name}>
                        <div
                          className="card card-sm card-link"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setSelectedPlatform(opt.platform);
                            setGuideModalOpen(true);
                          }}
                        >
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
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create Pixel for User Modal (Admin only) */}
      {showCreateModal && isAdmin && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-md">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title"><IconPlus className="icon me-2" />Create Pixel</h5>
                <button type="button" className="btn-close" onClick={handleCloseCreateModal} />
              </div>
              <div className="modal-body">
                {/* Step 1: Select User */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">
                    <span className="badge bg-primary me-2">1</span>
                    Select User Account
                  </label>
                  <select
                    className="form-select"
                    value={selectedUserId}
                    onChange={(e) => handleSelectUser(e.target.value)}
                    disabled={loadingUsers}
                  >
                    <option value="">-- Choose a user --</option>
                    {/* Filter out admin users, show users with pending requests first */}
                    {users
                      .filter((user) => user.role !== 'admin')
                      .sort((a, b) => {
                        const aHasRequest = pixelRequests.some(r => r.user_id === a.id && r.status === 'pending');
                        const bHasRequest = pixelRequests.some(r => r.user_id === b.id && r.status === 'pending');
                        if (aHasRequest && !bHasRequest) return -1;
                        if (!aHasRequest && bHasRequest) return 1;
                        return 0;
                      })
                      .map((user) => {
                        const pendingRequest = pixelRequests.find(r => r.user_id === user.id && r.status === 'pending');
                        return (
                          <option key={user.id} value={user.id}>
                            {user.email}{pendingRequest ? ` ⭐ (Requested: ${pendingRequest.name})` : ''}
                          </option>
                        );
                      })}
                  </select>
                  {loadingUsers && (
                    <small className="text-muted"><IconLoader2 size={12} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />Loading users...</small>
                  )}
                </div>

                {/* Show request info if auto-filled */}
                {filledFromRequest && (
                  <div className="alert alert-success py-2 mb-4">
                    <div className="d-flex align-items-center">
                      <IconCircleCheck size={18} className="me-2" />
                      <div>
                        <strong>Request auto-filled!</strong>
                        <div className="text-muted small">Name: {filledFromRequest.name} | Domain: {filledFromRequest.domain}</div>
                        {filledFromRequest.data_points && filledFromRequest.data_points.length > 0 && (
                          <div className="d-flex flex-wrap gap-1 mt-1">
                            {filledFromRequest.data_points.map((dp) => (
                              <span key={dp} className="badge" style={{
                                fontSize: '10px',
                                fontWeight: 500,
                                backgroundColor: 'rgba(32, 107, 196, 0.15)',
                                color: '#4299e1',
                                borderRadius: '10px',
                                padding: '2px 8px',
                              }}>
                                {dp}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Pixel Details */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">
                    <span className="badge bg-primary me-2">2</span>
                    Pixel Details
                  </label>
                  <div className="row g-3">
                    <div className="col-6">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Pixel Name (e.g., Main Site)"
                        value={newPixel.name}
                        onChange={(e) => setNewPixel({ ...newPixel, name: e.target.value })}
                      />
                    </div>
                    <div className="col-6">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Domain (e.g., example.com)"
                        value={newPixel.domain}
                        onChange={(e) => setNewPixel({ ...newPixel, domain: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Step 3: Pixel Code */}
                <div className="mb-4">
                  <label className="form-label fw-semibold">
                    <span className="badge bg-primary me-2">3</span>
                    Pixel Code
                  </label>
                  <input
                    type="text"
                    className="form-control font-monospace"
                    placeholder="e.g., 588b2ebe-b6ec-4a0d-b896-fc29986afe74"
                    value={customPixelId}
                    onChange={(e) => setCustomPixelId(e.target.value)}
                    style={{ fontSize: '13px' }}
                  />
                  <small className="text-muted">Enter the UUID pixel identifier</small>
                </div>

                {/* Step 4: Custom Installation Code */}
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    <span className="badge bg-primary me-2">4</span>
                    Custom Installation Code
                  </label>
                  <textarea
                    className="form-control font-monospace"
                    rows={6}
                    placeholder='<script src="https://cdn.v3.identitypxl.app/pixels/YOUR-PIXEL-ID/" async></script>'
                    value={customInstallationCode}
                    onChange={(e) => setCustomInstallationCode(e.target.value)}
                    style={{ fontSize: '12px', backgroundColor: '#1e293b', color: '#e2e8f0' }}
                  />
                  <small className="text-muted">Paste the custom tracking script code</small>
                </div>

                {/* Step 5: Visitors API URL (Optional) */}
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    <span className="badge bg-secondary me-2">5</span>
                    Visitors API URL <span className="text-muted fw-normal">(Optional)</span>
                  </label>
                  <input
                    type="url"
                    className="form-control font-monospace"
                    placeholder="https://api.audiencelab.io/segments/UUID?page=1&page_size=50"
                    value={visitorsApiUrl}
                    onChange={(e) => setVisitorsApiUrl(e.target.value)}
                    style={{ fontSize: '12px' }}
                  />
                  <small className="text-muted">External API URL to pull visitor/contact data (can be added later)</small>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost-secondary" onClick={handleCloseCreateModal} disabled={processing}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleAdminCreatePixel}
                  disabled={processing || !selectedUserId || !newPixel.name || !newPixel.domain || !customPixelId.trim() || !customInstallationCode.trim()}
                >
                  {processing ? (
                    <><IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />Creating...</>
                  ) : (
                    <><IconPlus size={16} className="me-1" />Create Pixel</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Installation Guide Modal */}
      <InstallationGuideModal
        platform={selectedPlatform}
        isOpen={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
        pixelCode={selectedPixel?.custom_installation_code || selectedPixel?.pixel_code}
      />

      <style jsx>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </Layout>
  );
}
