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

        {/* Header */}
        <div className="card mb-4" style={{ border: 'none', overflow: 'hidden' }}>
          <div style={{ background: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)', padding: '2rem 2rem 1.5rem' }}>
            <div className="d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center">
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 10,
                    background: '#00D4AA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 16,
                    color: '#0f2027',
                    marginRight: 14,
                    letterSpacing: '-0.5px',
                  }}
                >
                  ZB
                </div>
                <div>
                  <h2 className="mb-0" style={{ color: '#fff', fontWeight: 700, fontSize: '1.35rem' }}>ZeroBounce</h2>
                  <p className="mb-0" style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem' }}>
                    Email verification & validation
                  </p>
                </div>
              </div>
              <div>
                {isConnected ? (
                  <span className="d-inline-flex align-items-center px-3 py-2" style={{ fontSize: '0.8rem', fontWeight: 600, color: '#00D4AA', background: 'rgba(0,212,170,0.12)', borderRadius: 8, border: '1px solid rgba(0,212,170,0.25)' }}>
                    <IconCheck size={15} className="me-1" /> Connected
                  </span>
                ) : (
                  <span className="d-inline-flex align-items-center px-3 py-2" style={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', background: 'rgba(255,255,255,0.08)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
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
            {/* Stats Overview */}
            <div className="row g-3 mb-4">
              <div className="col-6 col-lg-3">
                <div className="card" style={{ borderLeft: '3px solid #00D4AA' }}>
                  <div className="card-body py-3 px-3">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Credits</span>
                      <IconShieldCheck size={16} style={{ color: '#00D4AA' }} />
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {credits.toLocaleString()}
                    </div>
                    <small className="text-muted" style={{ fontSize: '0.75rem' }}>remaining</small>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="card" style={{ borderLeft: '3px solid #2fb344' }}>
                  <div className="card-body py-3 px-3">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Valid</span>
                      <IconMail size={16} style={{ color: '#2fb344' }} />
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {statsLoading ? '...' : (stats?.valid || 0).toLocaleString()}
                    </div>
                    <small className="text-muted" style={{ fontSize: '0.75rem' }}>verified safe</small>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="card" style={{ borderLeft: '3px solid #d63939' }}>
                  <div className="card-body py-3 px-3">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invalid</span>
                      <IconMailOff size={16} style={{ color: '#d63939' }} />
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {statsLoading ? '...' : (stats?.invalid || 0).toLocaleString()}
                    </div>
                    <small className="text-muted" style={{ fontSize: '0.75rem' }}>blocked from sync</small>
                  </div>
                </div>
              </div>
              <div className="col-6 col-lg-3">
                <div className="card" style={{ borderLeft: '3px solid #f59f00' }}>
                  <div className="card-body py-3 px-3">
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="text-muted" style={{ fontSize: '0.75rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unverified</span>
                      <IconQuestionMark size={16} style={{ color: '#f59f00' }} />
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 700, lineHeight: 1.2 }}>
                      {statsLoading ? '...' : (stats?.unverified || 0).toLocaleString()}
                    </div>
                    <small className="text-muted" style={{ fontSize: '0.75rem' }}>pending verification</small>
                  </div>
                </div>
              </div>
            </div>

            {/* Verification Breakdown */}
            {stats && stats.total_with_email > 0 && (
              <div className="card mb-4">
                <div className="card-header">
                  <h3 className="card-title" style={{ fontSize: '0.9rem' }}>
                    <IconMail size={18} className="me-2" /> Verification Breakdown
                  </h3>
                  <div className="card-actions">
                    <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                      {stats.verified.toLocaleString()} of {stats.total_with_email.toLocaleString()} verified ({stats.total_with_email > 0 ? Math.round((stats.verified / stats.total_with_email) * 100) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="card-body pt-3 pb-3">
                  {/* Progress bar */}
                  <div className="progress mb-3" style={{ height: 10, borderRadius: 6, overflow: 'hidden' }}>
                    {stats.valid > 0 && (
                      <div
                        className="progress-bar"
                        style={{ width: `${(stats.valid / stats.total_with_email) * 100}%`, background: '#2fb344', transition: 'width 0.6s ease' }}
                        title={`Valid: ${stats.valid}`}
                      />
                    )}
                    {stats.catch_all > 0 && (
                      <div
                        className="progress-bar"
                        style={{ width: `${(stats.catch_all / stats.total_with_email) * 100}%`, background: '#f59f00', transition: 'width 0.6s ease' }}
                        title={`Catch-all: ${stats.catch_all}`}
                      />
                    )}
                    {stats.invalid > 0 && (
                      <div
                        className="progress-bar"
                        style={{ width: `${(stats.invalid / stats.total_with_email) * 100}%`, background: '#d63939', transition: 'width 0.6s ease' }}
                        title={`Invalid: ${stats.invalid}`}
                      />
                    )}
                    {stats.unknown > 0 && (
                      <div
                        className="progress-bar"
                        style={{ width: `${(stats.unknown / stats.total_with_email) * 100}%`, background: '#667382', transition: 'width 0.6s ease' }}
                        title={`Unknown: ${stats.unknown}`}
                      />
                    )}
                    {stats.unverified > 0 && (
                      <div
                        className="progress-bar"
                        style={{ width: `${(stats.unverified / stats.total_with_email) * 100}%`, background: 'rgba(255,255,255,0.08)', transition: 'width 0.6s ease' }}
                        title={`Unverified: ${stats.unverified}`}
                      />
                    )}
                  </div>

                  {/* Legend */}
                  <div className="d-flex flex-wrap gap-3" style={{ fontSize: '0.8rem' }}>
                    {[
                      { color: '#2fb344', label: 'Valid', value: stats.valid },
                      { color: '#f59f00', label: 'Catch-all', value: stats.catch_all },
                      { color: '#d63939', label: 'Invalid', value: stats.invalid },
                      { color: '#667382', label: 'Unknown', value: stats.unknown },
                      { color: 'rgba(255,255,255,0.15)', label: 'Unverified', value: stats.unverified },
                    ].filter(item => item.value > 0).map(item => (
                      <span key={item.label} className="d-inline-flex align-items-center gap-1">
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, display: 'inline-block' }} />
                        <span className="text-muted">{item.label}:</span> <strong>{item.value.toLocaleString()}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Verify Emails */}
            <div className="card mb-4">
              <div className="card-header">
                <h3 className="card-title" style={{ fontSize: '0.9rem' }}>
                  <IconShieldCheck size={18} className="me-2" /> Verify Emails
                </h3>
                <div className="card-actions">
                  <button
                    className="btn btn-ghost-secondary btn-sm"
                    onClick={fetchStats}
                    disabled={statsLoading}
                    title="Refresh stats"
                  >
                    <IconRefresh size={14} className={statsLoading ? 'icon-spinner' : ''} />
                  </button>
                </div>
              </div>
              <div className="card-body">
                {stats && stats.unverified === 0 && stats.verified > 0 ? (
                  <div className="d-flex align-items-center gap-2 py-1" style={{ color: '#2fb344', fontSize: '0.875rem' }}>
                    <IconCheck size={18} />
                    <span>All visitor emails have been verified.</span>
                  </div>
                ) : (
                  <>
                    <p className="text-muted mb-3" style={{ fontSize: '0.84rem' }}>
                      Run verification on unverified visitor emails. Uses {credits.toLocaleString()} remaining ZeroBounce credits. Invalid emails are excluded from Klaviyo sync.
                    </p>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleVerifyAll}
                      disabled={verifying || !stats || stats.unverified === 0}
                    >
                      {verifying ? (
                        <><IconLoader2 size={14} className="icon-spinner me-1" /> Verifying...</>
                      ) : (
                        <><IconShieldCheck size={14} className="me-1" /> Verify {(stats?.unverified || 0).toLocaleString()} Unverified Emails</>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Settings Card */}
            <div className="card mb-4">
              <div className="card-header">
                <h3 className="card-title" style={{ fontSize: '0.9rem' }}>
                  <IconSettings size={18} className="me-2" /> Verification Settings
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
                <h3 className="card-title" style={{ fontSize: '0.9rem' }}>How It Works</h3>
              </div>
              <div className="card-body py-3">
                <div className="d-flex align-items-center gap-3" style={{ fontSize: '0.82rem' }}>
                  <div className="d-flex align-items-center gap-2 flex-fill">
                    <span className="d-flex align-items-center justify-content-center" style={{ width: 24, height: 24, minWidth: 24, borderRadius: 6, background: 'var(--tblr-primary)', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>1</span>
                    <div><strong>Visitor identified</strong> <span className="text-muted">— email captured via API</span></div>
                  </div>
                  <IconChevronLeft size={14} className="text-muted" style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
                  <div className="d-flex align-items-center gap-2 flex-fill">
                    <span className="d-flex align-items-center justify-content-center" style={{ width: 24, height: 24, minWidth: 24, borderRadius: 6, background: 'var(--tblr-primary)', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>2</span>
                    <div><strong>ZeroBounce validates</strong> <span className="text-muted">— checks spam traps, disposable, catch-all</span></div>
                  </div>
                  <IconChevronLeft size={14} className="text-muted" style={{ transform: 'rotate(180deg)', flexShrink: 0 }} />
                  <div className="d-flex align-items-center gap-2 flex-fill">
                    <span className="d-flex align-items-center justify-content-center" style={{ width: 24, height: 24, minWidth: 24, borderRadius: 6, background: 'var(--tblr-primary)', color: '#fff', fontSize: '0.7rem', fontWeight: 700 }}>3</span>
                    <div><strong>Safe emails synced</strong> <span className="text-muted">— invalid filtered from Klaviyo</span></div>
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
