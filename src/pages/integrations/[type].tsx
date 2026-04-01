import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconPlug,
  IconCheck,
  IconLoader2,
  IconTrash,
  IconSend,
  IconEye,
  IconEyeOff,
  IconUsers,
  IconClick,
  IconArrowRight,
  IconArrowLeft,
  IconAlertCircle,
  IconCircleCheck,
  IconBell,
  IconWebhook,
  IconRefresh,
  IconPlus,
  IconX,
  IconList,
} from '@tabler/icons-react';
import Link from 'next/link';
import { INTEGRATION_CONFIGS } from '@/lib/integration-configs';
import type { IntegrationConfig } from '@/lib/integration-configs';

interface IntegrationData {
  id: string;
  platform: string;
  is_connected: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PlatformList {
  id: string;
  name: string;
  member_count?: number;
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
export default function IntegrationDetailPage() {
  const router = useRouter();
  const { type } = router.query;
  const { userProfile } = useAuth();

  const [config, setConfig] = useState<IntegrationConfig | null>(null);
  const [integration, setIntegration] = useState<IntegrationData | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth fields
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [secondaryField, setSecondaryField] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // Lists (for platforms that support them)
  const [lists, setLists] = useState<PlatformList[]>([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);

  // Audiences for export
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [audiencesLoading, setAudiencesLoading] = useState(false);

  // Sync state
  const [syncingVisitors, setSyncingVisitors] = useState(false);
  const [syncingAudience, setSyncingAudience] = useState<string | null>(null);
  const [selectedSyncList, setSelectedSyncList] = useState('');
  const [selectedAudienceList, setSelectedAudienceList] = useState<Record<string, string>>({});

  // Slack/Zapier specific
  const [sendingTest, setSendingTest] = useState(false);

  // Notification settings (Slack)
  const [notifyNewVisitors, setNotifyNewVisitors] = useState(true);
  const [notifyAudienceSync, setNotifyAudienceSync] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);

  // Toast
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  // Load integration config
  useEffect(() => {
    if (type && typeof type === 'string') {
      const cfg = INTEGRATION_CONFIGS[type];
      if (cfg && !['klaviyo', 'facebook', 'linkedin'].includes(cfg.key)) {
        setConfig(cfg);
      } else if (['klaviyo', 'facebook', 'linkedin'].includes(type)) {
        router.replace(`/integrations/${type}`);
      } else {
        router.replace('/integrations');
      }
    }
  }, [type, router]);

  const fetchIntegration = useCallback(async () => {
    if (!type) return;
    try {
      setLoading(true);
      const response = await fetch(`/api/integrations/${type}/status`);
      const data = await response.json();
      if (response.ok) {
        setIntegration(data.integration);
        if (data.integration?.config) {
          setNotifyNewVisitors(data.integration.config.notify_new_visitors !== false);
          setNotifyAudienceSync(data.integration.config.notify_audience_sync !== false);
        }
      }
    } catch (error) {
      console.error('Error fetching integration status:', error);
    } finally {
      setLoading(false);
    }
  }, [type]);

  const fetchLists = useCallback(async () => {
    if (!type || !config?.features.includes('lists')) return;
    try {
      setListsLoading(true);
      const response = await fetch(`/api/integrations/${type}/lists`);
      const data = await response.json();
      if (response.ok) {
        setLists(data.lists || []);
      }
    } catch (error) {
      console.error('Error fetching lists:', error);
    } finally {
      setListsLoading(false);
    }
  }, [type, config]);

  const fetchAudiences = useCallback(async () => {
    if (!config?.features.includes('sync_audiences')) return;
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
  }, [config]);

  useEffect(() => {
    if (config) fetchIntegration();
  }, [config, fetchIntegration]);

  useEffect(() => {
    if (integration?.is_connected && config) {
      if (config.features.includes('lists')) fetchLists();
      if (config.features.includes('sync_audiences')) fetchAudiences();
    }
  }, [integration?.is_connected, config, fetchLists, fetchAudiences]);

  const handleConnect = async () => {
    if (!config || !type) return;

    const authValue = config.authType === 'webhook_url' ? apiKey.trim() : apiKey.trim();
    if (!authValue) return;
    if (config.authType === 'api_key_and_url' && !secondaryField.trim()) return;

    setConnecting(true);
    try {
      const body: Record<string, string> = {};
      if (config.authType === 'webhook_url') {
        body.webhook_url = authValue;
      } else {
        body.api_key = authValue;
      }

      if (config.authType === 'api_key_and_url' && config.secondaryAuthLabel) {
        // Map secondary field based on platform
        if (type === 'salesforce') body.instance_url = secondaryField.trim();
        else if (type === 'shopify') body.shop_domain = secondaryField.trim();
        else if (type === 'activecampaign') body.api_url = secondaryField.trim();
      }

      const response = await fetch(`/api/integrations/${type}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect');
      }

      // Handle OAuth redirect (e.g., Google Sheets)
      if (data.redirect_url) {
        window.location.href = data.redirect_url;
        return;
      }

      setIntegration(data.integration);
      setApiKey('');
      setSecondaryField('');
      showToast(`${config.name} connected successfully!`, 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!config || !type) return;
    if (!confirm(`Are you sure you want to disconnect ${config.name}?`)) return;

    setDisconnecting(true);
    try {
      const response = await fetch(`/api/integrations/${type}/status`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to disconnect');

      setIntegration(null);
      setLists([]);
      showToast(`${config.name} disconnected`, 'info');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSyncVisitors = async () => {
    if (!type) return;
    setSyncingVisitors(true);
    try {
      const body: Record<string, string> = {};
      if (selectedSyncList) body.list_id = selectedSyncList;

      const response = await fetch(`/api/integrations/${type}/sync-visitors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to sync');

      // Open spreadsheet in new tab if URL returned (e.g., Google Sheets)
      if (data.spreadsheet_url) {
        window.open(data.spreadsheet_url, '_blank');
      }

      showToast(data.message || `${data.synced} visitors synced`, 'success');
      fetchIntegration();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSyncingVisitors(false);
    }
  };

  const handleSyncAudience = async (audienceId: string) => {
    if (!type) return;
    setSyncingAudience(audienceId);
    const listId = selectedAudienceList[audienceId];

    try {
      const body: Record<string, string> = { audience_id: audienceId };
      if (listId) body.list_id = listId;

      const audienceName = audiences.find((a) => a.id === audienceId)?.name || 'audience';
      const response = await fetch(`/api/integrations/${type}/sync-audience`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, audience_name: audienceName }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to sync audience');

      // Open spreadsheet in new tab if URL returned (e.g., Google Sheets)
      if (data.spreadsheet_url) {
        window.open(data.spreadsheet_url, '_blank');
      }

      showToast(data.message || `${data.synced} contacts synced`, 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSyncingAudience(null);
    }
  };

  const handleSendTest = async () => {
    if (!type) return;
    setSendingTest(true);
    try {
      const endpoint = type === 'slack' ? 'send-test' : 'test-webhook';
      const response = await fetch(`/api/integrations/${type}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send test');

      showToast(data.message || 'Test sent successfully', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!type) return;
    setSavingSettings(true);
    try {
      const newConfig = {
        ...(integration?.config || {}),
        notify_new_visitors: notifyNewVisitors,
        notify_audience_sync: notifyAudienceSync,
      };

      const response = await fetch(`/api/integrations/${type}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: newConfig }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');

      setIntegration(data.integration);
      showToast('Settings saved', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCreateList = async () => {
    if (!newListName.trim() || !type) return;
    setCreatingList(true);
    try {
      const response = await fetch(`/api/integrations/${type}/lists`, {
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

  if (!config || loading) {
    return (
      <Layout title="Integration" pageTitle="Loading...">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  const hasSync = config.features.includes('sync_visitors');
  const hasAudienceSync = config.features.includes('sync_audiences');
  const hasLists = config.features.includes('lists');
  const hasNotifications = config.features.includes('notifications');
  const hasWebhooks = config.features.includes('webhooks');

  return (
    <Layout title={`${config.name} Integration`} pageTitle={config.name} pagePretitle="Integrations">
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
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <div
                  className="me-3"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}cc 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: config.color === '#FFE01B' ? '#000' : '#fff', fontWeight: 700, fontSize: config.letterIcon.length > 1 ? 11 : 14 }}>
                    {config.letterIcon}
                  </span>
                </div>
                <div>
                  <h3 className="card-title mb-0">{config.name}</h3>
                  <div className="text-muted small">{config.description}</div>
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
                    Connect your {config.name} account to {
                      hasSync ? 'sync visitors and audiences' :
                      hasNotifications ? 'receive real-time notifications' :
                      hasWebhooks ? 'send events via webhooks' :
                      'get started'
                    }.
                  </p>

                  {/* Setup Steps */}
                  <div className="mb-4 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                    <h4 className="mb-3">How to connect {config.name}</h4>
                    <ol className="mb-0" style={{ paddingLeft: '1.25rem' }}>
                      {config.setupSteps.map((step, i) => (
                        <li key={i} className="mb-2">{step}</li>
                      ))}
                    </ol>
                  </div>

                  {/* Primary Auth Field */}
                  <div className="mb-3">
                    <label className="form-label fw-bold">{config.authLabel}</label>
                    <div className="input-group">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        className="form-control"
                        placeholder={config.authPlaceholder}
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
                    <div className="form-hint mt-1">{config.authHint}</div>
                  </div>

                  {/* Secondary Auth Field (for Salesforce, Shopify, ActiveCampaign) */}
                  {config.authType === 'api_key_and_url' && config.secondaryAuthLabel && (
                    <div className="mb-3">
                      <label className="form-label fw-bold">{config.secondaryAuthLabel}</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder={config.secondaryAuthPlaceholder}
                        value={secondaryField}
                        onChange={(e) => setSecondaryField(e.target.value)}
                        disabled={connecting}
                      />
                      <div className="form-hint mt-1">{config.secondaryAuthHint}</div>
                    </div>
                  )}

                  <button
                    className="btn btn-primary"
                    onClick={handleConnect}
                    disabled={!apiKey.trim() || (config.authType === 'api_key_and_url' && !secondaryField.trim()) || connecting}
                  >
                    {connecting ? (
                      <>
                        <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <IconPlug size={16} className="me-1" />
                        Connect {config.name}
                      </>
                    )}
                  </button>
                </div>
              ) : (
                /* Connected State */
                <div>
                  {/* Notifications Settings (Slack) */}
                  {hasNotifications && (
                    <div className="mb-4">
                      <h4 className="mb-3">
                        <IconBell size={18} className="me-2" />
                        Notification Settings
                      </h4>
                      <div className="mb-2">
                        <label className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={notifyNewVisitors}
                            onChange={(e) => setNotifyNewVisitors(e.target.checked)}
                          />
                          <span className="form-check-label">Notify when new visitors are identified</span>
                        </label>
                      </div>
                      <div className="mb-3">
                        <label className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            checked={notifyAudienceSync}
                            onChange={(e) => setNotifyAudienceSync(e.target.checked)}
                          />
                          <span className="form-check-label">Notify when audience sync completes</span>
                        </label>
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleSaveSettings}
                          disabled={savingSettings}
                        >
                          {savingSettings ? (
                            <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                          ) : null}
                          Save Settings
                        </button>
                        <button
                          className="btn btn-outline-secondary btn-sm"
                          onClick={handleSendTest}
                          disabled={sendingTest}
                        >
                          {sendingTest ? (
                            <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                          ) : (
                            <IconSend size={14} className="me-1" />
                          )}
                          Send Test Notification
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Webhook Settings (Zapier) */}
                  {hasWebhooks && (
                    <div className="mb-4">
                      <h4 className="mb-3">
                        <IconWebhook size={18} className="me-2" />
                        Webhook Settings
                      </h4>
                      <p className="text-muted small mb-3">
                        Traffic AI will send events to your Zapier webhook when visitors are identified or audiences are synced.
                      </p>
                      <button
                        className="btn btn-outline-primary btn-sm"
                        onClick={handleSendTest}
                        disabled={sendingTest}
                      >
                        {sendingTest ? (
                          <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        ) : (
                          <IconSend size={14} className="me-1" />
                        )}
                        Send Test Event
                      </button>
                    </div>
                  )}

                  {/* Lists Section */}
                  {hasLists && (
                    <div className="mb-4">
                      <div className="d-flex align-items-center gap-2 mb-2">
                        <label className="form-label fw-bold mb-0">Default List</label>
                        <button
                          className="btn btn-outline-secondary btn-icon btn-sm"
                          onClick={fetchLists}
                          disabled={listsLoading}
                          title="Refresh lists"
                        >
                          <IconRefresh size={14} className={listsLoading ? 'spinning' : ''} />
                        </button>
                        <button
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => setShowCreateList(true)}
                        >
                          <IconPlus size={14} className="me-1" />
                          New List
                        </button>
                      </div>
                      <p className="text-muted small mb-2">
                        Select the default list for syncing visitors and audiences.
                      </p>
                      <select
                        className="form-select"
                        style={{ maxWidth: 400 }}
                        value={(integration.config?.default_list_id as string) || ''}
                        onChange={(e) => {
                          const newConfig = {
                            ...(integration.config || {}),
                            default_list_id: e.target.value || null,
                            default_list_name: lists.find(l => l.id === e.target.value)?.name || null,
                          };
                          setSavingSettings(true);
                          fetch(`/api/integrations/${type}/status`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ config: newConfig }),
                          })
                            .then(r => r.json())
                            .then(data => {
                              setIntegration(data.integration);
                              showToast('Default list updated', 'success');
                            })
                            .catch(() => showToast('Failed to update list', 'error'))
                            .finally(() => setSavingSettings(false));
                        }}
                        disabled={savingSettings || listsLoading}
                      >
                        <option value="">Select a list...</option>
                        {lists.map((list) => (
                          <option key={list.id} value={list.id}>
                            {list.name} {list.member_count !== undefined ? `(${list.member_count})` : ''}
                          </option>
                        ))}
                      </select>

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
                  )}

                  {(hasNotifications || hasWebhooks) && (hasSync || hasAudienceSync) && <hr className="my-3" />}

                  {/* Sync Visitors */}
                  {hasSync && (
                    <>
                      <div className="mb-4">
                        <h4 className="mb-1">
                          <IconUsers size={18} className="me-2" />
                          Sync Visitors to {config.name}
                        </h4>
                        <p className="text-muted small mb-2">
                          Push all identified visitors (with email) to {config.name}.
                        </p>
                        <div className="d-flex gap-2 align-items-center">
                          {hasLists && (
                            <select
                              className="form-select"
                              style={{ maxWidth: 300 }}
                              value={selectedSyncList}
                              onChange={(e) => setSelectedSyncList(e.target.value)}
                              disabled={syncingVisitors}
                            >
                              <option value="">
                                {(integration.config?.default_list_name as string)
                                  ? `Default: ${integration.config.default_list_name}`
                                  : 'Select a list...'}
                              </option>
                              {lists.map((list) => (
                                <option key={list.id} value={list.id}>{list.name}</option>
                              ))}
                            </select>
                          )}
                          <button
                            className="btn btn-primary"
                            onClick={handleSyncVisitors}
                            disabled={syncingVisitors}
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

                      {hasAudienceSync && <hr className="my-3" />}
                    </>
                  )}

                  {/* Audience Export */}
                  {hasAudienceSync && (
                    <div className="mb-4">
                      <h4 className="mb-2">
                        <IconClick size={18} className="me-2" />
                        Export Audiences to {config.name}
                      </h4>
                      <p className="text-muted small mb-3">
                        Send audience contacts to {config.name}.
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
                                  {hasLists && (
                                    <select
                                      className="form-select form-select-sm"
                                      style={{ maxWidth: 200 }}
                                      value={selectedAudienceList[audience.id] || ''}
                                      onChange={(e) => setSelectedAudienceList(prev => ({ ...prev, [audience.id]: e.target.value }))}
                                      disabled={syncingAudience === audience.id}
                                    >
                                      <option value="">
                                        {(integration.config?.default_list_name as string)
                                          ? `Default: ${integration.config.default_list_name}`
                                          : 'Select list...'}
                                      </option>
                                      {lists.map((list) => (
                                        <option key={list.id} value={list.id}>{list.name}</option>
                                      ))}
                                    </select>
                                  )}
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => handleSyncAudience(audience.id)}
                                    disabled={syncingAudience === audience.id}
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
                  )}

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
                      Disconnect {config.name}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="col-lg-4">
          {/* Lists sidebar */}
          {integration?.is_connected && hasLists && lists.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <IconList size={18} className="me-2" />
                  Your {config.name} Lists
                </h3>
                <div className="card-actions">
                  <button className="btn btn-ghost-primary btn-sm p-1" onClick={fetchLists} disabled={listsLoading}>
                    <IconRefresh size={14} />
                  </button>
                </div>
              </div>
              <div className="card-body p-0">
                <div className="list-group list-group-flush" style={{ maxHeight: 300, overflowY: 'auto' }}>
                  {lists.map((list) => (
                    <div key={list.id} className="list-group-item py-2">
                      <div className="d-flex justify-content-between align-items-center">
                        <div className="fw-medium small">{list.name}</div>
                        {(integration.config?.default_list_id as string) === list.id && (
                          <span className="badge bg-green-lt" style={{ fontSize: '0.7rem' }}>Default</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
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
                    <div className="fw-medium small">Connect {config.name}</div>
                    <div className="text-muted small">Enter your {config.authLabel.toLowerCase()} to get started</div>
                  </div>
                </div>
                {hasSync && (
                  <div className="d-flex gap-3">
                    <div className="flex-shrink-0">
                      <span className="avatar avatar-sm bg-primary-lt">2</span>
                    </div>
                    <div>
                      <div className="fw-medium small">Sync visitors</div>
                      <div className="text-muted small">Push identified visitors from Traffic AI to {config.name}</div>
                    </div>
                  </div>
                )}
                {hasAudienceSync && (
                  <div className="d-flex gap-3">
                    <div className="flex-shrink-0">
                      <span className="avatar avatar-sm bg-primary-lt">{hasSync ? '3' : '2'}</span>
                    </div>
                    <div>
                      <div className="fw-medium small">Export audiences</div>
                      <div className="text-muted small">Send audience contacts for campaigns and outreach</div>
                    </div>
                  </div>
                )}
                {hasNotifications && (
                  <div className="d-flex gap-3">
                    <div className="flex-shrink-0">
                      <span className="avatar avatar-sm bg-primary-lt">2</span>
                    </div>
                    <div>
                      <div className="fw-medium small">Receive notifications</div>
                      <div className="text-muted small">Get alerts when new visitors are identified</div>
                    </div>
                  </div>
                )}
                {hasWebhooks && (
                  <div className="d-flex gap-3">
                    <div className="flex-shrink-0">
                      <span className="avatar avatar-sm bg-primary-lt">2</span>
                    </div>
                    <div>
                      <div className="fw-medium small">Automate workflows</div>
                      <div className="text-muted small">Events trigger your Zapier automations</div>
                    </div>
                  </div>
                )}
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
