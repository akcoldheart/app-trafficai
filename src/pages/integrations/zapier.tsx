import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import {
  IconArrowLeft,
  IconLoader2,
  IconCheck,
  IconAlertCircle,
  IconCircleCheck,
  IconSend,
  IconTrash,
  IconEye,
  IconEyeOff,
  IconWebhook,
  IconX,
} from '@tabler/icons-react';
import Link from 'next/link';
import { TRIGGER_META, TRIGGER_ORDER } from '@/lib/zapier';
import type { ZapierTrigger, ZapierTriggerConfig, ZapierConfig } from '@/lib/zapier';

interface Integration {
  id: string;
  is_connected: boolean;
  config: ZapierConfig;
  last_synced_at: string | null;
  created_at: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

const TRIGGER_ICONS: Record<ZapierTrigger, string> = {
  new_visitor: '👤',
  high_intent_visitor: '🔥',
  new_lead: '💼',
  audience_match: '🎯',
};

const TRIGGER_PAYLOAD_PREVIEW: Record<ZapierTrigger, string> = {
  new_visitor: `{
  "event": "new_visitor",
  "trigger": "New Visitor Identified",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "visitor": {
      "email": "jane.smith@acmecorp.com",
      "first_name": "Jane",
      "last_name": "Smith",
      "company": "Acme Corp",
      "job_title": "VP of Marketing",
      "city": "San Francisco",
      "state": "CA",
      "country": "US",
      "lead_score": 82,
      "total_pageviews": 7,
      "pixel_domain": "yoursite.com"
    }
  }
}`,
  high_intent_visitor: `{
  "event": "high_intent_visitor",
  "trigger": "New High Intent Visitor",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "visitor": {
      "email": "mike.jones@bigcorp.com",
      "first_name": "Mike",
      "last_name": "Jones",
      "company": "BigCorp",
      "job_title": "Head of Sales",
      "lead_score": 91,
      "total_pageviews": 15,
      "total_sessions": 6
    }
  }
}`,
  new_lead: `{
  "event": "new_lead",
  "trigger": "New Lead",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "visitor": {
      "email": "sarah.lee@startup.io",
      "first_name": "Sarah",
      "last_name": "Lee",
      "company": "Startup.io",
      "job_title": "CTO",
      "lead_score": 68,
      "total_pageviews": 4
    }
  }
}`,
  audience_match: `{
  "event": "audience_match",
  "trigger": "New Audience Match",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "audience": {
      "id": "aud_123",
      "name": "Enterprise Decision Makers"
    },
    "contact": {
      "email": "ceo@enterprise.com",
      "first_name": "Alex",
      "last_name": "Carter",
      "company": "Enterprise Co"
    }
  }
}`,
};

export default function ZapierIntegrationPage() {
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<ZapierTrigger | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [expandedPreview, setExpandedPreview] = useState<ZapierTrigger | null>(null);
  const [showUrls, setShowUrls] = useState<Partial<Record<ZapierTrigger, boolean>>>({});

  // Local editable trigger state
  const [triggers, setTriggers] = useState<Partial<Record<ZapierTrigger, ZapierTriggerConfig>>>({});

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 6000);
  };

  const fetchIntegration = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/integrations/zapier/status');
      const data = await response.json();
      if (response.ok && data.integration) {
        setIntegration(data.integration);
        setTriggers(data.integration.config?.triggers || {});
      } else {
        // Initialize with empty triggers
        setTriggers(
          Object.fromEntries(
            TRIGGER_ORDER.map((t) => [t, { webhook_url: '', enabled: true }])
          ) as Record<ZapierTrigger, ZapierTriggerConfig>
        );
      }
    } catch (error) {
      console.error('Error fetching Zapier status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegration();
  }, [fetchIntegration]);

  const updateTrigger = (trigger: ZapierTrigger, field: keyof ZapierTriggerConfig, value: string | boolean) => {
    setTriggers((prev) => ({
      ...prev,
      [trigger]: {
        ...(prev[trigger] || { webhook_url: '', enabled: true }),
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const config: ZapierConfig = { triggers };
      const response = await fetch('/api/integrations/zapier/status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save');

      setIntegration(data.integration);
      showToast('Trigger settings saved', 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (trigger: ZapierTrigger) => {
    const url = triggers[trigger]?.webhook_url;
    if (!url) {
      showToast('Enter a webhook URL first, then save before testing', 'error');
      return;
    }

    setTesting(trigger);
    try {
      const response = await fetch('/api/integrations/zapier/test-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to send test');

      showToast(`Test event sent for "${TRIGGER_META[trigger].name}"`, 'success');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setTesting(null);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Clear all Zapier trigger configurations?')) return;
    setDisconnecting(true);
    try {
      await fetch('/api/integrations/zapier/status', { method: 'DELETE' });
      setIntegration(null);
      setTriggers(
        Object.fromEntries(
          TRIGGER_ORDER.map((t) => [t, { webhook_url: '', enabled: true }])
        ) as Record<ZapierTrigger, ZapierTriggerConfig>
      );
      showToast('Zapier triggers cleared', 'info');
    } catch (error) {
      showToast('Failed to disconnect', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const anyConfigured = TRIGGER_ORDER.some((t) => triggers[t]?.webhook_url?.trim());
  const savedAnyConfigured = TRIGGER_ORDER.some(
    (t) => integration?.config?.triggers?.[t]?.webhook_url?.trim()
  );

  if (loading) {
    return (
      <Layout title="Zapier Integration" pageTitle="Zapier">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Zapier Integration" pageTitle="Zapier" pagePretitle="Integrations">
      {/* Toast */}
      {toast && (
        <div
          className={`alert alert-${toast.type === 'error' ? 'danger' : toast.type === 'success' ? 'success' : 'info'} alert-dismissible`}
          style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, maxWidth: 420, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
        >
          <div className="d-flex align-items-center">
            {toast.type === 'success' && <IconCircleCheck size={18} className="me-2" />}
            {toast.type === 'error' && <IconAlertCircle size={18} className="me-2" />}
            {toast.message}
          </div>
          <button type="button" className="btn-close" onClick={() => setToast(null)} />
        </div>
      )}

      {/* Back */}
      <div className="mb-3">
        <Link href="/integrations" className="btn btn-ghost-primary btn-sm">
          <IconArrowLeft size={16} className="me-1" />
          All Integrations
        </Link>
      </div>

      <div className="row row-cards">
        <div className="col-lg-8">
          {/* Header card */}
          <div className="card mb-3">
            <div className="card-header">
              <div className="d-flex align-items-center">
                <div
                  className="me-3"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #FF4F00 0%, #FF7340 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Z</span>
                </div>
                <div>
                  <h3 className="card-title mb-0">Zapier</h3>
                  <div className="text-muted small">Connect Traffic AI events to 5,000+ apps</div>
                </div>
              </div>
              <div className="card-actions">
                {savedAnyConfigured ? (
                  <span className="badge bg-green-lt">
                    <IconCheck size={14} className="me-1" />
                    Active
                  </span>
                ) : (
                  <span className="badge bg-secondary-lt">Not configured</span>
                )}
              </div>
            </div>
            <div className="card-body pb-2">
              <p className="text-muted mb-0">
                Create a separate <strong>Zap</strong> for each trigger you want to use. Each Zap starts with
                <strong> &ldquo;Webhooks by Zapier → Catch Hook&rdquo;</strong> — paste the generated URL below
                for the corresponding trigger.
              </p>
            </div>
          </div>

          {/* Trigger Cards */}
          {TRIGGER_ORDER.map((trigger) => {
            const meta = TRIGGER_META[trigger];
            const triggerConfig = triggers[trigger] || { webhook_url: '', enabled: true };
            const isSaved = !!integration?.config?.triggers?.[trigger]?.webhook_url;
            const hasUrl = !!triggerConfig.webhook_url?.trim();
            const isExpanded = expandedPreview === trigger;

            return (
              <div key={trigger} className="card mb-3">
                <div className="card-header">
                  <div className="d-flex align-items-center gap-2">
                    <span style={{ fontSize: 20 }}>{TRIGGER_ICONS[trigger]}</span>
                    <div>
                      <h4 className="card-title mb-0">{meta.name}</h4>
                    </div>
                  </div>
                  <div className="card-actions">
                    <label className="form-check form-switch mb-0">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        checked={triggerConfig.enabled}
                        onChange={(e) => updateTrigger(trigger, 'enabled', e.target.checked)}
                      />
                    </label>
                    {isSaved && (
                      <span className="badge bg-green-lt ms-1">
                        <IconCheck size={11} className="me-1" />
                        Saved
                      </span>
                    )}
                  </div>
                </div>

                <div className="card-body">
                  <p className="text-muted small mb-3">{meta.description}</p>

                  {/* Webhook URL input */}
                  <label className="form-label fw-medium">Zapier Webhook URL</label>
                  <div className="input-group mb-2">
                    <input
                      type={showUrls[trigger] ? 'text' : 'password'}
                      className="form-control font-monospace"
                      style={{ fontSize: '0.82rem' }}
                      placeholder="https://hooks.zapier.com/hooks/catch/000000/xxxxxxx/"
                      value={triggerConfig.webhook_url || ''}
                      onChange={(e) => updateTrigger(trigger, 'webhook_url', e.target.value)}
                      disabled={!triggerConfig.enabled}
                    />
                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() => setShowUrls((prev) => ({ ...prev, [trigger]: !prev[trigger] }))}
                    >
                      {showUrls[trigger] ? <IconEyeOff size={15} /> : <IconEye size={15} />}
                    </button>
                    <button
                      className="btn btn-outline-primary"
                      type="button"
                      onClick={() => handleTest(trigger)}
                      disabled={!isSaved || testing === trigger || !triggerConfig.enabled}
                      title={!isSaved ? 'Save first, then test' : 'Send test event'}
                    >
                      {testing === trigger ? (
                        <IconLoader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <>
                          <IconSend size={15} className="me-1" />
                          Test
                        </>
                      )}
                    </button>
                    {hasUrl && (
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => updateTrigger(trigger, 'webhook_url', '')}
                        title="Clear URL"
                      >
                        <IconX size={15} />
                      </button>
                    )}
                  </div>

                  {/* Payload preview toggle */}
                  <button
                    className="btn btn-link btn-sm p-0 text-muted"
                    style={{ fontSize: '0.8rem' }}
                    onClick={() => setExpandedPreview(isExpanded ? null : trigger)}
                  >
                    <IconWebhook size={13} className="me-1" />
                    {isExpanded ? 'Hide payload preview' : 'View payload preview'}
                  </button>

                  {isExpanded && (
                    <pre
                      className="mt-2 p-3 rounded small"
                      style={{
                        backgroundColor: 'var(--tblr-bg-surface-secondary)',
                        fontSize: '0.75rem',
                        overflowX: 'auto',
                        maxHeight: 280,
                      }}
                    >
                      {TRIGGER_PAYLOAD_PREVIEW[trigger]}
                    </pre>
                  )}
                </div>
              </div>
            );
          })}

          {/* Save + Disconnect */}
          <div className="d-flex justify-content-between align-items-center mt-2">
            <button
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving || !anyConfigured}
            >
              {saving ? (
                <>
                  <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                  Saving...
                </>
              ) : (
                'Save Triggers'
              )}
            </button>

            {savedAnyConfigured && (
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
                Clear All
              </button>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">How to set up a Zap</h3>
            </div>
            <div className="card-body">
              <div className="space-y-3">
                <div className="d-flex gap-3">
                  <span className="avatar avatar-sm bg-primary-lt flex-shrink-0">1</span>
                  <div>
                    <div className="fw-medium small">Create a new Zap</div>
                    <div className="text-muted small">Go to zapier.com and click <em>Create Zap</em></div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <span className="avatar avatar-sm bg-primary-lt flex-shrink-0">2</span>
                  <div>
                    <div className="fw-medium small">Choose Webhooks by Zapier</div>
                    <div className="text-muted small">Select <em>Catch Hook</em> as the trigger event</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <span className="avatar avatar-sm bg-primary-lt flex-shrink-0">3</span>
                  <div>
                    <div className="fw-medium small">Copy the webhook URL</div>
                    <div className="text-muted small">Zapier generates a unique URL — paste it in the trigger below</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <span className="avatar avatar-sm bg-primary-lt flex-shrink-0">4</span>
                  <div>
                    <div className="fw-medium small">Save & test</div>
                    <div className="text-muted small">Click Save, then use the Test button to send a sample payload to Zapier</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <span className="avatar avatar-sm bg-primary-lt flex-shrink-0">5</span>
                  <div>
                    <div className="fw-medium small">Build your action</div>
                    <div className="text-muted small">Connect to Gmail, Salesforce, Slack, Google Sheets, or any of 5,000+ apps</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Available Triggers</h3>
            </div>
            <div className="card-body p-0">
              <div className="list-group list-group-flush">
                {TRIGGER_ORDER.map((t) => {
                  const configured = !!integration?.config?.triggers?.[t]?.webhook_url;
                  const enabled = integration?.config?.triggers?.[t]?.enabled !== false;
                  return (
                    <div key={t} className="list-group-item py-2">
                      <div className="d-flex align-items-center gap-2">
                        <span>{TRIGGER_ICONS[t]}</span>
                        <div className="flex-grow-1">
                          <div className="fw-medium small">{TRIGGER_META[t].name}</div>
                        </div>
                        {configured && enabled ? (
                          <span className="badge bg-green-lt" style={{ fontSize: '0.65rem' }}>Active</span>
                        ) : configured && !enabled ? (
                          <span className="badge bg-yellow-lt" style={{ fontSize: '0.65rem' }}>Paused</span>
                        ) : (
                          <span className="badge bg-secondary-lt" style={{ fontSize: '0.65rem' }}>Not set</span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
        .space-y-3 > * + * {
          margin-top: 0.75rem;
        }
      `}</style>
    </Layout>
  );
}
