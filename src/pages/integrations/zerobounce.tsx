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
  IconEye,
  IconEyeOff,
  IconShieldCheck,
  IconAlertCircle,
  IconChevronLeft,
  IconMail,
  IconMailOff,
  IconQuestionMark,
  IconSettings,
} from '@tabler/icons-react';
import Link from 'next/link';

interface ZeroBounceIntegration {
  id: string;
  is_connected: boolean;
  config: {
    auto_verify?: boolean;
    allow_catch_all?: boolean;
    allow_unknown?: boolean;
    verify_on_sync?: boolean;
  };
  last_synced_at: string | null;
  created_at: string;
}

interface Stats {
  total_with_email: number;
  verified: number;
  unverified: number;
  valid: number;
  invalid: number;
  catch_all: number;
  unknown: number;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

export default function ZeroBounceIntegrationPage() {
  const { userProfile } = useAuth();

  const [integration, setIntegration] = useState<ZeroBounceIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [credits, setCredits] = useState<number>(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  // Config state
  const [autoVerify, setAutoVerify] = useState(true);
  const [allowCatchAll, setAllowCatchAll] = useState(true);
  const [allowUnknown, setAllowUnknown] = useState(true);
  const [verifyOnSync, setVerifyOnSync] = useState(true);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/integrations/zerobounce/status');
      if (resp.ok) {
        const data = await resp.json();
        setIntegration(data.integration);
        setCredits(data.credits || 0);
        if (data.integration?.config) {
          const c = data.integration.config;
          setAutoVerify(c.auto_verify !== false);
          setAllowCatchAll(c.allow_catch_all !== false);
          setAllowUnknown(c.allow_unknown !== false);
          setVerifyOnSync(c.verify_on_sync !== false);
        }
      }
    } catch (e) {
      console.error('Failed to fetch ZeroBounce status:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const resp = await fetch('/api/integrations/zerobounce/stats');
      if (resp.ok) {
        setStats(await resp.json());
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (integration?.is_connected) {
      fetchStats();
    }
  }, [integration?.is_connected, fetchStats]);

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    setConnecting(true);
    try {
      const resp = await fetch('/api/integrations/zerobounce/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey.trim() }),
      });
      const data = await resp.json();
      if (resp.ok) {
        showToast('ZeroBounce connected successfully!');
        setApiKey('');
        setCredits(data.integration?.credits || 0);
        fetchStatus();
        fetchStats();
      } else {
        showToast(data.error || 'Failed to connect', 'error');
      }
    } catch {
      showToast('Failed to connect to ZeroBounce', 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect ZeroBounce? Email verification will be disabled.')) return;
    setDisconnecting(true);
    try {
      const resp = await fetch('/api/integrations/zerobounce/status', { method: 'DELETE' });
      if (resp.ok) {
        setIntegration(null);
        setStats(null);
        setCredits(0);
        showToast('ZeroBounce disconnected', 'info');
      }
    } catch {
      showToast('Failed to disconnect', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      const resp = await fetch('/api/integrations/zerobounce/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            auto_verify: autoVerify,
            allow_catch_all: allowCatchAll,
            allow_unknown: allowUnknown,
            verify_on_sync: verifyOnSync,
          },
        }),
      });
      if (resp.ok) {
        showToast('Settings saved');
        fetchStatus();
      } else {
        showToast('Failed to save settings', 'error');
      }
    } catch {
      showToast('Failed to save settings', 'error');
    } finally {
      setSavingConfig(false);
    }
  };

  const handleVerifyAll = async () => {
    if (!confirm('This will verify all unverified visitor emails using your ZeroBounce credits. Continue?')) return;
    setVerifying(true);
    try {
      const resp = await fetch('/api/integrations/zerobounce/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await resp.json();
      if (resp.ok) {
        showToast(data.message || `Verified ${data.verified} emails`);
        fetchStats();
        // Refresh credits
        try {
          const credResp = await fetch('/api/integrations/zerobounce/credits');
          if (credResp.ok) setCredits((await credResp.json()).credits);
        } catch { /* ignore */ }
      } else {
        showToast(data.error || 'Verification failed', 'error');
      }
    } catch {
      showToast('Verification failed', 'error');
    } finally {
      setVerifying(false);
    }
  };

  const isConnected = integration?.is_connected;

  return (
    <Layout title="ZeroBounce - Email Verification" pageTitle="ZeroBounce" pagePretitle="Integrations">
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: 20,
            right: 20,
            zIndex: 9999,
            minWidth: 300,
            maxWidth: 500,
          }}
        >
          <div className={`alert alert-${toast.type === 'error' ? 'danger' : toast.type === 'info' ? 'info' : 'success'} alert-dismissible`} role="alert">
            <div className="d-flex align-items-center">
              {toast.type === 'success' ? <IconCheck size={18} className="me-2" /> :
               toast.type === 'error' ? <IconX size={18} className="me-2" /> :
               <IconAlertCircle size={18} className="me-2" />}
              {toast.message}
            </div>
            <button type="button" className="btn-close" onClick={() => setToast(null)} />
          </div>
        </div>
      )}

      <div className="container-xl">
        {/* Back link */}
        <div className="mb-3">
          <Link href="/integrations" className="text-muted text-decoration-none d-inline-flex align-items-center" style={{ fontSize: '0.875rem' }}>
            <IconChevronLeft size={16} className="me-1" /> Back to Integrations
          </Link>
        </div>

        {/* Header Card */}
        <div className="card mb-4" style={{ background: 'linear-gradient(135deg, #00D4AA 0%, #00A888 100%)', border: 'none' }}>
          <div className="card-body py-4">
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center">
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700,
                    fontSize: 20,
                    color: '#fff',
                    marginRight: 16,
                  }}
                >
                  ZB
                </div>
                <div>
                  <h2 className="mb-0" style={{ color: '#fff', fontWeight: 700 }}>ZeroBounce</h2>
                  <p className="mb-0" style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.95rem' }}>
                    Email verification & validation - Protect your sender reputation
                  </p>
                </div>
              </div>
              <div>
                {isConnected ? (
                  <span className="badge bg-white text-success px-3 py-2" style={{ fontSize: '0.85rem' }}>
                    <IconCheck size={16} className="me-1" /> Connected
                  </span>
                ) : (
                  <span className="badge bg-white text-muted px-3 py-2" style={{ fontSize: '0.85rem' }}>
                    Not Connected
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-5">
            <IconLoader2 className="icon-spinner" size={32} />
          </div>
        ) : !isConnected ? (
          /* Connect Card */
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconPlug size={20} className="me-2" /> Connect ZeroBounce
              </h3>
            </div>
            <div className="card-body">
              <div className="mb-4">
                <h4 className="mb-3" style={{ fontSize: '0.95rem', fontWeight: 600 }}>Setup Steps</h4>
                <ol className="list-group list-group-flush" style={{ fontSize: '0.875rem' }}>
                  <li className="list-group-item px-0">1. Sign up at <strong>zerobounce.net</strong> if you don&apos;t have an account</li>
                  <li className="list-group-item px-0">2. Log in to your ZeroBounce dashboard</li>
                  <li className="list-group-item px-0">3. Go to <strong>API</strong> section in the left sidebar</li>
                  <li className="list-group-item px-0">4. Copy your <strong>API Key</strong></li>
                  <li className="list-group-item px-0">5. Paste it below and click <strong>Connect</strong></li>
                </ol>
              </div>

              <div className="mb-3">
                <label className="form-label fw-semibold">API Key</label>
                <div className="input-group">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Enter your ZeroBounce API key"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                  />
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                  </button>
                </div>
                <small className="text-muted">Find your API key in your ZeroBounce dashboard under API &gt; API Keys</small>
              </div>

              <button
                className="btn btn-primary"
                onClick={handleConnect}
                disabled={!apiKey.trim() || connecting}
              >
                {connecting ? <><IconLoader2 size={16} className="icon-spinner me-2" /> Connecting...</> : <><IconPlug size={16} className="me-2" /> Connect</>}
              </button>
            </div>
          </div>
        ) : (
          /* Connected State */
          <>
            {/* Credits & Stats Row */}
            <div className="row mb-4">
              <div className="col-md-3">
                <div className="card">
                  <div className="card-body text-center">
                    <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>API Credits</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#00D4AA' }}>
                      {credits.toLocaleString()}
                    </div>
                    <small className="text-muted">remaining</small>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card">
                  <div className="card-body text-center">
                    <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>
                      <IconShieldCheck size={14} className="me-1" /> Valid
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#2fb344' }}>
                      {statsLoading ? '...' : stats?.valid || 0}
                    </div>
                    <small className="text-muted">emails verified safe</small>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card">
                  <div className="card-body text-center">
                    <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>
                      <IconMailOff size={14} className="me-1" /> Invalid
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#d63939' }}>
                      {statsLoading ? '...' : stats?.invalid || 0}
                    </div>
                    <small className="text-muted">blocked from sync</small>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card">
                  <div className="card-body text-center">
                    <div className="text-muted mb-1" style={{ fontSize: '0.8rem' }}>
                      <IconQuestionMark size={14} className="me-1" /> Unverified
                    </div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#f59f00' }}>
                      {statsLoading ? '...' : stats?.unverified || 0}
                    </div>
                    <small className="text-muted">pending verification</small>
                  </div>
                </div>
              </div>
            </div>

            {/* Verification Stats Breakdown */}
            {stats && stats.verified > 0 && (
              <div className="card mb-4">
                <div className="card-header">
                  <h3 className="card-title">
                    <IconMail size={20} className="me-2" /> Email Verification Breakdown
                  </h3>
                </div>
                <div className="card-body">
                  <div className="row g-3">
                    {/* Progress bar */}
                    <div className="col-12">
                      <div className="progress" style={{ height: 24, borderRadius: 12 }}>
                        {stats.valid > 0 && (
                          <div
                            className="progress-bar bg-success"
                            style={{ width: `${(stats.valid / stats.total_with_email) * 100}%` }}
                            title={`Valid: ${stats.valid}`}
                          >
                            {stats.valid > 0 && `${Math.round((stats.valid / stats.total_with_email) * 100)}%`}
                          </div>
                        )}
                        {stats.catch_all > 0 && (
                          <div
                            className="progress-bar bg-warning"
                            style={{ width: `${(stats.catch_all / stats.total_with_email) * 100}%` }}
                            title={`Catch-all: ${stats.catch_all}`}
                          />
                        )}
                        {stats.invalid > 0 && (
                          <div
                            className="progress-bar bg-danger"
                            style={{ width: `${(stats.invalid / stats.total_with_email) * 100}%` }}
                            title={`Invalid: ${stats.invalid}`}
                          />
                        )}
                        {stats.unknown > 0 && (
                          <div
                            className="progress-bar bg-secondary"
                            style={{ width: `${(stats.unknown / stats.total_with_email) * 100}%` }}
                            title={`Unknown: ${stats.unknown}`}
                          />
                        )}
                        {stats.unverified > 0 && (
                          <div
                            className="progress-bar"
                            style={{ width: `${(stats.unverified / stats.total_with_email) * 100}%`, background: '#e0e0e0' }}
                            title={`Unverified: ${stats.unverified}`}
                          />
                        )}
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="col-12">
                      <div className="d-flex flex-wrap gap-4" style={{ fontSize: '0.85rem' }}>
                        <span><span className="badge bg-success me-1">&nbsp;</span> Valid: {stats.valid}</span>
                        <span><span className="badge bg-warning me-1">&nbsp;</span> Catch-all: {stats.catch_all}</span>
                        <span><span className="badge bg-danger me-1">&nbsp;</span> Invalid: {stats.invalid}</span>
                        <span><span className="badge bg-secondary me-1">&nbsp;</span> Unknown: {stats.unknown}</span>
                        <span><span className="badge me-1" style={{ background: '#e0e0e0' }}>&nbsp;</span> Unverified: {stats.unverified}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Manual Verify */}
            <div className="card mb-4">
              <div className="card-header d-flex align-items-center justify-content-between">
                <h3 className="card-title mb-0">
                  <IconShieldCheck size={20} className="me-2" /> Verify Emails
                </h3>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={fetchStats}
                  disabled={statsLoading}
                >
                  <IconRefresh size={14} className={statsLoading ? 'icon-spinner' : ''} />
                </button>
              </div>
              <div className="card-body">
                <p style={{ fontSize: '0.875rem', color: '#666' }}>
                  Run email verification on all unverified visitor emails. This uses your ZeroBounce credits
                  ({credits.toLocaleString()} remaining). Invalid emails will be automatically excluded from
                  Klaviyo sync and push events.
                </p>
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-primary"
                    onClick={handleVerifyAll}
                    disabled={verifying || !stats || stats.unverified === 0}
                  >
                    {verifying ? (
                      <><IconLoader2 size={16} className="icon-spinner me-2" /> Verifying...</>
                    ) : (
                      <><IconShieldCheck size={16} className="me-2" /> Verify {stats?.unverified || 0} Unverified Emails</>
                    )}
                  </button>
                </div>
                {stats && stats.unverified === 0 && stats.verified > 0 && (
                  <div className="alert alert-success mt-3 mb-0 py-2" style={{ fontSize: '0.85rem' }}>
                    <IconCheck size={16} className="me-1" /> All visitor emails have been verified!
                  </div>
                )}
              </div>
            </div>

            {/* Settings Card */}
            <div className="card mb-4">
              <div className="card-header">
                <h3 className="card-title">
                  <IconSettings size={20} className="me-2" /> Verification Settings
                </h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={autoVerify}
                      onChange={(e) => setAutoVerify(e.target.checked)}
                    />
                    <span className="form-check-label fw-semibold">Auto-verify new visitors</span>
                  </label>
                  <small className="text-muted d-block ms-4 ps-3">
                    Automatically verify emails when new visitors are fetched from the API, before syncing to Klaviyo.
                  </small>
                </div>

                <div className="mb-3">
                  <label className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={verifyOnSync}
                      onChange={(e) => setVerifyOnSync(e.target.checked)}
                    />
                    <span className="form-check-label fw-semibold">Verify before Klaviyo sync</span>
                  </label>
                  <small className="text-muted d-block ms-4 ps-3">
                    Check email status before syncing visitors to Klaviyo. Invalid emails will be filtered out.
                  </small>
                </div>

                <hr />
                <p className="text-muted mb-3" style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                  Email Status Handling — Control which email types are synced to Klaviyo
                </p>

                <div className="mb-3">
                  <label className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={allowCatchAll}
                      onChange={(e) => setAllowCatchAll(e.target.checked)}
                    />
                    <span className="form-check-label fw-semibold">Allow catch-all emails</span>
                  </label>
                  <small className="text-muted d-block ms-4 ps-3">
                    Catch-all domains accept all emails — the address may or may not be real. Enabling this syncs them to Klaviyo.
                  </small>
                </div>

                <div className="mb-3">
                  <label className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={allowUnknown}
                      onChange={(e) => setAllowUnknown(e.target.checked)}
                    />
                    <span className="form-check-label fw-semibold">Allow unknown status emails</span>
                  </label>
                  <small className="text-muted d-block ms-4 ps-3">
                    Unknown means verification was inconclusive (temporary server issue). These will be retried on the next run.
                  </small>
                </div>

                <button
                  className="btn btn-primary mt-2"
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                >
                  {savingConfig ? (
                    <><IconLoader2 size={16} className="icon-spinner me-2" /> Saving...</>
                  ) : (
                    <><IconCheck size={16} className="me-2" /> Save Settings</>
                  )}
                </button>
              </div>
            </div>

            {/* How It Works */}
            <div className="card mb-4">
              <div className="card-header">
                <h3 className="card-title">How Email Verification Works</h3>
              </div>
              <div className="card-body" style={{ fontSize: '0.875rem' }}>
                <div className="row g-4">
                  <div className="col-md-4">
                    <div className="d-flex align-items-start">
                      <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style={{ width: 28, height: 28, minWidth: 28, fontSize: '0.8rem', fontWeight: 700 }}>1</div>
                      <div>
                        <strong>New Visitor Arrives</strong>
                        <p className="text-muted mb-0 mt-1">When a new visitor with an email is identified via the Visitors API, the email is sent to ZeroBounce for verification.</p>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="d-flex align-items-start">
                      <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style={{ width: 28, height: 28, minWidth: 28, fontSize: '0.8rem', fontWeight: 700 }}>2</div>
                      <div>
                        <strong>Email Validated</strong>
                        <p className="text-muted mb-0 mt-1">ZeroBounce checks if the email exists, detects spam traps, catch-all domains, disposable addresses, and role-based emails.</p>
                      </div>
                    </div>
                  </div>
                  <div className="col-md-4">
                    <div className="d-flex align-items-start">
                      <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center me-3" style={{ width: 28, height: 28, minWidth: 28, fontSize: '0.8rem', fontWeight: 700 }}>3</div>
                      <div>
                        <strong>Filtered for Klaviyo</strong>
                        <p className="text-muted mb-0 mt-1">Only verified-safe emails are synced to Klaviyo, protecting your sender reputation and deliverability.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Disconnect */}
            <div className="card border-danger">
              <div className="card-body d-flex align-items-center justify-content-between">
                <div>
                  <strong className="text-danger">Disconnect ZeroBounce</strong>
                  <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>
                    Email verification will be disabled. Existing verification data will be preserved.
                  </p>
                </div>
                <button
                  className="btn btn-outline-danger"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? <IconLoader2 size={16} className="icon-spinner" /> : <><IconTrash size={16} className="me-1" /> Disconnect</>}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
