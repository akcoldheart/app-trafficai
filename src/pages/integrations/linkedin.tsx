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
  IconPlayerPlay,
  IconPlayerPause,
  IconUsers,
  IconEye,
  IconEyeOff,
  IconX,
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconSend,
  IconShieldLock,
  IconPlug,
} from '@tabler/icons-react';
import Link from 'next/link';

interface Integration {
  id: string;
  is_connected: boolean;
  config: Record<string, unknown>;
  last_synced_at: string | null;
}

interface Account {
  email: string;
  name: string;
}

interface Campaign {
  id: string;
  name: string;
  status: string;
  operating_hours_start: string;
  operating_hours_end: string;
  operating_timezone: string;
  daily_limit: number;
  connection_message?: string | null;
  total_sent: number;
  total_accepted: number;
  created_at: string;
  contact_stats?: {
    total: number;
    pending: number;
    sent: number;
    accepted: number;
    declined: number;
    error: number;
  };
}

interface CampaignContact {
  id: string;
  contact_email: string | null;
  linkedin_url: string | null;
  full_name: string | null;
  status: string;
  sent_at: string | null;
  responded_at: string | null;
  error_message: string | null;
}

interface SourceOption {
  id: string;
  name: string;
  type: 'pixel' | 'audience';
}

interface Toast {
  message: string;
  type: 'success' | 'error' | 'info';
}

const STATUS_BADGES: Record<string, string> = {
  active: 'bg-green-lt',
  paused: 'bg-yellow-lt',
  completed: 'bg-blue-lt',
  pending: 'bg-secondary-lt',
  sent: 'bg-blue-lt',
  accepted: 'bg-green-lt',
  declined: 'bg-red-lt',
  error: 'bg-red-lt',
};

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
];

export default function LinkedInIntegrationPage() {
  const [loading, setLoading] = useState(true);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  // Connect form
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  // New campaign form
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    source: '',
    operating_hours_start: '09:00',
    operating_hours_end: '17:00',
    operating_timezone: 'America/New_York',
    daily_limit: 25,
    connection_message: "Hi {first_name}, I came across your profile and would love to connect. I think there could be great synergy between what we do. Looking forward to connecting!",
  });
  const [creatingCampaign, setCreatingCampaign] = useState(false);

  // Campaign detail
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [campaignContacts, setCampaignContacts] = useState<Record<string, CampaignContact[]>>({});
  const [contactsLoading, setContactsLoading] = useState<string | null>(null);

  const [toast, setToast] = useState<Toast | null>(null);

  // Chrome extension
  const [extensionToken, setExtensionToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const showToast = (message: string, type: Toast['type'] = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 8000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await fetch('/api/integrations/linkedin/status');
      const data = await resp.json();
      if (resp.ok) {
        setIntegration(data.integration || null);
        setAccount(data.account || null);
      }
    } catch (error) {
      console.error('Error fetching LinkedIn status:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchCampaigns = useCallback(async () => {
    setCampaignsLoading(true);
    try {
      const resp = await fetch('/api/integrations/linkedin/campaigns');
      const data = await resp.json();
      if (resp.ok) {
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error('Error fetching campaigns:', error);
    } finally {
      setCampaignsLoading(false);
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
      console.error(e);
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
          });
        }
      }
    } catch (e) {
      console.error(e);
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
            });
          }
        }
      }
    } catch (e) {
      console.error(e);
    }

    setSources(allSources);
    setSourcesLoading(false);
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  useEffect(() => {
    if (integration?.is_connected) {
      fetchCampaigns();
      fetchSources();
    }
  }, [integration?.is_connected, fetchCampaigns, fetchSources]);

  const handleConnect = async () => {
    if (!email.trim() || !password.trim()) return;
    setConnecting(true);
    try {
      const resp = await fetch('/api/integrations/linkedin/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Failed to connect');

      setIntegration(data.integration);
      setEmail('');
      setPassword('');
      showToast('LinkedIn account connected successfully!', 'success');
      fetchStatus();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect LinkedIn? All active campaigns will be paused.')) return;
    setDisconnecting(true);
    try {
      const resp = await fetch('/api/integrations/linkedin/status', { method: 'DELETE' });
      if (!resp.ok) throw new Error('Failed to disconnect');
      setIntegration(null);
      setAccount(null);
      setCampaigns([]);
      showToast('LinkedIn disconnected', 'info');
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleCreateCampaign = async () => {
    if (!newCampaign.name.trim() || !newCampaign.source) return;
    setCreatingCampaign(true);

    const [sourceType, sourceId] = newCampaign.source.split(':');
    const body: Record<string, any> = {
      name: newCampaign.name.trim(),
      operating_hours_start: newCampaign.operating_hours_start,
      operating_hours_end: newCampaign.operating_hours_end,
      operating_timezone: newCampaign.operating_timezone,
      daily_limit: newCampaign.daily_limit,
      connection_message: newCampaign.connection_message.trim() || null,
    };
    if (sourceType === 'pixel') body.source_pixel_id = sourceId;
    else body.source_audience_id = sourceId;

    try {
      const resp = await fetch('/api/integrations/linkedin/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        const debugInfo = data.debug ? ` (${data.debug.total_contacts} contacts fetched, sample linkedin_urls: ${JSON.stringify(data.debug.sample_linkedin_urls)})` : '';
        throw new Error((data.error || 'Failed to create campaign') + debugInfo);
      }

      showToast(data.message || 'Campaign created', 'success');
      setShowNewCampaign(false);
      setNewCampaign({
        name: '',
        source: '',
        operating_hours_start: '09:00',
        operating_hours_end: '17:00',
        operating_timezone: 'America/New_York',
        daily_limit: 25,
        connection_message: "Hi {first_name}, I came across your profile and would love to connect. I think there could be great synergy between what we do. Looking forward to connecting!",
      });
      fetchCampaigns();
    } catch (error) {
      showToast((error as Error).message, 'error');
    } finally {
      setCreatingCampaign(false);
    }
  };

  const handleCampaignAction = async (campaignId: string, action: 'pause' | 'resume' | 'delete') => {
    try {
      if (action === 'delete') {
        if (!confirm('Delete this campaign? This cannot be undone.')) return;
        const resp = await fetch(`/api/integrations/linkedin/campaigns/${campaignId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Failed to delete');
        showToast('Campaign deleted', 'info');
      } else {
        const resp = await fetch(`/api/integrations/linkedin/campaigns/${campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: action === 'pause' ? 'paused' : 'active' }),
        });
        if (!resp.ok) throw new Error(`Failed to ${action}`);
        showToast(`Campaign ${action === 'pause' ? 'paused' : 'resumed'}`, 'success');
      }
      fetchCampaigns();
    } catch (error) {
      showToast((error as Error).message, 'error');
    }
  };

  const toggleCampaignExpand = async (campaignId: string) => {
    if (expandedCampaign === campaignId) {
      setExpandedCampaign(null);
      return;
    }
    setExpandedCampaign(campaignId);

    if (!campaignContacts[campaignId]) {
      setContactsLoading(campaignId);
      try {
        const resp = await fetch(`/api/integrations/linkedin/campaigns/${campaignId}`);
        const data = await resp.json();
        if (resp.ok) {
          setCampaignContacts(prev => ({ ...prev, [campaignId]: data.contacts || [] }));
        }
      } catch (error) {
        console.error('Error fetching contacts:', error);
      } finally {
        setContactsLoading(null);
      }
    }
  };

  if (loading) {
    return (
      <Layout title="LinkedIn Integration" pageTitle="Loading...">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  const liColor = '#0A66C2';

  return (
    <Layout title="LinkedIn Integration" pageTitle="LinkedIn" pagePretitle="Integrations">
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
                    background: `linear-gradient(135deg, ${liColor} 0%, ${liColor}cc 100%)`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span style={{ color: '#fff', fontWeight: 700, fontSize: 13, letterSpacing: '-0.5px' }}>in</span>
                </div>
                <div>
                  <h3 className="card-title mb-0">LinkedIn</h3>
                  <div className="text-muted small">Automated outreach & connection requests</div>
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
                    Connect your LinkedIn account to automatically send connection requests to your Traffic AI visitors.
                  </p>

                  <div className="mb-4 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                    <h4 className="mb-3">How it works</h4>
                    <ol className="mb-0" style={{ paddingLeft: '1.25rem' }}>
                      <li className="mb-2">Enter your LinkedIn login credentials below</li>
                      <li className="mb-2">Your credentials are encrypted and stored securely</li>
                      <li className="mb-2">Create a campaign from a pixel or audience source</li>
                      <li className="mb-2">Set operating hours and daily connection request limits</li>
                      <li className="mb-2">Traffic AI will drip connection requests during your set hours</li>
                    </ol>
                  </div>

                  {/* Security disclaimer */}
                  <div className="alert alert-info mb-4" style={{ borderColor: 'rgba(10,102,194,0.3)', background: 'rgba(10,102,194,0.08)' }}>
                    <div className="d-flex align-items-start gap-2">
                      <IconShieldLock size={20} className="flex-shrink-0 mt-1" />
                      <div>
                        <strong>Your credentials are secure</strong>
                        <div className="small mt-1">
                          Your LinkedIn email and password are encrypted at rest using AES-256 encryption and are only used to perform actions on your behalf. We never share your credentials with third parties.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">LinkedIn Email</label>
                    <input
                      type="email"
                      className="form-control"
                      placeholder="your@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={connecting}
                      style={{ maxWidth: 400 }}
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">LinkedIn Password</label>
                    <div className="input-group" style={{ maxWidth: 400 }}>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="form-control"
                        placeholder="Your LinkedIn password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={connecting}
                      />
                      <button
                        className="btn btn-outline-secondary"
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                      </button>
                    </div>
                  </div>

                  <button
                    className="btn"
                    style={{ backgroundColor: liColor, color: '#fff', border: 'none' }}
                    onClick={handleConnect}
                    disabled={!email.trim() || !password.trim() || connecting}
                  >
                    {connecting ? (
                      <>
                        <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <IconSend size={16} className="me-1" />
                        Connect LinkedIn
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div>
                  {/* Campaigns Section */}
                  <div className="mb-4">
                    <div className="d-flex align-items-center justify-content-between mb-3">
                      <h4 className="mb-0">
                        <IconUsers size={18} className="me-2" />
                        Campaigns
                      </h4>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => setShowNewCampaign(!showNewCampaign)}
                      >
                        {showNewCampaign ? (
                          <><IconX size={14} className="me-1" /> Cancel</>
                        ) : (
                          <><IconPlus size={14} className="me-1" /> New Campaign</>
                        )}
                      </button>
                    </div>

                    {/* New Campaign Form */}
                    {showNewCampaign && (
                      <div className="card mb-3" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                        <div className="card-body">
                          <h4 className="mb-3">Create Campaign</h4>

                          <div className="mb-3">
                            <label className="form-label fw-bold">Campaign Name</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="e.g. Q1 Website Visitors Outreach"
                              value={newCampaign.name}
                              onChange={(e) => setNewCampaign(prev => ({ ...prev, name: e.target.value }))}
                              disabled={creatingCampaign}
                            />
                          </div>

                          <div className="mb-3">
                            <label className="form-label fw-bold">Source (contacts with LinkedIn URLs)</label>
                            {sourcesLoading ? (
                              <div className="d-flex align-items-center text-muted">
                                <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                                Loading sources...
                              </div>
                            ) : (
                              <select
                                className="form-select"
                                value={newCampaign.source}
                                onChange={(e) => setNewCampaign(prev => ({ ...prev, source: e.target.value }))}
                                disabled={creatingCampaign}
                              >
                                <option value="">Select a pixel or audience...</option>
                                {sources.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            )}
                            <div className="form-hint mt-1">Only contacts with a LinkedIn URL will be included.</div>
                          </div>

                          <div className="row mb-3">
                            <div className="col-md-4">
                              <label className="form-label fw-bold">Start Time</label>
                              <input
                                type="time"
                                className="form-control"
                                value={newCampaign.operating_hours_start}
                                onChange={(e) => setNewCampaign(prev => ({ ...prev, operating_hours_start: e.target.value }))}
                                disabled={creatingCampaign}
                              />
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-bold">End Time</label>
                              <input
                                type="time"
                                className="form-control"
                                value={newCampaign.operating_hours_end}
                                onChange={(e) => setNewCampaign(prev => ({ ...prev, operating_hours_end: e.target.value }))}
                                disabled={creatingCampaign}
                              />
                            </div>
                            <div className="col-md-4">
                              <label className="form-label fw-bold">Timezone</label>
                              <select
                                className="form-select"
                                value={newCampaign.operating_timezone}
                                onChange={(e) => setNewCampaign(prev => ({ ...prev, operating_timezone: e.target.value }))}
                                disabled={creatingCampaign}
                              >
                                {TIMEZONES.map(tz => (
                                  <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                                ))}
                              </select>
                            </div>
                          </div>

                          <div className="mb-3">
                            <label className="form-label fw-bold">Daily Limit (max 30)</label>
                            <input
                              type="number"
                              className="form-control"
                              style={{ maxWidth: 120 }}
                              min={1}
                              max={30}
                              value={newCampaign.daily_limit}
                              onChange={(e) => setNewCampaign(prev => ({ ...prev, daily_limit: Math.min(30, parseInt(e.target.value) || 1) }))}
                              disabled={creatingCampaign}
                            />
                            <div className="form-hint mt-1">Connection requests sent per day. Keep under 30 for safety.</div>
                          </div>

                          <div className="mb-3">
                            <label className="form-label fw-bold">Connection Message (optional)</label>
                            <textarea
                              className="form-control"
                              rows={4}
                              placeholder="Hi {first_name}, I'd love to connect..."
                              value={newCampaign.connection_message}
                              onChange={(e) => setNewCampaign(prev => ({ ...prev, connection_message: e.target.value }))}
                              disabled={creatingCampaign}
                              maxLength={300}
                            />
                            <div className="form-hint mt-1">
                              Max 300 characters. Variables: {'{first_name}'}, {'{last_name}'}, {'{company}'}, {'{job_title}'}. Leave empty for no message.
                            </div>
                          </div>

                          <button
                            className="btn btn-primary"
                            onClick={handleCreateCampaign}
                            disabled={!newCampaign.name.trim() || !newCampaign.source || creatingCampaign}
                          >
                            {creatingCampaign ? (
                              <>
                                <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                                Creating...
                              </>
                            ) : (
                              <>
                                <IconPlus size={16} className="me-1" />
                                Create Campaign
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Campaign List */}
                    {campaignsLoading ? (
                      <div className="d-flex align-items-center text-muted py-3">
                        <IconLoader2 size={16} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                        Loading campaigns...
                      </div>
                    ) : campaigns.length === 0 ? (
                      <div className="text-muted py-3">
                        No campaigns yet. Create one to start sending connection requests.
                      </div>
                    ) : (
                      <div className="list-group">
                        {campaigns.map((campaign) => {
                          const stats = campaign.contact_stats || { total: 0, pending: 0, sent: 0, accepted: 0, declined: 0, error: 0 };
                          const progress = stats.total > 0 ? ((stats.sent + stats.accepted + stats.declined) / stats.total * 100) : 0;
                          const acceptRate = (stats.sent + stats.accepted) > 0 ? (stats.accepted / (stats.sent + stats.accepted) * 100) : 0;
                          const isExpanded = expandedCampaign === campaign.id;

                          return (
                            <div key={campaign.id} className="list-group-item p-0">
                              {/* Campaign row */}
                              <div
                                className="d-flex align-items-center justify-content-between p-3"
                                style={{ cursor: 'pointer' }}
                                onClick={() => toggleCampaignExpand(campaign.id)}
                              >
                                <div className="d-flex align-items-center gap-3" style={{ flex: 1, minWidth: 0 }}>
                                  {isExpanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                                  <div style={{ minWidth: 0 }}>
                                    <div className="fw-medium" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {campaign.name}
                                    </div>
                                    <div className="text-muted small d-flex align-items-center gap-2">
                                      <span className={`badge ${STATUS_BADGES[campaign.status] || 'bg-secondary-lt'}`}>
                                        {campaign.status}
                                      </span>
                                      <span>
                                        <IconClock size={12} className="me-1" />
                                        {campaign.operating_hours_start}–{campaign.operating_hours_end}
                                      </span>
                                      <span>{stats.sent + stats.accepted}/{stats.total} sent</span>
                                      {acceptRate > 0 && <span>{acceptRate.toFixed(0)}% accepted</span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="d-flex gap-1" onClick={(e) => e.stopPropagation()}>
                                  {campaign.status === 'active' ? (
                                    <button
                                      className="btn btn-ghost-warning btn-icon btn-sm"
                                      title="Pause"
                                      onClick={() => handleCampaignAction(campaign.id, 'pause')}
                                    >
                                      <IconPlayerPause size={16} />
                                    </button>
                                  ) : campaign.status === 'paused' ? (
                                    <button
                                      className="btn btn-ghost-success btn-icon btn-sm"
                                      title="Resume"
                                      onClick={() => handleCampaignAction(campaign.id, 'resume')}
                                    >
                                      <IconPlayerPlay size={16} />
                                    </button>
                                  ) : null}
                                  <button
                                    className="btn btn-ghost-danger btn-icon btn-sm"
                                    title="Delete"
                                    onClick={() => handleCampaignAction(campaign.id, 'delete')}
                                  >
                                    <IconTrash size={16} />
                                  </button>
                                </div>
                              </div>

                              {/* Progress bar */}
                              {stats.total > 0 && (
                                <div style={{ padding: '0 12px 8px' }}>
                                  <div className="progress" style={{ height: 4 }}>
                                    <div className="progress-bar bg-green" style={{ width: `${(stats.accepted / stats.total) * 100}%` }} />
                                    <div className="progress-bar bg-blue" style={{ width: `${(stats.sent / stats.total) * 100}%` }} />
                                    <div className="progress-bar bg-red" style={{ width: `${((stats.declined + stats.error) / stats.total) * 100}%` }} />
                                  </div>
                                </div>
                              )}

                              {/* Expanded: contact list */}
                              {isExpanded && (
                                <div style={{ borderTop: '1px solid var(--tblr-border-color)', padding: 12 }}>
                                  {contactsLoading === campaign.id ? (
                                    <div className="d-flex align-items-center text-muted py-2">
                                      <IconLoader2 size={14} className="me-2" style={{ animation: 'spin 1s linear infinite' }} />
                                      Loading contacts...
                                    </div>
                                  ) : (campaignContacts[campaign.id] || []).length === 0 ? (
                                    <div className="text-muted small py-2">No contacts in this campaign.</div>
                                  ) : (
                                    <div className="table-responsive">
                                      <table className="table table-sm table-vcenter mb-0">
                                        <thead>
                                          <tr>
                                            <th>Name</th>
                                            <th>LinkedIn</th>
                                            <th>Status</th>
                                            <th>Sent</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {(campaignContacts[campaign.id] || []).slice(0, 50).map((contact) => (
                                            <tr key={contact.id}>
                                              <td className="small">{contact.full_name || '—'}</td>
                                              <td className="small">
                                                {contact.linkedin_url ? (
                                                  <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-blue">
                                                    Profile
                                                  </a>
                                                ) : '—'}
                                              </td>
                                              <td>
                                                <span className={`badge ${STATUS_BADGES[contact.status] || 'bg-secondary-lt'}`}>
                                                  {contact.status}
                                                </span>
                                              </td>
                                              <td className="text-muted small">
                                                {contact.sent_at ? new Date(contact.sent_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                      {(campaignContacts[campaign.id] || []).length > 50 && (
                                        <div className="text-muted small text-center py-2">
                                          Showing 50 of {campaignContacts[campaign.id].length} contacts
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Chrome Extension Section */}
                  <hr className="my-3" />
                  <div className="mb-4">
                    <h4 className="mb-2">
                      <IconPlug size={18} className="me-2" />
                      Chrome Extension
                    </h4>
                    <p className="text-muted small mb-3">
                      Install the Traffic AI Chrome extension to send LinkedIn connection requests from your browser.
                      The extension uses your real LinkedIn session for maximum safety.
                    </p>

                    {extensionToken ? (
                      <div className="mb-3">
                        <label className="form-label fw-bold">Extension Token</label>
                        <div className="input-group" style={{ maxWidth: 500 }}>
                          <input
                            type={showToken ? 'text' : 'password'}
                            className="form-control form-control-sm"
                            value={extensionToken}
                            readOnly
                          />
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => setShowToken(!showToken)}
                          >
                            {showToken ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                          </button>
                          <button
                            className="btn btn-outline-secondary btn-sm"
                            onClick={() => {
                              navigator.clipboard.writeText(extensionToken);
                              showToast('Token copied to clipboard', 'success');
                            }}
                          >
                            Copy
                          </button>
                        </div>
                        <div className="form-hint mt-1">Paste this token in the Chrome extension to connect.</div>
                      </div>
                    ) : null}

                    <button
                      className="btn btn-outline-primary btn-sm"
                      onClick={async () => {
                        setGeneratingToken(true);
                        try {
                          const resp = await fetch('/api/integrations/linkedin/extension/token', {
                            method: 'POST',
                          });
                          const data = await resp.json();
                          if (!resp.ok) throw new Error(data.error || 'Failed to generate token');
                          setExtensionToken(data.token);
                          setShowToken(true);
                          showToast('Extension token generated! Copy it and paste in the Chrome extension.', 'success');
                        } catch (error) {
                          showToast((error as Error).message, 'error');
                        } finally {
                          setGeneratingToken(false);
                        }
                      }}
                      disabled={generatingToken}
                    >
                      {generatingToken ? (
                        <><IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} /> Generating...</>
                      ) : extensionToken ? (
                        'Regenerate Token'
                      ) : (
                        'Generate Extension Token'
                      )}
                    </button>
                  </div>

                  <hr className="my-3" />

                  {/* Account & Disconnect */}
                  <div className="d-flex justify-content-between align-items-center">
                    {account && (
                      <div className="text-muted small">
                        Connected as <strong>{account.name || account.email}</strong>
                      </div>
                    )}
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
                      Disconnect LinkedIn
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
                    <div className="fw-medium small">Connect LinkedIn</div>
                    <div className="text-muted small">Enter your LinkedIn credentials (encrypted)</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">2</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Create a Campaign</div>
                    <div className="text-muted small">Select contacts with LinkedIn URLs from a pixel or audience</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">3</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Set Schedule</div>
                    <div className="text-muted small">Configure operating hours and daily limits</div>
                  </div>
                </div>
                <div className="d-flex gap-3">
                  <div className="flex-shrink-0">
                    <span className="avatar avatar-sm bg-primary-lt">4</span>
                  </div>
                  <div>
                    <div className="fw-medium small">Automatic Drip</div>
                    <div className="text-muted small">Requests are sent organically during your set hours</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {account && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Account</h3>
              </div>
              <div className="card-body">
                <div className="mb-2">
                  <div className="text-muted small">Name</div>
                  <div className="fw-medium">{account.name || '—'}</div>
                </div>
                <div className="mb-2">
                  <div className="text-muted small">Email</div>
                  <div className="fw-medium">{account.email}</div>
                </div>
                <div>
                  <div className="text-muted small">Status</div>
                  <span className="badge bg-green-lt">Connected</span>
                </div>
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
