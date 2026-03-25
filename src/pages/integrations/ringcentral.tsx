import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import {
  IconArrowLeft,
  IconLoader2,
  IconCheck,
  IconAlertCircle,
  IconCircleCheck,
  IconTrash,
  IconPlus,
  IconEdit,
  IconEye,
  IconEyeOff,
  IconMessage,
  IconPhone,
  IconPlayerPlay,
  IconPlayerPause,
} from '@tabler/icons-react';
import Link from 'next/link';

interface Integration {
  id: string;
  is_connected: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
}

interface Template {
  id: string;
  pixel_id: string;
  name: string;
  message_template: string;
  is_active: boolean;
  filters: Record<string, any>;
  created_at: string;
}

interface SmsLogEntry {
  id: string;
  pixel_id: string;
  visitor_id: string;
  phone_number: string;
  message_text: string;
  status: string;
  error_message: string | null;
  created_at: string;
  sent_at: string | null;
}

interface Pixel {
  id: string;
  name: string;
  domain: string;
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

const DEFAULT_FILTERS = {
  new_visitors_only: true,
  frequency_cap_hours: 24,
  time_window_start: '09:00',
  time_window_end: '18:00',
  time_window_tz: 'America/New_York',
  min_lead_score: 0,
};

export default function RingCentralIntegrationPage() {
  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([]);
  const [fromNumber, setFromNumber] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [smsLog, setSmsLog] = useState<SmsLogEntry[]>([]);
  const [stats, setStats] = useState({ sent_today: 0, delivered_today: 0, failed_today: 0 });
  const [pixels, setPixels] = useState<Pixel[]>([]);

  // Connection form
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [tplPixelId, setTplPixelId] = useState('');
  const [tplName, setTplName] = useState('');
  const [tplMessage, setTplMessage] = useState('Hi {first_name}, thanks for visiting! Reply STOP to opt out.');
  const [tplFilters, setTplFilters] = useState(DEFAULT_FILTERS);
  const [savingTemplate, setSavingTemplate] = useState(false);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch('/api/integrations/ringcentral/status');
      const data = await resp.json();
      if (resp.ok) {
        setIntegration(data.integration || null);
        setPhoneNumbers(data.phone_numbers || []);
        setFromNumber(data.from_number || '');
        setTemplates(data.templates || []);
        setSmsLog(data.sms_log || []);
        setStats(data.stats || { sent_today: 0, delivered_today: 0, failed_today: 0 });
      }
    } catch (error) {
      console.error('Error fetching RingCentral status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchPixels = useCallback(async () => {
    try {
      const resp = await fetch('/api/pixels');
      const data = await resp.json();
      if (resp.ok && data.pixels) {
        setPixels(data.pixels);
      }
    } catch (e) {
      console.error('Error fetching pixels:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (integration?.is_connected) {
      fetchPixels();
    }
  }, [integration?.is_connected, fetchPixels]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('success') === 'true') {
      showToast('RingCentral connected successfully!', 'success');
      window.history.replaceState({}, '', '/integrations/ringcentral');
      fetchStatus();
    } else if (params.get('error')) {
      showToast(`RingCentral connection failed: ${params.get('error')}`, 'error');
      window.history.replaceState({}, '', '/integrations/ringcentral');
    }
  }, []);

  const handleFromNumberChange = async (num: string) => {
    setFromNumber(num);
    try {
      await fetch('/api/integrations/ringcentral/templates', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_number: num }),
      });
    } catch (e) {
      console.error('Error updating from number:', e);
    }
  };

  const handleSaveTemplate = async () => {
    if (!tplPixelId || !tplMessage.trim()) return;
    setSavingTemplate(true);

    try {
      const body: Record<string, any> = {
        pixel_id: tplPixelId,
        name: tplName || 'Default Template',
        message_template: tplMessage,
        is_active: true,
        filters: tplFilters,
      };
      if (editingTemplate) body.id = editingTemplate.id;

      const resp = await fetch('/api/integrations/ringcentral/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to save template');

      showToast(editingTemplate ? 'Template updated' : 'Template created', 'success');
      setShowTemplateForm(false);
      setEditingTemplate(null);
      resetTemplateForm();
      fetchStatus();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Delete this SMS template?')) return;
    try {
      await fetch('/api/integrations/ringcentral/templates', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      fetchStatus();
    } catch (error) {
      showToast('Failed to delete template', 'error');
    }
  };

  const handleToggleTemplate = async (template: Template) => {
    try {
      await fetch('/api/integrations/ringcentral/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: template.id,
          pixel_id: template.pixel_id,
          name: template.name,
          message_template: template.message_template,
          is_active: !template.is_active,
          filters: template.filters,
        }),
      });
      fetchStatus();
    } catch (error) {
      showToast('Failed to toggle template', 'error');
    }
  };

  const resetTemplateForm = () => {
    setTplPixelId('');
    setTplName('');
    setTplMessage('Hi {first_name}, thanks for visiting! Reply STOP to opt out.');
    setTplFilters(DEFAULT_FILTERS);
  };

  const startEditTemplate = (t: Template) => {
    setEditingTemplate(t);
    setTplPixelId(t.pixel_id);
    setTplName(t.name);
    setTplMessage(t.message_template);
    setTplFilters({ ...DEFAULT_FILTERS, ...(t.filters || {}) });
    setShowTemplateForm(true);
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect RingCentral? All templates will be deleted.')) return;
    setDisconnecting(true);
    try {
      const resp = await fetch('/api/integrations/ringcentral/status', { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to disconnect');
      setIntegration(null);
      setTemplates([]);
      setSmsLog([]);
      showToast('RingCentral disconnected', 'info');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <Layout title="RingCentral Integration" pageTitle="Loading...">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  const brandColor = '#F47721';

  return (
    <Layout title="RingCentral Integration" pageTitle="RingCentral" pagePretitle="Integrations">
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
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>RC</span>
                </div>
                <div>
                  <h3 className="card-title mb-0">RingCentral</h3>
                  <div className="text-muted small">Automated SMS to new pixel visitors</div>
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
                    Connect your RingCentral account to automatically send SMS to new website visitors within minutes of their visit.
                  </p>

                  <div className="mb-4 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                    <h4 className="mb-3">How to get your RingCentral API credentials</h4>
                    <ol className="mb-0" style={{ paddingLeft: '1.25rem' }}>
                      <li className="mb-2">Go to <strong>developers.ringcentral.com</strong> and sign in</li>
                      <li className="mb-2">Click <strong>"Create App"</strong> and select <strong>"REST API App"</strong></li>
                      <li className="mb-2">Set the app name (e.g. "Traffic AI SMS")</li>
                      <li className="mb-2">Under Permissions, add <strong>"SMS"</strong> and <strong>"Read Messages"</strong></li>
                      <li className="mb-2">Set OAuth Redirect URI to <strong>https://app.trafficai.io/api/integrations/ringcentral/callback</strong></li>
                      <li className="mb-2">Copy the <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                    </ol>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Client ID</label>
                    <input
                      type="text"
                      className="form-control"
                      style={{ maxWidth: 400 }}
                      placeholder="your-client-id"
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
                        placeholder="your-client-secret"
                        value={clientSecret}
                        onChange={(e) => setClientSecret(e.target.value)}
                        disabled={connecting}
                      />
                      <button className="btn btn-outline-secondary" type="button" onClick={() => setShowSecret(!showSecret)}>
                        {showSecret ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    className="btn"
                    style={{ backgroundColor: brandColor, color: '#fff', border: 'none' }}
                    disabled={!clientId.trim() || !clientSecret.trim() || connecting}
                    onClick={async () => {
                      setConnecting(true);
                      try {
                        const resp = await fetch('/api/integrations/ringcentral/connect', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ client_id: clientId.trim(), client_secret: clientSecret.trim() }),
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
                      <>
                        <IconPhone size={16} className="me-1" />
                        Connect with RingCentral
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  {/* From Number */}
                  <div className="mb-4">
                    <h4 className="mb-2">
                      <IconPhone size={18} className="me-2" />
                      Sender Phone Number
                    </h4>
                    {phoneNumbers.length > 0 ? (
                      <select
                        className="form-select"
                        style={{ maxWidth: 300 }}
                        value={fromNumber}
                        onChange={(e) => handleFromNumberChange(e.target.value)}
                      >
                        {phoneNumbers.map((num) => (
                          <option key={num} value={num}>{num}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="text-muted small">No SMS-capable phone numbers found in your RingCentral account.</div>
                    )}
                  </div>

                  <hr className="my-3" />

                  {/* SMS Templates */}
                  <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h4 className="mb-0">
                        <IconMessage size={18} className="me-2" />
                        SMS Templates
                      </h4>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => {
                          resetTemplateForm();
                          setEditingTemplate(null);
                          setShowTemplateForm(!showTemplateForm);
                        }}
                      >
                        <IconPlus size={14} className="me-1" />
                        New Template
                      </button>
                    </div>

                    {showTemplateForm && (
                      <div className="card card-body mb-3" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                        <h5 className="mb-3">{editingTemplate ? 'Edit Template' : 'New SMS Template'}</h5>

                        <div className="mb-3">
                          <label className="form-label fw-bold">Pixel</label>
                          <select
                            className="form-select"
                            style={{ maxWidth: 400 }}
                            value={tplPixelId}
                            onChange={(e) => setTplPixelId(e.target.value)}
                          >
                            <option value="">Select a pixel...</option>
                            {pixels.map((p) => (
                              <option key={p.id} value={p.id}>{p.name || p.domain}</option>
                            ))}
                          </select>
                        </div>

                        <div className="mb-3">
                          <label className="form-label fw-bold">Template Name</label>
                          <input
                            type="text"
                            className="form-control"
                            style={{ maxWidth: 400 }}
                            placeholder="e.g. Welcome SMS"
                            value={tplName}
                            onChange={(e) => setTplName(e.target.value)}
                          />
                        </div>

                        <div className="mb-3">
                          <label className="form-label fw-bold">Message</label>
                          <textarea
                            className="form-control"
                            rows={3}
                            style={{ maxWidth: 500 }}
                            value={tplMessage}
                            onChange={(e) => setTplMessage(e.target.value)}
                            placeholder="Hi {first_name}, thanks for visiting!"
                          />
                          <div className="form-hint mt-1">
                            Variables: {'{first_name}'}, {'{last_name}'}, {'{full_name}'}, {'{company}'}, {'{job_title}'}, {'{city}'}, {'{state}'}
                          </div>
                        </div>

                        <div className="row mb-3" style={{ maxWidth: 500 }}>
                          <div className="col-6">
                            <label className="form-label fw-bold">Send Window Start</label>
                            <input
                              type="time"
                              className="form-control"
                              value={tplFilters.time_window_start}
                              onChange={(e) => setTplFilters({ ...tplFilters, time_window_start: e.target.value })}
                            />
                          </div>
                          <div className="col-6">
                            <label className="form-label fw-bold">Send Window End</label>
                            <input
                              type="time"
                              className="form-control"
                              value={tplFilters.time_window_end}
                              onChange={(e) => setTplFilters({ ...tplFilters, time_window_end: e.target.value })}
                            />
                          </div>
                        </div>

                        <div className="mb-3">
                          <label className="form-label fw-bold">Timezone</label>
                          <select
                            className="form-select"
                            style={{ maxWidth: 300 }}
                            value={tplFilters.time_window_tz}
                            onChange={(e) => setTplFilters({ ...tplFilters, time_window_tz: e.target.value })}
                          >
                            <option value="America/New_York">Eastern Time</option>
                            <option value="America/Chicago">Central Time</option>
                            <option value="America/Denver">Mountain Time</option>
                            <option value="America/Los_Angeles">Pacific Time</option>
                            <option value="UTC">UTC</option>
                          </select>
                        </div>

                        <div className="mb-3">
                          <label className="form-check form-switch">
                            <input
                              type="checkbox"
                              className="form-check-input"
                              checked={tplFilters.new_visitors_only !== false}
                              onChange={(e) => setTplFilters({ ...tplFilters, new_visitors_only: e.target.checked })}
                            />
                            <span className="form-check-label">New visitors only</span>
                          </label>
                          <div className="form-hint">Only send SMS to visitors on their first visit</div>
                        </div>

                        <div className="mb-3">
                          <label className="form-label fw-bold">Frequency Cap (hours)</label>
                          <input
                            type="number"
                            className="form-control"
                            style={{ maxWidth: 150 }}
                            min={0}
                            value={tplFilters.frequency_cap_hours}
                            onChange={(e) => setTplFilters({ ...tplFilters, frequency_cap_hours: parseInt(e.target.value) || 0 })}
                          />
                          <div className="form-hint">Minimum hours between SMS to the same visitor (0 = no cap beyond daily limit)</div>
                        </div>

                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-primary"
                            onClick={handleSaveTemplate}
                            disabled={!tplPixelId || !tplMessage.trim() || savingTemplate}
                          >
                            {savingTemplate ? (
                              <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                            ) : null}
                            {editingTemplate ? 'Update Template' : 'Create Template'}
                          </button>
                          <button className="btn btn-ghost-secondary" onClick={() => { setShowTemplateForm(false); setEditingTemplate(null); }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {templates.length === 0 && !showTemplateForm ? (
                      <div className="text-muted small">No SMS templates yet. Create one to start sending automated texts.</div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-vcenter">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Pixel</th>
                              <th>Status</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {templates.map((t) => {
                              const pixel = pixels.find(p => p.id === t.pixel_id);
                              return (
                                <tr key={t.id}>
                                  <td>
                                    <div className="fw-medium">{t.name}</div>
                                    <div className="text-muted small" style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {t.message_template}
                                    </div>
                                  </td>
                                  <td className="text-muted small">{pixel?.name || pixel?.domain || t.pixel_id.slice(0, 8)}</td>
                                  <td>
                                    <span className={`badge ${t.is_active ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                                      {t.is_active ? 'Active' : 'Paused'}
                                    </span>
                                  </td>
                                  <td>
                                    <div className="d-flex gap-1">
                                      <button
                                        className="btn btn-ghost-secondary btn-sm"
                                        title={t.is_active ? 'Pause' : 'Activate'}
                                        onClick={() => handleToggleTemplate(t)}
                                      >
                                        {t.is_active ? <IconPlayerPause size={14} /> : <IconPlayerPlay size={14} />}
                                      </button>
                                      <button
                                        className="btn btn-ghost-secondary btn-sm"
                                        title="Edit"
                                        onClick={() => startEditTemplate(t)}
                                      >
                                        <IconEdit size={14} />
                                      </button>
                                      <button
                                        className="btn btn-ghost-danger btn-sm"
                                        title="Delete"
                                        onClick={() => handleDeleteTemplate(t.id)}
                                      >
                                        <IconTrash size={14} />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* SMS Log */}
                  {smsLog.length > 0 && (
                    <>
                      <hr className="my-3" />
                      <div className="mb-4">
                        <h4 className="mb-2">
                          <IconMessage size={18} className="me-2" />
                          Recent SMS Log
                        </h4>
                        <div className="table-responsive">
                          <table className="table table-vcenter">
                            <thead>
                              <tr>
                                <th>Phone</th>
                                <th>Message</th>
                                <th>Status</th>
                                <th>Time</th>
                              </tr>
                            </thead>
                            <tbody>
                              {smsLog.map((entry) => (
                                <tr key={entry.id}>
                                  <td className="text-nowrap">{entry.phone_number}</td>
                                  <td>
                                    <div style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {entry.message_text}
                                    </div>
                                  </td>
                                  <td>
                                    <span className={`badge ${
                                      entry.status === 'sent' || entry.status === 'delivered' ? 'bg-green-lt' :
                                      entry.status === 'failed' ? 'bg-red-lt' :
                                      'bg-blue-lt'
                                    }`}>
                                      {entry.status}
                                    </span>
                                    {entry.error_message && (
                                      <div className="text-danger small mt-1">{entry.error_message}</div>
                                    )}
                                  </td>
                                  <td className="text-muted small text-nowrap">
                                    {entry.sent_at
                                      ? new Date(entry.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                      : new Date(entry.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                    }
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
                      Disconnect RingCentral
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
                    <div className="fw-medium small">Connect RingCentral</div>
                    <div className="text-muted small">Enter your API credentials and authorize</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">2</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Create SMS Template</div>
                    <div className="text-muted small">Set message, pixel, and send rules per pixel</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">3</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Automatic Sending</div>
                    <div className="text-muted small">SMS sent within ~10 min of visitor arriving</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">4</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Track Results</div>
                    <div className="text-muted small">View send log and daily stats</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {integration?.is_connected && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Today's Stats</h3>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-4 text-center">
                    <div className="h2 mb-0">{stats.sent_today}</div>
                    <div className="text-muted small">Sent</div>
                  </div>
                  <div className="col-4 text-center">
                    <div className="h2 mb-0 text-green">{stats.delivered_today}</div>
                    <div className="text-muted small">Delivered</div>
                  </div>
                  <div className="col-4 text-center">
                    <div className="h2 mb-0 text-red">{stats.failed_today}</div>
                    <div className="text-muted small">Failed</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {fromNumber && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Sender Number</h3>
              </div>
              <div className="card-body">
                <div className="fw-medium">{fromNumber}</div>
                <div className="text-muted small">SMS-capable RingCentral number</div>
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
