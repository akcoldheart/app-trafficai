import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import {
  IconArrowLeft,
  IconLoader2,
  IconCheck,
  IconAlertCircle,
  IconCircleCheck,
  IconTrash,
  IconUpload,
  IconUsers,
  IconEye,
  IconEyeOff,
  IconChartBar,
} from '@tabler/icons-react';
import Link from 'next/link';

interface Integration {
  id: string;
  is_connected: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
}

interface TokenInfo {
  customer_id: string | null;
  customer_name: string | null;
  token_expires_at: string | null;
  token_expired?: boolean;
}

interface Account {
  customerId: string;
  descriptiveName: string;
}

interface ImportRecord {
  id: string;
  user_list_id: string | null;
  user_list_name: string;
  contact_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface ConversionRecord {
  id: string;
  conversion_action_name: string;
  conversion_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

interface SourceOption {
  id: string;
  name: string;
  type: 'pixel' | 'audience';
  count?: number;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function GoogleAdsIntegrationPage() {
  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [conversions, setConversions] = useState<ConversionRecord[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'match' | 'conversions'>('match');

  // Customer Match form
  const [selectedSource, setSelectedSource] = useState('');
  const [listName, setListName] = useState('');
  const [importing, setImporting] = useState(false);

  // Conversions form
  const [conversionSource, setConversionSource] = useState('');
  const [conversionActionId, setConversionActionId] = useState('');
  const [conversionActionName, setConversionActionName] = useState('');
  const [uploading, setUploading] = useState(false);

  // Connection form
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [developerToken, setDeveloperToken] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch('/api/integrations/google_ads/status');
      const data = await resp.json();
      if (resp.ok) {
        setIntegration(data.integration || null);
        setTokenInfo(data.token_info || null);
        setImports(data.imports || []);
        setConversions(data.conversions || []);
        if (data.token_info?.customer_id) {
          setSelectedAccount(data.token_info.customer_id);
        }
      }
    } catch (error) {
      console.error('Error fetching Google Ads status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const resp = await fetch('/api/integrations/google_ads/accounts');
      const data = await resp.json();
      if (resp.ok) {
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error('Error fetching accounts:', error);
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    setSourcesLoading(true);
    const allSources: SourceOption[] = [];

    try {
      const pixelResp = await fetch('/api/pixels');
      const pixelData = await pixelResp.json();
      if (pixelResp.ok && pixelData.pixels) {
        for (const p of pixelData.pixels) {
          allSources.push({
            id: `pixel:${p.id}`,
            name: `Pixel: ${p.name || p.domain}`,
            type: 'pixel',
          });
        }
      }
    } catch (e) {
      console.error('Error fetching pixels:', e);
    }

    try {
      const audResp = await fetch('/api/audience-requests?status=approved&has_manual=true');
      const audData = await audResp.json();
      if (audResp.ok && audData.requests) {
        for (const req of audData.requests) {
          const formData = req.form_data as Record<string, unknown> | undefined;
          if (!formData?.manual_audience) continue;
          const manual = formData.manual_audience as Record<string, unknown>;
          allSources.push({
            id: `audience:${req.audience_id || (manual.id as string) || req.id}`,
            name: `Audience: ${req.name}`,
            type: 'audience',
            count: (manual.total_records as number) || 0,
          });
        }
      }
    } catch (e) {
      console.error('Error fetching audiences:', e);
    }

    try {
      const apiResp = await fetch('/api/audiences');
      const apiData = await apiResp.json();
      if (apiResp.ok && apiData.Data) {
        for (const a of apiData.Data) {
          const id = a.id || a.audienceId;
          if (!allSources.find(s => s.id === `audience:${id}`)) {
            allSources.push({
              id: `audience:${id}`,
              name: `Audience: ${a.name}`,
              type: 'audience',
              count: a.total_records,
            });
          }
        }
      }
    } catch (e) {
      console.error('Error fetching API audiences:', e);
    }

    setSources(allSources);
    setSourcesLoading(false);
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (integration?.is_connected) {
      fetchAccounts();
      fetchSources();
    }
  }, [integration?.is_connected, fetchAccounts, fetchSources]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      showToast('Google Ads connected successfully!', 'success');
      window.history.replaceState({}, '', '/integrations/google_ads');
      fetchStatus();
    } else if (params.get('error')) {
      showToast(`Google Ads connection failed: ${params.get('error')}`, 'error');
      window.history.replaceState({}, '', '/integrations/google_ads');
    }
  }, []);

  const handleAccountSelect = async (custId: string) => {
    setSelectedAccount(custId);
    const acc = accounts.find(a => a.customerId === custId);
    try {
      await fetch('/api/integrations/google_ads/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: custId, customer_name: acc?.descriptiveName }),
      });
    } catch (e) {
      console.error('Error saving account selection:', e);
    }
  };

  const handleImport = async () => {
    if (!selectedAccount || !selectedSource || !listName.trim()) return;
    const [sourceType, sourceId] = selectedSource.split(':');
    setImporting(true);

    try {
      const body: Record<string, string> = { list_name: listName.trim() };
      if (sourceType === 'pixel') body.source_pixel_id = sourceId;
      else body.source_audience_id = sourceId;

      const resp = await fetch('/api/integrations/google_ads/import-audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Import failed');

      showToast(data.message || 'Audience imported successfully', 'success');
      setListName('');
      setSelectedSource('');
      fetchStatus();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleUploadConversions = async () => {
    if (!selectedAccount || !conversionSource || !conversionActionId || !conversionActionName) return;
    const [sourceType, sourceId] = conversionSource.split(':');
    setUploading(true);

    try {
      const body: Record<string, string> = {
        conversion_action_id: conversionActionId,
        conversion_action_name: conversionActionName,
      };
      if (sourceType === 'pixel') body.source_pixel_id = sourceId;
      else body.source_audience_id = sourceId;

      const resp = await fetch('/api/integrations/google_ads/upload-conversions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Upload failed');

      showToast(data.message || 'Conversions uploaded', 'success');
      setConversionActionId('');
      setConversionActionName('');
      setConversionSource('');
      fetchStatus();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Google Ads?')) return;
    setDisconnecting(true);
    try {
      const resp = await fetch('/api/integrations/google_ads/status', { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to disconnect');
      setIntegration(null);
      setTokenInfo(null);
      setImports([]);
      setConversions([]);
      setAccounts([]);
      showToast('Google Ads disconnected', 'info');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Google Ads Integration" pageTitle="Loading...">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  const brandColor = '#4285F4';

  return (
    <Layout title="Google Ads Integration" pageTitle="Google Ads" pagePretitle="Integrations">
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
                    width: 40, height: 40, borderRadius: 8,
                    background: `linear-gradient(135deg, ${brandColor} 0%, ${brandColor}cc 100%)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>G</span>
                </div>
                <div>
                  <h3 className="card-title mb-0">Google Ads</h3>
                  <div className="text-muted small">Customer Match & offline conversions</div>
                </div>
              </div>
              <div className="card-actions">
                {integration?.is_connected ? (
                  <span className="badge bg-green-lt">
                    <IconCheck size={14} className="me-1" />Connected
                  </span>
                ) : (
                  <span className="badge bg-secondary-lt">Not connected</span>
                )}
              </div>
            </div>

            <div className="card-body">
              {!integration?.is_connected ? (
                <div>
                  <p className="text-muted mb-3">
                    Connect your Google Ads account to create Customer Match audiences and upload offline conversions.
                  </p>

                  <div className="mb-4 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                    <h4 className="mb-3">How to get your Google Ads API credentials</h4>
                    <ol className="mb-0" style={{ paddingLeft: '1.25rem' }}>
                      <li className="mb-2">Go to <strong>console.cloud.google.com</strong> and create or select a project</li>
                      <li className="mb-2">Enable the <strong>Google Ads API</strong> in APIs & Services</li>
                      <li className="mb-2">Go to <strong>Credentials</strong> and create OAuth 2.0 Client ID (Web application)</li>
                      <li className="mb-2">Add <strong>https://app.trafficai.io/api/integrations/google_ads/callback</strong> as redirect URI</li>
                      <li className="mb-2">Copy the <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                      <li className="mb-2">Get your <strong>Developer Token</strong> from your Google Ads MCC account under API Center</li>
                    </ol>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Google Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      style={{ maxWidth: 400 }}
                      placeholder="xxxxx.apps.googleusercontent.com"
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      disabled={connecting}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Client Secret</label>
                    <div className="input-group" style={{ maxWidth: 400 }}>
                      <input
                        type={showSecret ? 'text' : 'password'}
                        className="form-control"
                        placeholder="GOCSPX-xxxxxxxxxxxxxxxx"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        disabled={connecting}
                      />
                      <button className="btn btn-outline-secondary" type="button" onClick={() => setShowSecret(!showSecret)}>
                        {showSecret ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Developer Token</label>
                    <input
                      type="text"
                      className="form-control"
                      style={{ maxWidth: 400 }}
                      placeholder="xxxxxxxxxxxxxxxx"
                      value={developerToken}
                      onChange={(e) => setDeveloperToken(e.target.value)}
                      disabled={connecting}
                    />
                    <div className="form-hint mt-1">Found in your Google Ads MCC account under Tools & Settings &rarr; API Center</div>
                  </div>

                  <button
                    className="btn"
                    style={{ backgroundColor: brandColor, color: '#fff', border: 'none' }}
                    disabled={!clientId.trim() || !clientSecret.trim() || !developerToken.trim() || connecting}
                    onClick={async () => {
                      setConnecting(true);
                      try {
                        const resp = await fetch('/api/integrations/google_ads/connect', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            client_id: clientId.trim(),
                            client_secret: clientSecret.trim(),
                            developer_token: developerToken.trim(),
                          }),
                        });
                        const data = await resp.json();
                        if (!resp.ok) throw new Error(data.error || 'Failed to save credentials');
                        if (data.auth_url) {
                          window.location.href = data.auth_url;
                        }
                      } catch (error) {
                        showToast((error as Error).message, 'error');
                        setConnecting(false);
                      }
                    }}
                  >
                    {connecting ? (
                      <>
                        <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Connecting...
                      </>
                    ) : (
                      'Connect with Google'
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  {tokenInfo?.token_expired && (
                    <div className="alert alert-danger mb-4">
                      <div className="d-flex align-items-center">
                        <IconAlertCircle size={18} className="me-2" />
                        <div>
                          <strong>Google token has expired.</strong> Please disconnect and reconnect your account.
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Account Selector */}
                  <div className="mb-4">
                    <h4 className="mb-2">Google Ads Account</h4>
                    {accountsLoading ? (
                      <div className="d-flex align-items-center text-muted">
                        <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                        Loading accounts...
                      </div>
                    ) : (
                      <select
                        className="form-select"
                        style={{ maxWidth: 400 }}
                        value={selectedAccount}
                        onChange={(e) => handleAccountSelect(e.target.value)}
                      >
                        <option value="">Select an account...</option>
                        {accounts.map((acc) => (
                          <option key={acc.customerId} value={acc.customerId}>
                            {acc.descriptiveName} ({acc.customerId})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <hr className="my-3" />

                  {/* Tabs */}
                  <ul className="nav nav-tabs mb-4">
                    <li className="nav-item">
                      <button
                        className={`nav-link ${activeTab === 'match' ? 'active' : ''}`}
                        onClick={() => setActiveTab('match')}
                      >
                        <IconUsers size={16} className="me-1" />
                        Customer Match
                      </button>
                    </li>
                    <li className="nav-item">
                      <button
                        className={`nav-link ${activeTab === 'conversions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('conversions')}
                      >
                        <IconChartBar size={16} className="me-1" />
                        Offline Conversions
                      </button>
                    </li>
                  </ul>

                  {activeTab === 'match' && (
                    <div>
                      <h4 className="mb-2">
                        <IconUpload size={18} className="me-2" />
                        Import Customer Match Audience
                      </h4>
                      <p className="text-muted small mb-3">
                        Create a Customer Match user list from your Traffic AI data. Emails and phone numbers are SHA256-hashed before upload.
                      </p>

                      <div className="mb-3">
                        <label className="form-label fw-bold">Source</label>
                        {sourcesLoading ? (
                          <div className="d-flex align-items-center text-muted">
                            <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                            Loading sources...
                          </div>
                        ) : (
                          <select
                            className="form-select"
                            style={{ maxWidth: 400 }}
                            value={selectedSource}
                            onChange={(e) => setSelectedSource(e.target.value)}
                          >
                            <option value="">Select a pixel or audience...</option>
                            {sources.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}{s.count ? ` (${s.count.toLocaleString()} contacts)` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="mb-3">
                        <label className="form-label fw-bold">List Name</label>
                        <input
                          type="text"
                          className="form-control"
                          style={{ maxWidth: 400 }}
                          placeholder="e.g. Website Visitors Q1 2026"
                          value={listName}
                          onChange={(e) => setListName(e.target.value)}
                          disabled={importing}
                        />
                      </div>

                      <button
                        className="btn btn-primary"
                        onClick={handleImport}
                        disabled={!selectedAccount || !selectedSource || !listName.trim() || importing}
                      >
                        {importing ? (
                          <>
                            <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                            Importing...
                          </>
                        ) : (
                          <>
                            <IconUpload size={16} className="me-1" />
                            Import to Google Ads
                          </>
                        )}
                      </button>

                      {imports.length > 0 && (
                        <>
                          <hr className="my-3" />
                          <h4 className="mb-2">Import History</h4>
                          <div className="table-responsive">
                            <table className="table table-vcenter">
                              <thead>
                                <tr>
                                  <th>List Name</th>
                                  <th>Contacts</th>
                                  <th>Status</th>
                                  <th>Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {imports.map((imp) => (
                                  <tr key={imp.id}>
                                    <td>{imp.user_list_name}</td>
                                    <td>{imp.contact_count.toLocaleString()}</td>
                                    <td>
                                      <span className={`badge ${
                                        imp.status === 'completed' ? 'bg-green-lt' :
                                        imp.status === 'processing' ? 'bg-blue-lt' :
                                        imp.status === 'failed' ? 'bg-red-lt' :
                                        'bg-secondary-lt'
                                      }`}>
                                        {imp.status}
                                      </span>
                                      {imp.error_message && (
                                        <div className="text-danger small mt-1">{imp.error_message}</div>
                                      )}
                                    </td>
                                    <td className="text-muted small">
                                      {new Date(imp.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {activeTab === 'conversions' && (
                    <div>
                      <h4 className="mb-2">
                        <IconChartBar size={18} className="me-2" />
                        Upload Offline Conversions
                      </h4>
                      <p className="text-muted small mb-3">
                        Upload visitor data as offline conversion events for attribution tracking in Google Ads.
                      </p>

                      <div className="mb-3">
                        <label className="form-label fw-bold">Source</label>
                        {sourcesLoading ? (
                          <div className="d-flex align-items-center text-muted">
                            <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                            Loading sources...
                          </div>
                        ) : (
                          <select
                            className="form-select"
                            style={{ maxWidth: 400 }}
                            value={conversionSource}
                            onChange={(e) => setConversionSource(e.target.value)}
                          >
                            <option value="">Select a pixel or audience...</option>
                            {sources.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}{s.count ? ` (${s.count.toLocaleString()} contacts)` : ''}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="mb-3">
                        <label className="form-label fw-bold">Conversion Action ID</label>
                        <input
                          type="text"
                          className="form-control"
                          style={{ maxWidth: 400 }}
                          placeholder="123456789"
                          value={conversionActionId}
                          onChange={(e) => setConversionActionId(e.target.value)}
                          disabled={uploading}
                        />
                        <div className="form-hint mt-1">Found in Google Ads under Tools &rarr; Conversions &rarr; select action &rarr; check URL for action ID</div>
                      </div>

                      <div className="mb-3">
                        <label className="form-label fw-bold">Conversion Action Name</label>
                        <input
                          type="text"
                          className="form-control"
                          style={{ maxWidth: 400 }}
                          placeholder="e.g. Website Visit"
                          value={conversionActionName}
                          onChange={(e) => setConversionActionName(e.target.value)}
                          disabled={uploading}
                        />
                      </div>

                      <button
                        className="btn btn-primary"
                        onClick={handleUploadConversions}
                        disabled={!selectedAccount || !conversionSource || !conversionActionId || !conversionActionName || uploading}
                      >
                        {uploading ? (
                          <>
                            <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <IconUpload size={16} className="me-1" />
                            Upload Conversions
                          </>
                        )}
                      </button>

                      {conversions.length > 0 && (
                        <>
                          <hr className="my-3" />
                          <h4 className="mb-2">Upload History</h4>
                          <div className="table-responsive">
                            <table className="table table-vcenter">
                              <thead>
                                <tr>
                                  <th>Conversion Action</th>
                                  <th>Count</th>
                                  <th>Status</th>
                                  <th>Date</th>
                                </tr>
                              </thead>
                              <tbody>
                                {conversions.map((c) => (
                                  <tr key={c.id}>
                                    <td>{c.conversion_action_name}</td>
                                    <td>{c.conversion_count.toLocaleString()}</td>
                                    <td>
                                      <span className={`badge ${
                                        c.status === 'completed' ? 'bg-green-lt' :
                                        c.status === 'processing' ? 'bg-blue-lt' :
                                        c.status === 'failed' ? 'bg-red-lt' :
                                        'bg-secondary-lt'
                                      }`}>
                                        {c.status}
                                      </span>
                                      {c.error_message && (
                                        <div className="text-danger small mt-1">{c.error_message}</div>
                                      )}
                                    </td>
                                    <td className="text-muted small">
                                      {new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <hr className="my-3" />

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
                      Disconnect Google Ads
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="col-lg-4">
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
                    <div className="fw-medium small">Enter API Credentials</div>
                    <div className="text-muted small">Add Client ID, Secret, and Developer Token</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">2</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Authorize via Google</div>
                    <div className="text-muted small">Sign in and grant Google Ads API access</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">3</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Select Account</div>
                    <div className="text-muted small">Choose which Google Ads account to use</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">4</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Import & Upload</div>
                    <div className="text-muted small">Create Customer Match lists or upload conversions</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {tokenInfo?.customer_name && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Connected Account</h3>
              </div>
              <div className="card-body">
                <div className="mb-2">
                  <div className="text-muted small">Google Ads Account</div>
                  <div className="fw-medium">{tokenInfo.customer_name}</div>
                </div>
                {tokenInfo.token_expires_at && (
                  <div>
                    <div className="text-muted small">Token Expires</div>
                    <div className="fw-medium small">
                      {new Date(tokenInfo.token_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                  </div>
                )}
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
        .space-y-3 > * + * {
          margin-top: 0.75rem;
        }
      `}</style>
    </Layout>
  );
}
