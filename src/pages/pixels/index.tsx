import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import {
  IconCode,
  IconCopy,
  IconCheck,
  IconPlus,
  IconTrash,
  IconWorldWww,
  IconChevronDown,
  IconChevronRight,
  IconBrandFacebook,
  IconBrandGoogle,
  IconMail,
  IconDatabase,
  IconArrowRight,
  IconInfoCircle,
  IconX,
  IconRocket,
  IconPlugConnected,
  IconLoader2,
  IconRefresh
} from '@tabler/icons-react';
import type { Pixel, PixelStatus } from '@/lib/supabase/types';

interface IntegrationDisplay {
  type: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  is_connected: boolean;
}

export default function Pixels() {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [selectedPixel, setSelectedPixel] = useState<Pixel | null>(null);
  const [newPixel, setNewPixel] = useState({ name: '', domain: '' });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [creating, setCreating] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationDisplay[]>([]);

  const integrationIcons: Record<string, React.ReactNode> = {
    facebook: <IconBrandFacebook size={24} />,
    google: <IconBrandGoogle size={24} />,
    email: <IconMail size={24} />,
    crm: <IconDatabase size={24} />,
  };

  const fetchPixels = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pixels');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch pixels');
      }

      setPixels(data.pixels || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchIntegrations = useCallback(async () => {
    try {
      const response = await fetch('/api/integrations');
      const data = await response.json();

      if (response.ok && data.integrations) {
        setIntegrations(data.integrations.map((int: { type: string; name: string; description: string; is_connected: boolean }) => ({
          ...int,
          icon: integrationIcons[int.type] || <IconPlugConnected size={24} />,
        })));
      }
    } catch (err) {
      console.error('Failed to fetch integrations:', err);
    }
  }, []);

  useEffect(() => {
    fetchPixels();
    fetchIntegrations();
  }, [fetchPixels, fetchIntegrations]);

  const setupSteps = [
    { id: 1, label: 'Create Pixel', completed: pixels.length > 0 },
    { id: 2, label: 'Install Code', completed: pixels.some(p => p.status === 'active') },
    { id: 3, label: 'Verify Installation', completed: pixels.some(p => p.events_count > 0) },
    { id: 4, label: 'Connect Integration', completed: integrations.some(i => i.is_connected) },
    { id: 5, label: 'Build Audience', completed: false },
  ];

  const completedSteps = setupSteps.filter(s => s.completed).length;

  const generatePixelCode = (pixel: Pixel) => {
    return `<!-- Traffic AI Pixel - ${pixel.name} -->
<script>
  (function(t,r,a,f,i,c){
    t.TrafficAI=t.TrafficAI||[];
    t.TrafficAI.push({'pixelId':'${pixel.pixel_code}'});
    var s=r.createElement('script');
    s.async=true;
    s.src='https://cdn.trafficai.io/pixel.js';
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
      setShowCreateModal(false);
      setSelectedPixel(data.pixel);
      setShowCodeModal(true);
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

      setPixels(pixels.filter(p => p.id !== id));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleViewCode = (pixel: Pixel) => {
    setSelectedPixel(pixel);
    setShowCodeModal(true);
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleConnectIntegration = async (type: string) => {
    try {
      const response = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, config: {} }),
      });

      if (response.ok) {
        fetchIntegrations();
      }
    } catch (err) {
      console.error('Failed to connect integration:', err);
    }
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
      <Layout title="Pixel Creation" pageTitle="Capture Visitor Data" pagePretitle="Traffic AI">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <div className="text-center">
            <IconLoader2 size={48} className="text-muted mb-3 spinner-border" style={{ animation: 'spin 1s linear infinite' }} />
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
      <Layout title="Pixel Creation" pageTitle="Capture Visitor Data" pagePretitle="Traffic AI">
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
    <Layout title="Pixel Creation" pageTitle="Capture Visitor Data" pagePretitle="Traffic AI">
      {/* Setup Progress Card */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div className="row align-items-center">
            <div className="col-auto">
              <span className="fw-bold" style={{ fontSize: '15px' }}>Complete Account Setup</span>
            </div>
            <div className="col">
              <div className="d-flex align-items-center gap-1">
                {setupSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className="flex-fill"
                    style={{
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: step.completed ? 'var(--tblr-primary)' : 'var(--tblr-border-color)',
                      marginRight: index < setupSteps.length - 1 ? '4px' : 0
                    }}
                    title={step.label}
                  />
                ))}
              </div>
            </div>
            <div className="col-auto">
              <span className="text-muted" style={{ fontSize: '14px' }}>{completedSteps}/{setupSteps.length} steps completed</span>
            </div>
            <div className="col-auto">
              <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                Get Started
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Install Pixel Banner */}
      {showInstallBanner && pixels.length === 0 && (
        <div className="card mb-4 border-primary" style={{ borderWidth: '2px', backgroundColor: 'rgba(32, 107, 196, 0.05)' }}>
          <div className="card-body">
            <div className="row align-items-center">
              <div className="col-auto">
                <span className="avatar avatar-lg bg-primary-lt">
                  <IconInfoCircle size={28} className="text-primary" />
                </span>
              </div>
              <div className="col">
                <h3 className="mb-1" style={{ fontSize: '17px' }}>Install Traffic AI Pixel to capture your contacts</h3>
                <p className="text-muted mb-0" style={{ fontSize: '14px' }}>
                  Use our tracking pixel to automatically capture contacts from your website visitors.
                </p>
              </div>
              <div className="col-auto">
                <div className="btn-list">
                  <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                    <IconCode size={18} className="me-1" />
                    Install Pixel
                  </button>
                  <button className="btn btn-outline-secondary">
                    I already sent the installation guide
                  </button>
                </div>
              </div>
              <div className="col-auto">
                <button className="btn btn-ghost-secondary btn-icon" onClick={() => setShowInstallBanner(false)}>
                  <IconX size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* How It Works - Expandable */}
      <div className="card mb-4">
        <div
          className="card-body py-3 cursor-pointer d-flex align-items-center"
          onClick={() => setShowGuide(!showGuide)}
          style={{ cursor: 'pointer' }}
        >
          {showGuide ? <IconChevronDown size={20} className="me-2" /> : <IconChevronRight size={20} className="me-2" />}
          <span className="fw-semibold">Guide: How Traffic AI website visitor tracking works</span>
        </div>
        {showGuide && (
          <div className="card-body border-top pt-4">
            <div className="row g-4">
              <div className="col-md-4">
                <div className="d-flex">
                  <div className="flex-shrink-0">
                    <span className="avatar bg-primary text-white">1</span>
                  </div>
                  <div className="ms-3">
                    <h4 className="mb-1">Install Pixel</h4>
                    <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Add a small JavaScript snippet to your website's header.</p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="d-flex">
                  <div className="flex-shrink-0">
                    <span className="avatar bg-primary text-white">2</span>
                  </div>
                  <div className="ms-3">
                    <h4 className="mb-1">Capture Visitors</h4>
                    <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Automatically identify and track anonymous visitors to your site.</p>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="d-flex">
                  <div className="flex-shrink-0">
                    <span className="avatar bg-primary text-white">3</span>
                  </div>
                  <div className="ms-3">
                    <h4 className="mb-1">Sync & Engage</h4>
                    <p className="text-muted mb-0" style={{ fontSize: '13px' }}>Send captured contacts to your marketing tools automatically.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Sources & Destinations */}
      <div className="row g-4">
        {/* Sources */}
        <div className="col-lg-5">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h3 className="mb-0" style={{ fontSize: '16px' }}>Sources</h3>
            <button className="btn btn-outline-secondary btn-sm" onClick={() => setShowCreateModal(true)}>
              <IconPlus size={16} className="me-1" />
              Source
            </button>
          </div>

          {pixels.length === 0 ? (
            <div
              className="card border-primary border-2"
              style={{
                borderStyle: 'dashed',
                backgroundColor: 'rgba(32, 107, 196, 0.03)',
                position: 'relative'
              }}
            >
              <div className="ribbon ribbon-top ribbon-bookmark bg-yellow">
                <IconInfoCircle size={16} />
              </div>
              <div className="card-body text-center py-4">
                <div className="mb-3">
                  <span className="avatar avatar-xl bg-primary-lt">
                    <IconCode size={32} className="text-primary" />
                  </span>
                </div>
                <h3 className="mb-2">Traffic AI Pixel</h3>
                <p className="text-muted mb-3" style={{ fontSize: '14px' }}>
                  Install our pixel to identify and track anonymous visitors and known contacts when they visit your site.
                </p>
                <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                  <IconRocket size={18} className="me-1" />
                  Activate Pixel
                </button>
              </div>
              <div className="card-footer bg-yellow-lt text-center py-2">
                <small className="fw-semibold text-yellow">
                  <IconInfoCircle size={14} className="me-1" />
                  Setup Required
                </small>
              </div>
            </div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {pixels.map((pixel) => (
                <div key={pixel.id} className="card">
                  <div className="card-body">
                    <div className="d-flex align-items-start">
                      <span className={`avatar ${pixel.status === 'active' ? 'bg-green-lt' : 'bg-azure-lt'}`}>
                        <IconCode size={24} />
                      </span>
                      <div className="ms-3 flex-fill">
                        <div className="d-flex align-items-center mb-1">
                          <h4 className="mb-0 me-2">{pixel.name}</h4>
                          <span className={`badge ${getStatusBadgeClass(pixel.status)}`}>
                            {pixel.status}
                          </span>
                        </div>
                        <p className="text-muted mb-2" style={{ fontSize: '13px' }}>
                          {pixel.domain} • {pixel.events_count.toLocaleString()} events captured
                        </p>
                        <div className="btn-list">
                          <button className="btn btn-primary btn-sm" onClick={() => handleViewCode(pixel)}>
                            <IconCode size={16} className="me-1" />
                            Get Code
                          </button>
                          <button
                            className="btn btn-ghost-danger btn-icon btn-sm"
                            onClick={() => handleDeletePixel(pixel.id)}
                          >
                            <IconTrash size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button
                className="btn btn-outline-primary btn-sm align-self-start"
                onClick={() => setShowCreateModal(true)}
              >
                <IconPlus size={16} className="me-1" />
                Add Another Pixel
              </button>
            </div>
          )}
        </div>

        {/* Flow Arrow */}
        <div className="col-lg-2 d-flex align-items-center justify-content-center">
          <div className="text-center">
            <div className="rounded-circle bg-light d-inline-flex align-items-center justify-content-center" style={{ width: '64px', height: '64px' }}>
              <IconPlugConnected size={28} className="text-muted" />
            </div>
            <div className="mt-2">
              <IconArrowRight size={24} className="text-muted d-none d-lg-inline" />
            </div>
          </div>
        </div>

        {/* Destinations */}
        <div className="col-lg-5">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h3 className="mb-0" style={{ fontSize: '16px' }}>Destinations</h3>
            <button className="btn btn-outline-secondary btn-sm">
              <IconPlus size={16} className="me-1" />
              Destination
            </button>
          </div>

          <div className="d-flex flex-column gap-3">
            {integrations.map((dest) => (
              <div key={dest.type} className="card">
                <div className="card-body py-3">
                  <div className="d-flex align-items-center">
                    <span className="avatar bg-light">
                      {dest.icon}
                    </span>
                    <div className="ms-3 flex-fill">
                      <h4 className="mb-0" style={{ fontSize: '15px' }}>{dest.name}</h4>
                      <p className="text-muted mb-0" style={{ fontSize: '13px' }}>{dest.description}</p>
                    </div>
                    <div>
                      <button
                        className={`btn btn-sm ${dest.is_connected ? 'btn-success' : 'btn-outline-primary'}`}
                        onClick={() => !dest.is_connected && handleConnectIntegration(dest.type)}
                        disabled={dest.is_connected}
                      >
                        {dest.is_connected ? (
                          <>
                            <IconCheck size={16} className="me-1" />
                            Connected
                          </>
                        ) : (
                          'Connect Now'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Create Pixel Modal */}
      {showCreateModal && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(24, 36, 51, 0.85)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Create New Pixel</h5>
                <button type="button" className="btn-close" onClick={() => setShowCreateModal(false)} disabled={creating}></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label required">Pixel Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g., Main Website"
                    value={newPixel.name}
                    onChange={(e) => setNewPixel({ ...newPixel, name: e.target.value })}
                    autoFocus
                    disabled={creating}
                  />
                  <span className="form-hint">A friendly name to identify this pixel</span>
                </div>
                <div className="mb-3">
                  <label className="form-label required">Domain</label>
                  <div className="input-group">
                    <span className="input-group-text">
                      <IconWorldWww size={18} />
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
                  <span className="form-hint">The domain where this pixel will be installed</span>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn me-auto" onClick={() => setShowCreateModal(false)} disabled={creating}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleCreatePixel}
                  disabled={!newPixel.name || !newPixel.domain || creating}
                >
                  {creating ? (
                    <>
                      <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      Creating...
                    </>
                  ) : (
                    <>
                      <IconPlus className="icon" />
                      Create Pixel
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Code Modal */}
      {showCodeModal && selectedPixel && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(24, 36, 51, 0.85)' }}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <div>
                  <h5 className="modal-title">{selectedPixel.name}</h5>
                  <div className="text-muted" style={{ fontSize: '13px' }}>{selectedPixel.domain}</div>
                </div>
                <button type="button" className="btn-close" onClick={() => setShowCodeModal(false)}></button>
              </div>
              <div className="modal-body">
                <div className="alert alert-info mb-3">
                  <div className="d-flex">
                    <div>
                      <IconInfoCircle size={20} className="me-2" />
                    </div>
                    <div>
                      Copy this code and paste it in the <code>&lt;head&gt;</code> section of your website,
                      just before the closing <code>&lt;/head&gt;</code> tag.
                    </div>
                  </div>
                </div>
                <div className="position-relative">
                  <pre
                    className="p-3 rounded"
                    style={{
                      backgroundColor: '#1e293b',
                      color: '#e2e8f0',
                      fontSize: '13px',
                      lineHeight: '1.6',
                      overflow: 'auto',
                      border: '1px solid #334155'
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

                <div className="mt-4">
                  <h4 className="mb-3">Quick Installation Options</h4>
                  <div className="row g-3">
                    <div className="col-md-4">
                      <div className="card card-sm" style={{ cursor: 'pointer' }}>
                        <div className="card-body text-center py-3">
                          <div className="mb-2">
                            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/wordpress/wordpress-original.svg" alt="WordPress" width="32" height="32" />
                          </div>
                          <div className="fw-semibold" style={{ fontSize: '13px' }}>WordPress</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card card-sm" style={{ cursor: 'pointer' }}>
                        <div className="card-body text-center py-3">
                          <div className="mb-2">
                            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/woocommerce/woocommerce-original.svg" alt="Shopify" width="32" height="32" />
                          </div>
                          <div className="fw-semibold" style={{ fontSize: '13px' }}>Shopify</div>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="card card-sm" style={{ cursor: 'pointer' }}>
                        <div className="card-body text-center py-3">
                          <div className="mb-2">
                            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/html5/html5-original.svg" alt="HTML" width="32" height="32" />
                          </div>
                          <div className="fw-semibold" style={{ fontSize: '13px' }}>Manual Install</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button className="btn me-auto" onClick={() => setShowCodeModal(false)}>
                  Close
                </button>
                <button className="btn btn-primary" onClick={() => {
                  copyToClipboard(generatePixelCode(selectedPixel), 'code');
                }}>
                  <IconCopy size={16} className="me-1" />
                  Copy Code
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
