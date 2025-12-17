import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { TrafficAPI } from '@/lib/api';
import { IconRefresh, IconShield, IconWorldWww, IconPlus, IconTrash, IconStar, IconStarFilled, IconLoader2, IconCheck } from '@tabler/icons-react';
import type { UserWebsite } from '@/lib/supabase/types';

export default function Settings() {
  const [connectionStatus, setConnectionStatus] = useState<'not_tested' | 'testing' | 'connected' | 'failed'>('not_tested');
  const [connectionMessage, setConnectionMessage] = useState('Click "Test Connection" to verify your access');
  const [credits, setCredits] = useState<number | null>(null);

  // Websites state
  const [websites, setWebsites] = useState<UserWebsite[]>([]);
  const [websitesLoading, setWebsitesLoading] = useState(true);
  const [showAddWebsite, setShowAddWebsite] = useState(false);
  const [newWebsite, setNewWebsite] = useState({ url: '', name: '' });
  const [addingWebsite, setAddingWebsite] = useState(false);
  const [websiteError, setWebsiteError] = useState<string | null>(null);

  const fetchWebsites = useCallback(async () => {
    try {
      setWebsitesLoading(true);
      const response = await fetch('/api/websites');
      const data = await response.json();
      if (response.ok) {
        setWebsites(data.websites || []);
      }
    } catch (error) {
      console.error('Error fetching websites:', error);
    } finally {
      setWebsitesLoading(false);
    }
  }, []);

  const handleAddWebsite = async () => {
    if (!newWebsite.url) return;

    setAddingWebsite(true);
    setWebsiteError(null);

    try {
      const response = await fetch('/api/websites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: newWebsite.url,
          name: newWebsite.name || null,
          is_primary: websites.length === 0,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to add website');
      }

      setWebsites([data.website, ...websites]);
      setNewWebsite({ url: '', name: '' });
      setShowAddWebsite(false);
    } catch (error) {
      setWebsiteError((error as Error).message);
    } finally {
      setAddingWebsite(false);
    }
  };

  const handleDeleteWebsite = async (id: string) => {
    if (!confirm('Are you sure you want to remove this website?')) return;

    try {
      const response = await fetch(`/api/websites/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setWebsites(websites.filter(w => w.id !== id));
      }
    } catch (error) {
      console.error('Error deleting website:', error);
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      const response = await fetch(`/api/websites/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_primary: true }),
      });

      if (response.ok) {
        setWebsites(websites.map(w => ({
          ...w,
          is_primary: w.id === id,
        })));
      }
    } catch (error) {
      console.error('Error setting primary website:', error);
    }
  };

  useEffect(() => {
    loadCredits();
    testConnection();
    fetchWebsites();
  }, [fetchWebsites]);

  const testConnection = async () => {
    setConnectionStatus('testing');
    setConnectionMessage('Connecting to API...');

    try {
      const result = await TrafficAPI.testConnection();

      if (result.success) {
        setConnectionStatus('connected');
        setConnectionMessage('API connection successful');
      } else {
        setConnectionStatus('failed');
        setConnectionMessage(result.message || 'Connection failed');
      }
    } catch (error) {
      setConnectionStatus('failed');
      setConnectionMessage((error as Error).message);
    }
  };

  const loadCredits = async () => {
    try {
      const data = await TrafficAPI.getCredits();
      setCredits(data.credits || data.available || 0);
    } catch (error) {
      console.error('Error loading credits:', error);
      setCredits(null);
    }
  };

  return (
    <Layout title="Settings" pageTitle="Settings" pagePretitle="Traffic AI">
      <div className="row row-cards">
        <div className="col-lg-8">
          {/* Connection Test */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Connection Status</h3>
            </div>
            <div className="card-body">
              <div className="row align-items-center">
                <div className="col">
                  <div>
                    {connectionStatus === 'not_tested' && <span className="badge bg-secondary">Not tested</span>}
                    {connectionStatus === 'testing' && <span className="badge bg-blue">Testing...</span>}
                    {connectionStatus === 'connected' && <span className="badge bg-green">Connected</span>}
                    {connectionStatus === 'failed' && <span className="badge bg-red">Failed</span>}
                  </div>
                  <div className="text-muted small mt-1">{connectionMessage}</div>
                </div>
                <div className="col-auto">
                  <button
                    className="btn btn-outline-primary"
                    onClick={testConnection}
                    disabled={connectionStatus === 'testing'}
                  >
                    <IconRefresh className="icon" />
                    Test Connection
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Credits Info */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Account Credits</h3>
            </div>
            <div className="card-body">
              <div className="row align-items-center">
                <div className="col">
                  <div className="h1 mb-0">{credits !== null ? credits.toLocaleString() : '-'}</div>
                  <div className="text-muted">Available credits</div>
                </div>
                <div className="col-auto">
                  <button className="btn btn-outline-primary" onClick={loadCredits}>
                    <IconRefresh className="icon" />
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Websites Management */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconWorldWww className="icon me-2" />
                My Websites
              </h3>
              <div className="card-actions">
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowAddWebsite(true)}
                >
                  <IconPlus size={16} className="me-1" />
                  Add Website
                </button>
              </div>
            </div>
            <div className="card-body">
              {websiteError && (
                <div className="alert alert-danger mb-3">{websiteError}</div>
              )}

              {/* Add Website Form */}
              {showAddWebsite && (
                <div className="mb-4 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                  <div className="mb-3">
                    <label className="form-label">Website URL</label>
                    <input
                      type="url"
                      className="form-control"
                      placeholder="https://example.com"
                      value={newWebsite.url}
                      onChange={(e) => setNewWebsite({ ...newWebsite, url: e.target.value })}
                      disabled={addingWebsite}
                      autoFocus
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Name (optional)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g., Main Website, Blog, etc."
                      value={newWebsite.name}
                      onChange={(e) => setNewWebsite({ ...newWebsite, name: e.target.value })}
                      disabled={addingWebsite}
                    />
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-primary"
                      onClick={handleAddWebsite}
                      disabled={!newWebsite.url || addingWebsite}
                    >
                      {addingWebsite ? (
                        <>
                          <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                          Adding...
                        </>
                      ) : (
                        <>
                          <IconCheck size={16} className="me-1" />
                          Add Website
                        </>
                      )}
                    </button>
                    <button
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        setShowAddWebsite(false);
                        setNewWebsite({ url: '', name: '' });
                        setWebsiteError(null);
                      }}
                      disabled={addingWebsite}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Websites List */}
              {websitesLoading ? (
                <div className="text-center py-4">
                  <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                  <p className="text-muted mt-2 mb-0">Loading websites...</p>
                </div>
              ) : websites.length === 0 ? (
                <div className="text-center py-4">
                  <div className="mb-3">
                    <span className="avatar avatar-lg bg-azure-lt">
                      <IconWorldWww size={24} className="text-azure" />
                    </span>
                  </div>
                  <h4 className="mb-2">No websites yet</h4>
                  <p className="text-muted mb-0">
                    Add your company websites to manage and track them.
                  </p>
                </div>
              ) : (
                <div className="list-group list-group-flush">
                  {websites.map((website) => (
                    <div key={website.id} className="list-group-item d-flex align-items-center px-0">
                      <span className={`avatar avatar-sm me-3 ${website.is_primary ? 'bg-yellow-lt' : 'bg-azure-lt'}`}>
                        {website.is_primary ? (
                          <IconStarFilled size={16} className="text-yellow" />
                        ) : (
                          <IconWorldWww size={16} />
                        )}
                      </span>
                      <div className="flex-fill">
                        <div className="d-flex align-items-center">
                          <span className="fw-semibold">{website.name || 'Website'}</span>
                          {website.is_primary && (
                            <span className="badge bg-yellow-lt text-yellow ms-2" style={{ fontSize: '10px' }}>
                              Primary
                            </span>
                          )}
                        </div>
                        <div className="text-muted small">{website.url}</div>
                      </div>
                      <div className="d-flex gap-1">
                        {!website.is_primary && (
                          <button
                            className="btn btn-ghost-warning btn-sm"
                            onClick={() => handleSetPrimary(website.id)}
                            title="Set as primary"
                          >
                            <IconStar size={16} />
                          </button>
                        )}
                        <button
                          className="btn btn-ghost-danger btn-sm"
                          onClick={() => handleDeleteWebsite(website.id)}
                          title="Remove website"
                        >
                          <IconTrash size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-4">
          {/* API Info */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">API Information</h3>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">Base URL</label>
                <code className="d-block p-2 bg-light rounded">
                  https://v3-api-job-72802495918.us-east1.run.app
                </code>
              </div>

              <div>
                <label className="form-label">Available Endpoints</label>
                <ul className="list-unstyled text-muted small mb-0">
                  <li>
                    <code>/audiences</code> - Manage audiences
                  </li>
                  <li>
                    <code>/audiences/custom</code> - Custom audiences
                  </li>
                  <li>
                    <code>/audiences/attributes/{'{attr}'}</code> - Get attributes
                  </li>
                  <li>
                    <code>/enrich</code> - Contact enrichment
                  </li>
                  <li>
                    <code>/user/credits</code> - Check credits
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div className="card bg-azure-lt">
            <div className="card-body">
              <div className="d-flex">
                <div className="me-3">
                  <IconShield className="icon icon-lg" />
                </div>
                <div>
                  <h4 className="mb-1">API Access</h4>
                  <p className="mb-0 small">
                    Your API access is managed by your administrator. Contact your admin if you need access or have questions.
                  </p>
                </div>
              </div>
            </div>
          </div>
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
