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
  IconX,
  IconEye,
  IconEyeOff,
  IconKey,
} from '@tabler/icons-react';
import Link from 'next/link';

interface Integration {
  id: string;
  is_connected: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
}

interface TokenInfo {
  ad_account_id: string | null;
  ad_account_name: string | null;
  token_expires_at: string | null;
}

interface AdAccount {
  id: string;
  name: string;
  account_status: number;
}

interface ImportRecord {
  id: string;
  audience_id: string | null;
  audience_name: string;
  contact_count: number;
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

export default function FacebookIntegrationPage() {
  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [adAccounts, setAdAccounts] = useState<AdAccount[]>([]);
  const [adAccountsLoading, setAdAccountsLoading] = useState(false);
  const [selectedAdAccount, setSelectedAdAccount] = useState('');
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [selectedSource, setSelectedSource] = useState('');
  const [audienceName, setAudienceName] = useState('');
  const [importing, setImporting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // App credentials form
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch('/api/integrations/facebook/status');
      const data = await resp.json();
      if (resp.ok) {
        setIntegration(data.integration || null);
        setTokenInfo(data.token_info || null);
        setImports(data.imports || []);
        if (data.token_info?.ad_account_id) {
          setSelectedAdAccount(data.token_info.ad_account_id);
        }
      }
    } catch (error) {
      console.error('Error fetching Facebook status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAdAccounts = useCallback(async () => {
    setAdAccountsLoading(true);
    try {
      const resp = await fetch('/api/integrations/facebook/ad-accounts');
      const data = await resp.json();
      if (resp.ok) {
        setAdAccounts(data.ad_accounts || []);
      }
    } catch (error) {
      console.error('Error fetching ad accounts:', error);
    } finally {
      setAdAccountsLoading(false);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    setSourcesLoading(true);
    const allSources: SourceOption[] = [];

    try {
      // Fetch pixels
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
      // Fetch audiences
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
      fetchAdAccounts();
      fetchSources();
    }
  }, [integration?.is_connected, fetchAdAccounts, fetchSources]);

  // Check for OAuth redirect params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      showToast('Facebook connected successfully!', 'success');
      window.history.replaceState({}, '', '/integrations/facebook');
      fetchStatus();
    } else if (params.get('error')) {
      showToast(`Facebook connection failed: ${params.get('error')}`, 'error');
      window.history.replaceState({}, '', '/integrations/facebook');
    }
  }, []);

  const handleImport = async () => {
    if (!selectedAdAccount || !selectedSource || !audienceName.trim()) return;

    const [sourceType, sourceId] = selectedSource.split(':');
    setImporting(true);

    try {
      const body: Record<string, string> = {
        ad_account_id: selectedAdAccount,
        audience_name: audienceName.trim(),
      };
      if (sourceType === 'pixel') body.source_pixel_id = sourceId;
      else body.source_audience_id = sourceId;

      const resp = await fetch('/api/integrations/facebook/import-audience', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Import failed');

      showToast(data.message || 'Audience imported successfully', 'success');
      setAudienceName('');
      setSelectedSource('');
      fetchStatus();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Facebook?')) return;
    setDisconnecting(true);
    try {
      const resp = await fetch('/api/integrations/facebook/status', { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to disconnect');
      setIntegration(null);
      setTokenInfo(null);
      setImports([]);
      setAdAccounts([]);
      showToast('Facebook disconnected', 'info');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Facebook Integration" pageTitle="Loading...">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  const fbColor = '#1877F2';

  return (
    <Layout title="Facebook Integration" pageTitle="Facebook" pagePretitle="Integrations">
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
                    background: `linear-gradient(135deg, ${fbColor} 0%, ${fbColor}cc 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 18 }}>f</span>
                </div>
                <div>
                  <h3 className="card-title mb-0">Facebook</h3>
                  <div className="text-muted small">Custom Audiences for ad targeting</div>
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
                <div>
                  <p className="text-muted mb-3">
                    Connect your Facebook account to create Custom Audiences from your Traffic AI visitors and audiences.
                  </p>

                  <div className="mb-4 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                    <h4 className="mb-3">How to get your Facebook App credentials</h4>
                    <ol className="mb-0" style={{ paddingLeft: '1.25rem' }}>
                      <li className="mb-2">Go to <strong>developers.facebook.com</strong> and create an app (type: Business)</li>
                      <li className='mb-2'>Click "my apps" in the <strong>top right</strong> corner</li>
                      <li className='mb-2'> Click "create app" on the  <strong>right side</strong> </li>
                      <li className="mb-2">Fill in app details "App name" and "Contact email" click next</li>
                      <li className='mb-2'>Select the "All" radial button then "measure ad performance data with marketing API" click next</li>
                      <li className='mb-2'>Select the business portfolio you would like to connect this app to, click next</li>
                      <li className='mb-2'>In your app dashboard, go to Settings → Basic</li>
                      <li className='mb-2'>Click next, verify data is correct and click next</li>
                      <li className='mb-2'>Copy your App ID and App Secret</li>
                      <li className='mb-2'>Go to Facebook Login → Settings.</li>
                      <li className='mb-2'>Turn on: (Client OAuth Login) (Web OAuth Login)</li>
                      <li className='mb-2'>In Valid OAuth Redirect URIs, paste https://app.trafficai.io/api/integrations/facebook/callback and click enter</li>
                      
                    </ol>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Facebook App ID</label>
                    <input
                      type="text"
                      className="form-control"
                      style={{ maxWidth: 400 }}
                      placeholder="123456789012345"
                      value={appId}
                      onChange={(e) => setAppId(e.target.value)}
                      disabled={connecting}
                    />
                    <div className="form-hint mt-1">Found in your Facebook App Dashboard under Settings &rarr; Basic</div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Facebook App Secret</label>
                    <div className="input-group" style={{ maxWidth: 400 }}>
                      <input
                        type={showAppSecret ? 'text' : 'password'}
                        className="form-control"
                        placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={appSecret}
                        onChange={(e) => setAppSecret(e.target.value)}
                        disabled={connecting}
                      />
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => setShowAppSecret(!showAppSecret)}
                      >
                        {showAppSecret ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                      </button>
                    </div>
                    <div className="form-hint mt-1">Keep this secret. It is stored securely in our database.</div>
                  </div>

                  <button
                    className="btn"
                    style={{ backgroundColor: fbColor, color: '#fff', border: 'none' }}
                    disabled={!appId.trim() || !appSecret.trim() || connecting}
                    onClick={async () => {
                      setConnecting(true);
                      try {
                        const resp = await fetch('/api/integrations/facebook/connect', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ app_id: appId.trim(), app_secret: appSecret.trim() }),
                        });
                        const data = await resp.json();
                        if (!resp.ok) throw new Error(data.error || 'Failed to save credentials');

                        // Redirect to Facebook OAuth
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
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="me-2">
                          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                        </svg>
                        Connect with Facebook
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  {/* Ad Account Selector */}
                  <div className="mb-4">
                    <h4 className="mb-2">Ad Account</h4>
                    {adAccountsLoading ? (
                      <div className="d-flex align-items-center text-muted">
                        <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                        Loading ad accounts...
                      </div>
                    ) : (
                      <select
                        className="form-select"
                        style={{ maxWidth: 400 }}
                        value={selectedAdAccount}
                        onChange={(e) => setSelectedAdAccount(e.target.value)}
                      >
                        <option value="">Select an ad account...</option>
                        {adAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({acc.id})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <hr className="my-3" />

                  {/* Import Audience */}
                  <div className="mb-4">
                    <h4 className="mb-2">
                      <IconUpload size={18} className="me-2" />
                      Import Audience
                    </h4>
                    <p className="text-muted small mb-3">
                      Create a Facebook Custom Audience from your Traffic AI data. Emails are SHA256-hashed before upload.
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
                      <label className="form-label fw-bold">Audience Name</label>
                      <input
                        type="text"
                        className="form-control"
                        style={{ maxWidth: 400 }}
                        placeholder="e.g. Website Visitors Q1 2026"
                        value={audienceName}
                        onChange={(e) => setAudienceName(e.target.value)}
                        disabled={importing}
                      />
                    </div>

                    <button
                      className="btn btn-primary"
                      onClick={handleImport}
                      disabled={!selectedAdAccount || !selectedSource || !audienceName.trim() || importing}
                    >
                      {importing ? (
                        <>
                          <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                          Importing...
                        </>
                      ) : (
                        <>
                          <IconUpload size={16} className="me-1" />
                          Import to Facebook
                        </>
                      )}
                    </button>
                  </div>

                  {/* Import History */}
                  {imports.length > 0 && (
                    <>
                      <hr className="my-3" />
                      <div className="mb-4">
                        <h4 className="mb-2">
                          <IconUsers size={18} className="me-2" />
                          Import History
                        </h4>
                        <div className="table-responsive">
                          <table className="table table-vcenter">
                            <thead>
                              <tr>
                                <th>Audience Name</th>
                                <th>Contacts</th>
                                <th>Status</th>
                                <th>Date</th>
                              </tr>
                            </thead>
                            <tbody>
                              {imports.map((imp) => (
                                <tr key={imp.id}>
                                  <td>{imp.audience_name}</td>
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
                      </div>
                    </>
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
                      Disconnect Facebook
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
                    <div className="fw-medium small">Enter App Credentials</div>
                    <div className="text-muted small">Add your Facebook App ID and App Secret</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">2</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Authorize via OAuth</div>
                    <div className="text-muted small">Sign in and grant ad management permissions</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">3</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Select Ad Account</div>
                    <div className="text-muted small">Choose which ad account to create audiences in</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">4</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Import Audiences</div>
                    <div className="text-muted small">SHA256-hash emails and create Custom Audiences</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {tokenInfo?.ad_account_name && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Connected Account</h3>
              </div>
              <div className="card-body">
                <div className="mb-2">
                  <div className="text-muted small">Ad Account</div>
                  <div className="fw-medium">{tokenInfo.ad_account_name}</div>
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
