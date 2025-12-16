import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
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
  IconAlertCircle
} from '@tabler/icons-react';
import type { Pixel, PixelStatus } from '@/lib/supabase/types';

export default function Pixels() {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPixel, setSelectedPixel] = useState<Pixel | null>(null);
  const [newPixel, setNewPixel] = useState({ name: '', domain: '' });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const fetchPixels = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pixels');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch pixels');
      }

      setPixels(data.pixels || []);
      // Auto-select first pixel if none selected
      if (data.pixels?.length > 0 && !selectedPixel) {
        setSelectedPixel(data.pixels[0]);
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [selectedPixel]);

  useEffect(() => {
    fetchPixels();
  }, [fetchPixels]);

  // Get the base URL for the pixel script and API
  const getBaseUrl = () => {
    if (typeof window !== 'undefined') {
      return window.location.origin;
    }
    return process.env.NEXT_PUBLIC_APP_URL || 'https://app.trafficai.io';
  };

  const generatePixelCode = (pixel: Pixel) => {
    const baseUrl = getBaseUrl();
    const version = '1.1.0'; // Increment this when pixel.js is updated
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

  const handleCreatePixel = async () => {
    if (!newPixel.name || !newPixel.domain) return;

    setCreating(true);
    try {
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
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setCreating(false);
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
      alert((err as Error).message);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadgeClass = (status: PixelStatus) => {
    switch (status) {
      case 'active':
        return 'bg-green-lt text-green';
      case 'pending':
        return 'bg-yellow-lt text-yellow';
      default:
        return 'bg-secondary-lt';
    }
  };

  if (loading) {
    return (
      <Layout title="Pixel Creation" pageTitle="Pixel Creation" pagePretitle="Traffic AI">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <div className="text-center">
            <IconLoader2 size={48} className="text-muted mb-3" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-muted">Loading pixels...</p>
          </div>
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

  if (error) {
    return (
      <Layout title="Pixel Creation" pageTitle="Pixel Creation" pagePretitle="Traffic AI">
        <div className="alert alert-danger">
          <div className="d-flex align-items-center">
            <div className="flex-fill">{error}</div>
            <button className="btn btn-outline-danger btn-sm" onClick={fetchPixels}>
              <IconRefresh size={16} className="me-1" />
              Retry
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Pixel Creation" pageTitle="Pixel Creation" pagePretitle="Traffic AI">
      <div className="row g-4">
        {/* Left Column - Pixel List */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Your Pixels</h3>
              <div className="card-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowCreateForm(true)}
                >
                  <IconPlus size={16} className="me-1" />
                  New Pixel
                </button>
              </div>
            </div>
            <div className="list-group list-group-flush">
              {pixels.length === 0 && !showCreateForm ? (
                <div className="list-group-item text-center py-4">
                  <div className="mb-3">
                    <span className="avatar avatar-xl bg-primary-lt">
                      <IconCode size={32} className="text-primary" />
                    </span>
                  </div>
                  <h4 className="mb-2">No pixels yet</h4>
                  <p className="text-muted mb-3">Create your first pixel to start tracking visitors</p>
                  <button
                    className="btn btn-primary"
                    onClick={() => setShowCreateForm(true)}
                  >
                    <IconPlus size={16} className="me-1" />
                    Create Pixel
                  </button>
                </div>
              ) : (
                <>
                  {/* Create Form */}
                  {showCreateForm && (
                    <div className="list-group-item p-3" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                      <div className="mb-3">
                        <label className="form-label">Pixel Name</label>
                        <input
                          type="text"
                          className="form-control form-control-sm"
                          placeholder="e.g., Main Website"
                          value={newPixel.name}
                          onChange={(e) => setNewPixel({ ...newPixel, name: e.target.value })}
                          autoFocus
                          disabled={creating}
                        />
                      </div>
                      <div className="mb-3">
                        <label className="form-label">Domain</label>
                        <div className="input-group input-group-sm">
                          <span className="input-group-text">
                            <IconWorldWww size={14} />
                          </span>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="example.com"
                            value={newPixel.domain}
                            onChange={(e) => setNewPixel({ ...newPixel, domain: e.target.value })}
                            disabled={creating}
                          />
                        </div>
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-primary btn-sm flex-fill"
                          onClick={handleCreatePixel}
                          disabled={!newPixel.name || !newPixel.domain || creating}
                        >
                          {creating ? (
                            <>
                              <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                              Creating...
                            </>
                          ) : (
                            <>
                              <IconCheck size={14} className="me-1" />
                              Create
                            </>
                          )}
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={() => {
                            setShowCreateForm(false);
                            setNewPixel({ name: '', domain: '' });
                          }}
                          disabled={creating}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pixel List */}
                  {pixels.map((pixel) => (
                    <div
                      key={pixel.id}
                      className={`list-group-item list-group-item-action d-flex align-items-center ${selectedPixel?.id === pixel.id ? 'active' : ''}`}
                      onClick={() => setSelectedPixel(pixel)}
                      style={{ cursor: 'pointer' }}
                    >
                      <span className={`avatar avatar-sm me-3 ${pixel.status === 'active' ? 'bg-green-lt' : 'bg-azure-lt'}`}>
                        <IconCode size={16} />
                      </span>
                      <div className="flex-fill">
                        <div className="d-flex align-items-center">
                          <span className="fw-semibold">{pixel.name}</span>
                          <span className={`badge ms-2 ${getStatusBadgeClass(pixel.status)}`} style={{ fontSize: '10px' }}>
                            {pixel.status}
                          </span>
                        </div>
                        <div className={`text-${selectedPixel?.id === pixel.id ? 'white-50' : 'muted'}`} style={{ fontSize: '12px' }}>
                          {pixel.domain}
                        </div>
                      </div>
                      <IconChevronRight size={16} className={selectedPixel?.id === pixel.id ? 'text-white' : 'text-muted'} />
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Pixel Details & Code */}
        <div className="col-lg-8">
          {selectedPixel ? (
            <div className="card">
              <div className="card-header">
                <div>
                  <h3 className="card-title d-flex align-items-center">
                    {selectedPixel.name}
                    <span className={`badge ms-2 ${getStatusBadgeClass(selectedPixel.status)}`}>
                      {selectedPixel.status}
                    </span>
                  </h3>
                  <div className="text-muted" style={{ fontSize: '13px' }}>
                    <IconWorldWww size={14} className="me-1" />
                    {selectedPixel.domain}
                  </div>
                </div>
                <div className="card-actions">
                  <button
                    className="btn btn-ghost-danger btn-sm"
                    onClick={() => handleDeletePixel(selectedPixel.id)}
                  >
                    <IconTrash size={16} className="me-1" />
                    Delete
                  </button>
                </div>
              </div>
              <div className="card-body">
                {/* Stats Row */}
                <div className="row g-3 mb-4">
                  <div className="col-md-4">
                    <div className="card card-sm">
                      <div className="card-body">
                        <div className="d-flex align-items-center">
                          <span className="avatar bg-primary-lt me-3">
                            <IconCode size={20} />
                          </span>
                          <div>
                            <div className="text-muted" style={{ fontSize: '12px' }}>Pixel ID</div>
                            <div className="fw-semibold" style={{ fontSize: '13px', fontFamily: 'monospace' }}>
                              {selectedPixel.pixel_code.substring(0, 12)}...
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
                          <span className="avatar bg-green-lt me-3">
                            <IconCircleCheck size={20} />
                          </span>
                          <div>
                            <div className="text-muted" style={{ fontSize: '12px' }}>Events Captured</div>
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

                {/* Installation Instructions */}
                <div className="mb-4">
                  <h4 className="mb-3">Installation Code</h4>
                  <div className="alert alert-info mb-3">
                    <div className="d-flex align-items-start">
                      <IconInfoCircle size={20} className="me-2 flex-shrink-0 mt-1" />
                      <div>
                        Copy this code and paste it in the <code>&lt;head&gt;</code> section of your website,
                        just before the closing <code>&lt;/head&gt;</code> tag.
                      </div>
                    </div>
                  </div>
                  <div className="position-relative">
                    <pre
                      className="p-3 rounded mb-0"
                      style={{
                        backgroundColor: '#1e293b',
                        color: '#e2e8f0',
                        fontSize: '13px',
                        lineHeight: '1.6',
                        overflow: 'auto',
                        border: '1px solid #334155',
                        maxHeight: '300px'
                      }}
                    >
                      <code>{generatePixelCode(selectedPixel)}</code>
                    </pre>
                    <button
                      className={`btn ${copiedId === 'code' ? 'btn-success' : 'btn-primary'} position-absolute`}
                      style={{ top: '12px', right: '12px' }}
                      onClick={() => copyToClipboard(generatePixelCode(selectedPixel), 'code')}
                    >
                      {copiedId === 'code' ? (
                        <>
                          <IconCheck size={16} className="me-1" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <IconCopy size={16} className="me-1" />
                          Copy Code
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Quick Install Options */}
                <div>
                  <h4 className="mb-3">Quick Installation Options</h4>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <div className="card card-sm card-link" style={{ cursor: 'pointer' }}>
                        <div className="card-body text-center py-3">
                          <div className="mb-2">
                            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/wordpress/wordpress-original.svg" alt="WordPress" width="32" height="32" />
                          </div>
                          <div className="fw-semibold" style={{ fontSize: '13px' }}>WordPress</div>
                          <div className="text-muted" style={{ fontSize: '11px' }}>Use plugin or theme editor</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card card-sm card-link" style={{ cursor: 'pointer' }}>
                        <div className="card-body text-center py-3">
                          <div className="mb-2">
                            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/woocommerce/woocommerce-original.svg" alt="Shopify" width="32" height="32" />
                          </div>
                          <div className="fw-semibold" style={{ fontSize: '13px' }}>Shopify</div>
                          <div className="text-muted" style={{ fontSize: '11px' }}>Add to theme.liquid</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card card-sm card-link" style={{ cursor: 'pointer' }}>
                        <div className="card-body text-center py-3">
                          <div className="mb-2">
                            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" alt="HTML" width="32" height="32" />
                          </div>
                          <div className="fw-semibold" style={{ fontSize: '13px' }}>Manual Install</div>
                          <div className="text-muted" style={{ fontSize: '11px' }}>Paste in HTML head</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="card-body text-center py-5">
                <div className="mb-3">
                  <span className="avatar avatar-xl bg-azure-lt">
                    <IconCode size={32} className="text-azure" />
                  </span>
                </div>
                <h3 className="mb-2">Select a Pixel</h3>
                <p className="text-muted mb-0">
                  Choose a pixel from the list to view its installation code and details
                </p>
              </div>
            </div>
          )}
        </div>
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
