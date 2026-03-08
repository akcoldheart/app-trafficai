import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconPlug,
  IconCheck,
  IconX,
  IconLoader2,
  IconRefresh,
  IconTrash,
  IconSend,
  IconEye,
  IconEyeOff,
  IconList,
  IconPlus,
  IconUsers,
  IconClick,
  IconArrowRight,
  IconAlertCircle,
  IconCircleCheck,
  IconArrowLeft,
} from '@tabler/icons-react';
import Link from 'next/link';

interface KlaviyoIntegration {
  id: string;
  is_connected: boolean;
  default_list_id: string | null;
  default_list_name: string | null;
  auto_sync_visitors: boolean;
  auto_sync_pixel_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at?: string;
}

interface KlaviyoList {
  id: string;
  name: string;
  created: string;
  updated: string;
}

interface Pixel {
  id: string;
  name: string;
  domain: string;
}

interface Audience {
  id: string;
  name: string;
  contact_count?: number;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function KlaviyoIntegrationPage() {
  const { userProfile } = useAuth();

  // Klaviyo state
  const [integration, setIntegration] = useState<KlaviyoIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Lists
  const [lists, setLists] = useState<KlaviyoList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  // Pixels for auto-sync
  const [pixels, setPixels] = useState<Pixel[]>([]);

  // Audiences for export
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(false);

  // Sync state
  const [syncingVisitors, setSyncingVisitors] = useState(false);
  const [syncingAudience, setSyncingAudience] = useState<string | null>(null);
  const [selectedSyncList, setSelectedSyncList] = useState<string>('');
  const [selectedAudienceList, setSelectedAudienceList] = useState<Record<string, string>>({});

  // Settings saving
  const [savingSettings, setSavingSettings] = useState(false);

  // Toast
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const fetchIntegration = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/integrations/klaviyo/status');
      const data = await response.json();
      if (response.ok) {
        setIntegration(data.integration);
      }
    } catch (error) {
      console.error('Error fetching Klaviyo status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchLists = useCallback(async () => {
    try {
      setListsLoading(true);
      const response = await fetch('/api/integrations/klaviyo/lists');
      const data = await response.json();
      if (response.ok) {
        setLists(data.lists || []);
      }
    } catch (error) {
      console.error('Error fetching Klaviyo lists:', error);
    } finally {
      setListsLoading(false);
    }
  }, []);

  const fetchPixels = useCallback(async () => {
    try {
      const response = await fetch('/api/pixels');
      const data = await response.json();
      if (response.ok) {
        setPixels(data.pixels || []);
      }
    } catch (error) {
      console.error('Error fetching pixels:', error);
    }
  }, []);

  const fetchAudiences = useCallback(async () => {
    try {
      setAudiencesLoading(true);
      const allAudiences: Audience[] = [];

      try {
        const localResp = await fetch('/api/audience-requests?status=approved&has_manual=true');
        const localData = await localResp.json();
        if (localResp.ok && localData.requests) {
          for (const req of localData.requests) {
            const formData = req.form_data as Record<string, unknown> | undefined;
            if (!formData?.manual_audience) continue;
            const manual = formData.manual_audience as Record<string, unknown>;
            allAudiences.push({
              id: req.audience_id || (manual.id as string) || req.id,
              name: req.name,
              contact_count: (manual.total_records as number) || 0,
            });
          }
        }
      } catch (e) {
        console.error('Error fetching local audiences:', e);
      }

      try {
        const apiResp = await fetch('/api/audiences');
        const apiData = await apiResp.json();
        if (apiResp.ok && apiData.Data) {
          for (const a of apiData.Data) {
            if (!allAudiences.find(x => x.id === a.id)) {
              allAudiences.push({
                id: a.id || a.audienceId,
                name: a.name,
                contact_count: a.total_records,
              });
            }
          }
        }
      } catch (e) {
        console.error('Error fetching API audiences:', e);
      }

      setAudiences(allAudiences);
    } catch (error) {
      console.error('Error fetching audiences:', error);
    } finally {
      setAudiencesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegration();
  }, [fetchIntegration]);

  useEffect(() => {
    if (integration?.is_connected) {
      fetchLists();
      fetchPixels();
      fetchAudiences();
    }
  }, [integration?.is_connected, fetchLists, fetchPixels, fetchAudiences]);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;

    setConnecting(true);
    try {
      const response = await fetch('/api/integrations/klaviyo/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      setIntegration(data.integration);
      setApiKey('');
      showToast('Klaviyo connected successfully!', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Klaviyo? This will remove your API key and stop all auto-syncing.')) {
      return;
    }

    setDisconnecting(true);
    try {
      const response = await fetch('/api/integrations/klaviyo/status', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to disconnect');

      setIntegration(null);
      setLists([]);
      showToast('Klaviyo disconnected', 'info');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    setCreatingList(true);
    try {
      const response = await fetch('/api/integrations/klaviyo/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newListName.trim() }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to create list');

      setLists([data.list, ...lists]);
      setNewListName('');
      setShowCreateList(false);
      showToast(`List "${data.list.name}" created`, 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setCreatingList(false);
    }
  };

  const handleSaveSettings = async (updates: Partial<KlaviyoIntegration>) => {
    setSavingSettings(true);
    try {
      const response = await fetch('/api/integrations/klaviyo/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save settings');

      setIntegration(prev => prev ? { ...prev, ...data.integration } : null);
      showToast('Settings saved', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSyncVisitors = async () => {
    setSyncingVisitors(true);
    try {
      const response = await fetch('/api/integrations/klaviyo/sync-visitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pixel_id: integration?.auto_sync_pixel_id || undefined,
          list_id: selectedSyncList || integration?.default_list_id || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to sync');

      showToast(data.message || `${data.synced} visitors synced`, 'success');
      fetchIntegration();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSyncingVisitors(false);
    }
  };

  const handleSyncAudience = async (audienceId: string) => {
    setSyncingAudience(audienceId);
    const listId = selectedAudienceList[audienceId] || integration?.default_list_id;

    try {
      const response = await fetch('/api/integrations/klaviyo/sync-audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience_id: audienceId,
          list_id: listId || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to sync audience');

      showToast(data.message || `${data.synced} contacts synced`, 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSyncingAudience(null);
    }
  };

  if (loading) {
    return (
      <Layout title="Klaviyo Integration" pageTitle="Klaviyo">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Klaviyo Integration" pageTitle="Klaviyo" pagePretitle="Integrations">
      {/* Toast */}
      {toast && (
        <div
          className={`alert alert-${toast.type === 'error' ? 'danger' : toast.type === 'success' ? 'success' : 'info'} alert-dismissible`}
          style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, maxWidth: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          <div className="d-flex align-items-center">
            {toast.type === 'success' && <IconCircleCheck size={18} className="me-2" />}
            {toast.type === 'error' && <IconAlertCircle size={18} className="me-2" />}
            {toast.message}
          </div>
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      )}

      {/* Back link */}
      <div className="mb-3">
        <Link href="/integrations" className="btn btn-ghost-primary btn-sm">
          <IconArrowLeft size={16} className="me-1" />
          All Integrations
        </Link>
      </div>

      <div className="row row-cards">
        {/* Klaviyo Integration Card */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <div className="me-3" style={{ width: 40, height: 40, borderRadius: 8, background: 'linear-gradient(135deg, #2BD27F 0%, #1A8B54 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>K</span>
                </div>
                <div>
                  <h3 className="card-title mb-0">Klaviyo</h3>
                  <div className="text-muted small">Email marketing & SMS automation</div>
                </div>
              </div>
              <div className="card-actions">
                {integration?.is_connected ? (
                  <span className="badge bg-green-lt">
                    <IconCheck size={14} className="me-1" />
                    Connected
                  </span>
                ) : (
                  <span className="badge bg-secondary-lt">Not connected</span>
                )}
              </div>
            </div>

            <div className="card-body">
              {!integration?.is_connected ? (
                /* Connect Form */
                <div>
                  <p className="text-muted mb-3">
                    Connect your Klaviyo account to automatically sync visitors and audiences to your Klaviyo lists.
                  </p>

                  {/* Step-by-step guide */}
                  <div className="mb-4 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                    <h4 className="mb-3">How to get your Klaviyo API Key</h4>
                    <ol className="mb-0" style={{ paddingLeft: '1.25rem' }}>
                      <li className="mb-2">Log in to your <strong>Klaviyo</strong> account</li>
                      <li className="mb-2">Click on <strong>Settings</strong> (gear icon) in the bottom-left corner</li>
                      <li className="mb-2">Go to <strong>Account &rarr; Settings &rarr; API Keys</strong></li>
                      <li className="mb-2">Click <strong>Create Private API Key</strong></li>
                      <li className="mb-2">Set the key name (e.g. &quot;Traffic AI&quot;)</li>
                      <li className="mb-2">
                        Under <em>Select Access Level</em>, choose <strong>Custom Key</strong> and set the following scopes to <strong>Full Access</strong>:
                        <ul className="mt-1 mb-0">
                          <li><strong>List</strong> &mdash; to read, create, and manage lists</li>
                          <li><strong>Profiles</strong> &mdash; to create and update contact profiles</li>
                        </ul>
                        <div className="text-muted small mt-1">All other scopes can remain &quot;No Access&quot; or &quot;Read Access&quot;.</div>
                      </li>
                      <li className="mb-2">Click <strong>Create</strong> and copy the key (starts with <code>pk_</code>)</li>
                      <li>Paste the key below and click <strong>Connect</strong></li>
                    </ol>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Klaviyo Private API Key</label>
                    <div className="input-group">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        className="form-control"
                        placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        disabled={connecting}
                      />
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                      </button>
                    </div>
                    <div className="form-hint mt-1">
                      Must be a <strong>Private API Key</strong> with Full Access on <strong>List</strong> and <strong>Profiles</strong> scopes. Public API keys will not work.
                    </div>
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleConnect}
                    disabled={!apiKey.trim() || connecting}
                  >
                    {connecting ? (
                      <>
                        <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <IconPlug size={16} className="me-1" />
                        Connect Klaviyo
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* Connected State */
                <div>
                  {/* Default List Selection */}
                  <div className="mb-4">
                    <label className="form-label fw-bold">Default Klaviyo List</label>
                    <p className="text-muted small mb-2">
                      Visitors and audiences will be synced to this list by default. You can override per-sync.
                    </p>
                    <div className="d-flex gap-2 align-items-start">
                      <select
                        className="form-select"
                        style={{ maxWidth: 400 }}
                        value={integration.default_list_id || ''}
                        onChange={(e) => {
                          const list = lists.find(l => l.id === e.target.value);
                          handleSaveSettings({
                            default_list_id: e.target.value || null,
                            default_list_name: list?.name || null,
                          } as Partial<KlaviyoIntegration>);
                        }}
                        disabled={savingSettings || listsLoading}
                      >
                        <option value="">Select a list...</option>
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>{list.name}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-outline-secondary btn-icon"
                        onClick={fetchLists}
                        disabled={listsLoading}
                        title="Refresh lists"
                      >
                        <IconRefresh size={16} className={listsLoading ? 'spinning' : ''} />
                      </button>
                      <button
                        className="btn btn-outline-primary"
                        onClick={() => setShowCreateList(true)}
                        title="Create new list"
                      >
                        <IconPlus size={16} className="me-1" />
                        New List
                      </button>
                    </div>

                    {showCreateList && (
                      <div className="mt-2 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                        <div className="d-flex gap-2">
                          <input
                            type="text"
                            className="form-control"
                            placeholder="New list name"
                            value={newListName}
                            onChange={(e) => setNewListName(e.target.value)}
                            disabled={creatingList}
                            onKeyDown={(e) => e.key === 'Enter' && handleCreateList()}
                            autoFocus
                          />
                          <button
                            className="btn btn-primary"
                            onClick={handleCreateList}
                            disabled={!newListName.trim() || creatingList}
                          >
                            {creatingList ? <IconLoader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Create'}
                          </button>
                          <button
                            className="btn btn-outline-secondary"
                            onClick={() => { setShowCreateList(false); setNewListName(''); }}
                          >
                            <IconX size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Auto-sync Visitors */}
                  <div className="mb-4">
                    <div className="d-flex align-items-center mb-2">
                      <label className="form-label fw-bold mb-0 me-3">Auto-Sync Visitors</label>
                      <label className="form-check form-switch mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          checked={integration.auto_sync_visitors || false}
                          onChange={(e) => handleSaveSettings({ auto_sync_visitors: e.target.checked } as Partial<KlaviyoIntegration>)}
                          disabled={savingSettings}
                        />
                      </label>
                    </div>
                    <p className="text-muted small mb-2">
                      When enabled, new identified visitors from your pixel will be automatically added to your default Klaviyo list.
                    </p>
                    {integration.auto_sync_visitors && (
                      <div>
                        <label className="form-label">Pixel to sync from</label>
                        <select
                          className="form-select"
                          style={{ maxWidth: 400 }}
                          value={integration.auto_sync_pixel_id || ''}
                          onChange={(e) => handleSaveSettings({ auto_sync_pixel_id: e.target.value || null } as Partial<KlaviyoIntegration>)}
                          disabled={savingSettings}
                        >
                          <option value="">All pixels</option>
                          {pixels.map((pixel) => (
                            <option key={pixel.id} value={pixel.id}>
                              {pixel.name || pixel.domain || pixel.id}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <hr className="my-3" />

                  {/* Manual Sync Visitors */}
                  <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <div>
                        <h4 className="mb-1">
                          <IconUsers size={18} className="me-2" />
                          Sync Visitors to Klaviyo
                        </h4>
                        <p className="text-muted small mb-0">
                          Push all identified visitors (with email) to a Klaviyo list.
                        </p>
                      </div>
                    </div>
                    <div className="d-flex gap-2 align-items-center">
                      <select
                        className="form-select"
                        style={{ maxWidth: 300 }}
                        value={selectedSyncList}
                        onChange={(e) => setSelectedSyncList(e.target.value)}
                        disabled={syncingVisitors}
                      >
                        <option value="">
                          {integration.default_list_name
                            ? `Default: ${integration.default_list_name}`
                            : 'Select a list...'}
                        </option>
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>{list.name}</option>
                        ))}
                      </select>
                      <button
                        className="btn btn-primary"
                        onClick={handleSyncVisitors}
                        disabled={syncingVisitors || (!selectedSyncList && !integration.default_list_id)}
                      >
                        {syncingVisitors ? (
                          <>
                            <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                            Syncing...
                          </>
                        ) : (
                          <>
                            <IconSend size={16} className="me-1" />
                            Sync Now
                          </>
                        )}
                      </button>
                    </div>
                    {integration.last_synced_at && (
                      <div className="text-muted small mt-2">
                        Last synced: {new Date(integration.last_synced_at).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <hr className="my-3" />

                  {/* Audience Export */}
                  <div>
                    <h4 className="mb-2">
                      <IconClick size={18} className="me-2" />
                      Export Audiences to Klaviyo
                    </h4>
                    <p className="text-muted small mb-3">
                      Send audience contacts to a Klaviyo list for email campaigns or sequences.
                    </p>

                    {audiencesLoading ? (
                      <div className="d-flex align-items-center text-muted">
                        <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                        Loading audiences...
                      </div>
                    ) : audiences.length === 0 ? (
                      <div className="text-muted">No audiences found. Create an audience first.</div>
                    ) : (
                      <div className="list-group">
                        {audiences.map((audience) => (
                          <div key={audience.id} className="list-group-item">
                            <div className="d-flex justify-content-between align-items-center">
                              <div>
                                <div className="fw-medium">{audience.name}</div>
                                {audience.contact_count !== undefined && (
                                  <div className="text-muted small">{audience.contact_count.toLocaleString()} contacts</div>
                                )}
                              </div>
                              <div className="d-flex gap-2 align-items-center">
                                <select
                                  className="form-select form-select-sm"
                                  style={{ maxWidth: 200 }}
                                  value={selectedAudienceList[audience.id] || ''}
                                  onChange={(e) => setSelectedAudienceList(prev => ({ ...prev, [audience.id]: e.target.value }))}
                                  disabled={syncingAudience === audience.id}
                                >
                                  <option value="">
                                    {integration.default_list_name
                                      ? `Default: ${integration.default_list_name}`
                                      : 'Select list...'}
                                  </option>
                                  {lists.map((list) => (
                                    <option key={list.id} value={list.id}>{list.name}</option>
                                  ))}
                                </select>
                                <button
                                  className="btn btn-sm btn-primary"
                                  onClick={() => handleSyncAudience(audience.id)}
                                  disabled={syncingAudience === audience.id || (!selectedAudienceList[audience.id] && !integration.default_list_id)}
                                >
                                  {syncingAudience === audience.id ? (
                                    <IconLoader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                  ) : (
                                    <>
                                      <IconArrowRight size={14} className="me-1" />
                                      Export
                                    </>
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <hr className="my-3" />

                  {/* Disconnect */}
                  <div className="d-flex justify-content-end">
                    <button
                      className="btn btn-outline-danger btn-sm"
                      onClick={handleDisconnect}
                      disabled={disconnecting}
                    >
                      {disconnecting ? (
                        <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <IconTrash size={14} className="me-1" />
                      )}
                      Disconnect Klaviyo
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="col-lg-4">
          {/* Klaviyo Lists */}
          {integration?.is_connected && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <IconList size={18} className="me-2" />
                  Your Klaviyo Lists
                </h3>
                <div className="card-actions">
                  <button className="btn btn-ghost-primary btn-sm p-1" onClick={fetchLists} disabled={listsLoading}>
                    <IconRefresh size={14} />
                  </button>
                </div>
              </div>
              <div className="card-body p-0">
                {listsLoading ? (
                  <div className="p-3 text-center">
                    <IconLoader2 size={20} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                ) : lists.length === 0 ? (
                  <div className="p-3 text-muted text-center">No lists found</div>
                ) : (
                  <div className="list-group list-group-flush" style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {lists.map((list) => (
                      <div key={list.id} className="list-group-item py-2">
                        <div className="d-flex justify-content-between align-items-center">
                          <div>
                            <div className="fw-medium small">{list.name}</div>
                          </div>
                          {integration.default_list_id === list.id && (
                            <span className="badge bg-green-lt" style={{ fontSize: '0.7rem' }}>Default</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">How it works</h3>
            </div>
            <div className="card-body">
              <div className="space-y-3">
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">1</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Connect your Klaviyo account</div>
                    <div className="text-muted small">Create a Custom Key with List & Profiles access</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">2</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Select a default list</div>
                    <div className="text-muted small">Choose which Klaviyo list to sync contacts to</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">3</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Sync visitors & audiences</div>
                    <div className="text-muted small">Identified visitors and audience contacts are pushed to Klaviyo</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">4</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Create campaigns</div>
                    <div className="text-muted small">Use Klaviyo to send emails and SMS to your synced contacts</div>
                  </div>
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
        .spinning {
          animation: spin 1s linear infinite;
        }
        .space-y-3 > * + * {
          margin-top: 0.75rem;
        }
      `}</style>
    </Layout>
  );
}
