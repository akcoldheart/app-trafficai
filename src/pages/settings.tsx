import { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { TrafficAPI } from '@/lib/api';
import {
  IconRefresh,
  IconShield,
  IconWorldWww,
  IconPlus,
  IconTrash,
  IconStar,
  IconStarFilled,
  IconLoader2,
  IconCheck,
  IconEdit,
  IconKey,
  IconSettings,
  IconApi,
  IconX,
  IconEye,
  IconEyeOff,
  IconCreditCard,
  IconCurrencyDollar,
  IconTrendingUp as IconGrowth,
  IconRocket,
  IconWebhook,
  IconCopy,
} from '@tabler/icons-react';
import type { UserWebsite } from '@/lib/supabase/types';

interface ApiEndpoint {
  path: string;
  description: string;
}

interface UserApiKey {
  id: string;
  user_id: string;
  api_key: string;
  created_at: string;
  updated_at: string;
  user?: { id: string; email: string; full_name: string | null };
  assigned_by_user?: { email: string };
}

interface User {
  id: string;
  email: string;
  full_name: string | null;
}

export default function Settings() {
  const { userProfile } = useAuth();
  const isAdmin = userProfile?.role === 'admin';

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

  // Admin settings state
  const [baseUrl, setBaseUrl] = useState('');
  const [editingBaseUrl, setEditingBaseUrl] = useState(false);
  const [savingBaseUrl, setSavingBaseUrl] = useState(false);
  const [endpoints, setEndpoints] = useState<ApiEndpoint[]>([]);
  const [editingEndpoints, setEditingEndpoints] = useState(false);
  const [savingEndpoints, setSavingEndpoints] = useState(false);
  const [newEndpoint, setNewEndpoint] = useState({ path: '', description: '' });

  // API Keys state
  const [apiKeys, setApiKeys] = useState<UserApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [showAddApiKey, setShowAddApiKey] = useState(false);
  const [newApiKey, setNewApiKey] = useState({ user_id: '', api_key: '' });
  const [addingApiKey, setAddingApiKey] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState<string | null>(null);
  const [editApiKeyValue, setEditApiKeyValue] = useState('');
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});

  // Stripe settings state
  const [stripeSettings, setStripeSettings] = useState({
    stripe_secret_key: '',
    stripe_webhook_secret: '',
    stripe_starter_monthly_price_id: '',
    stripe_starter_yearly_price_id: '',
    stripe_growth_monthly_price_id: '',
    stripe_growth_yearly_price_id: '',
    stripe_professional_monthly_price_id: '',
    stripe_professional_yearly_price_id: '',
    app_url: '',
  });
  const [stripeSettingsHasValue, setStripeSettingsHasValue] = useState<Record<string, boolean>>({});
  const [editingStripe, setEditingStripe] = useState(false);
  const [savingStripe, setSavingStripe] = useState(false);
  const [showStripeSecrets, setShowStripeSecrets] = useState<Record<string, boolean>>({});

  // Pricing settings state (yearly prices are effective monthly rates)
  const [pricingSettings, setPricingSettings] = useState({
    plan_starter_monthly_price: '500',
    plan_starter_yearly_price: '425',
    plan_starter_visitors: '3,000',
    plan_growth_monthly_price: '800',
    plan_growth_yearly_price: '680',
    plan_growth_visitors: '5,000',
    plan_professional_monthly_price: '1200',
    plan_professional_yearly_price: '1020',
    plan_professional_visitors: '10,000',
  });
  const [editingPricing, setEditingPricing] = useState(false);
  const [savingPricing, setSavingPricing] = useState(false);

  // Webhook API key state
  const [webhookKeyExists, setWebhookKeyExists] = useState(false);
  const [webhookKeyMasked, setWebhookKeyMasked] = useState('');
  const [webhookKeyLoading, setWebhookKeyLoading] = useState(true);
  const [generatingWebhookKey, setGeneratingWebhookKey] = useState(false);
  const [newWebhookKey, setNewWebhookKey] = useState<string | null>(null);
  const [webhookKeyCopied, setWebhookKeyCopied] = useState(false);

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

  const fetchAdminSettings = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const response = await fetch('/api/admin/settings');
      const data = await response.json();
      if (response.ok && data.settings) {
        setBaseUrl(data.settings.api_base_url?.value || '');
        try {
          setEndpoints(JSON.parse(data.settings.api_endpoints?.value || '[]'));
        } catch {
          setEndpoints([]);
        }
      }

      // Also fetch raw settings for Stripe and Pricing
      if (data.raw) {
        const stripeData: Record<string, string> = {};
        const hasValueData: Record<string, boolean> = {};
        const pricingData: Record<string, string> = {};

        data.raw.forEach((setting: { key: string; value: string; is_secret?: boolean; category?: string }) => {
          if (setting.key.startsWith('stripe_') || setting.key === 'app_url') {
            // For secret fields, show masked value if it has a value
            if (setting.is_secret && setting.value) {
              stripeData[setting.key] = '••••••••' + setting.value.slice(-4);
              hasValueData[setting.key] = true;
            } else {
              stripeData[setting.key] = setting.value || '';
              hasValueData[setting.key] = !!setting.value;
            }
          }
          // Load pricing settings
          if (setting.key.startsWith('plan_')) {
            pricingData[setting.key] = setting.value || '';
          }
        });

        setStripeSettings(prev => ({ ...prev, ...stripeData }));
        setStripeSettingsHasValue(hasValueData);
        setPricingSettings(prev => ({ ...prev, ...pricingData }));
      }
    } catch (error) {
      console.error('Error fetching admin settings:', error);
    }
  }, [isAdmin]);

  const fetchApiKeys = useCallback(async () => {
    if (!isAdmin) return;

    try {
      setApiKeysLoading(true);
      const response = await fetch('/api/admin/api-keys');
      const data = await response.json();
      if (response.ok) {
        setApiKeys(data.apiKeys || []);
      }
    } catch (error) {
      console.error('Error fetching API keys:', error);
    } finally {
      setApiKeysLoading(false);
    }
  }, [isAdmin]);

  const fetchAllUsers = useCallback(async () => {
    if (!isAdmin) return;

    try {
      const response = await fetch('/api/admin/users');
      const data = await response.json();
      if (response.ok) {
        setAllUsers(data.users || []);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  }, [isAdmin]);

  const fetchWebhookKey = useCallback(async () => {
    if (!isAdmin) return;

    try {
      setWebhookKeyLoading(true);
      const response = await fetch('/api/admin/settings/webhook-key');
      const data = await response.json();
      if (response.ok) {
        setWebhookKeyExists(data.exists);
        setWebhookKeyMasked(data.maskedKey || '');
      }
    } catch (error) {
      console.error('Error fetching webhook key:', error);
    } finally {
      setWebhookKeyLoading(false);
    }
  }, [isAdmin]);

  const handleGenerateWebhookKey = async () => {
    if (!confirm('Are you sure you want to generate a new webhook API key? This will invalidate any existing key.')) {
      return;
    }

    setGeneratingWebhookKey(true);
    setNewWebhookKey(null);

    try {
      const response = await fetch('/api/admin/settings/webhook-key', {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate webhook key');
      }

      setNewWebhookKey(data.apiKey);
      setWebhookKeyExists(true);
      setWebhookKeyMasked(data.apiKey.substring(0, 8) + '••••••••' + data.apiKey.slice(-8));
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setGeneratingWebhookKey(false);
    }
  };

  const handleCopyWebhookKey = async () => {
    if (!newWebhookKey) return;

    try {
      await navigator.clipboard.writeText(newWebhookKey);
      setWebhookKeyCopied(true);
      setTimeout(() => setWebhookKeyCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

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

  const handleSaveBaseUrl = async () => {
    setSavingBaseUrl(true);
    try {
      const response = await fetch('/api/admin/settings/api_base_url', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: baseUrl }),
      });

      if (response.ok) {
        setEditingBaseUrl(false);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to save');
      }
    } catch (error) {
      alert('Error saving base URL');
    } finally {
      setSavingBaseUrl(false);
    }
  };

  const handleSaveEndpoints = async () => {
    setSavingEndpoints(true);
    try {
      const response = await fetch('/api/admin/settings/api_endpoints', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: JSON.stringify(endpoints) }),
      });

      if (response.ok) {
        setEditingEndpoints(false);
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to save');
      }
    } catch (error) {
      alert('Error saving endpoints');
    } finally {
      setSavingEndpoints(false);
    }
  };

  const handleAddEndpoint = () => {
    if (!newEndpoint.path) return;
    setEndpoints([...endpoints, newEndpoint]);
    setNewEndpoint({ path: '', description: '' });
  };

  const handleDeleteEndpoint = (index: number) => {
    setEndpoints(endpoints.filter((_, i) => i !== index));
  };

  const handleSaveStripeSettings = async () => {
    setSavingStripe(true);
    try {
      // Validate price IDs before saving
      const priceIdFields = [
        'stripe_starter_monthly_price_id',
        'stripe_starter_yearly_price_id',
        'stripe_growth_monthly_price_id',
        'stripe_growth_yearly_price_id',
        'stripe_professional_monthly_price_id',
        'stripe_professional_yearly_price_id',
      ];

      for (const field of priceIdFields) {
        const value = stripeSettings[field as keyof typeof stripeSettings];
        if (value && !value.startsWith('••••••••') && !value.startsWith('price_')) {
          const planName = field.includes('starter') ? 'Starter' : field.includes('growth') ? 'Growth' : 'Professional';
          const period = field.includes('monthly') ? 'Monthly' : 'Yearly';
          throw new Error(
            `Invalid ${planName} ${period} Price ID: "${value}". ` +
            `Stripe Price IDs must start with "price_" (e.g., price_1ABC123xyz). ` +
            `You can find Price IDs in your Stripe Dashboard under Products > Prices.`
          );
        }
      }

      // Save each setting individually
      const settingsToSave = Object.entries(stripeSettings).filter(([key, value]) => {
        // Skip masked values (unchanged secrets)
        if (value.startsWith('••••••••')) return false;
        return true;
      });

      for (const [key, value] of settingsToSave) {
        const response = await fetch(`/api/admin/settings/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Failed to save ${key}`);
        }
      }

      setEditingStripe(false);
      fetchAdminSettings(); // Refresh to get masked values
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setSavingStripe(false);
    }
  };

  const handleSavePricingSettings = async () => {
    setSavingPricing(true);
    try {
      for (const [key, value] of Object.entries(pricingSettings)) {
        const response = await fetch(`/api/admin/settings/${key}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || `Failed to save ${key}`);
        }
      }

      setEditingPricing(false);
      fetchAdminSettings();
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setSavingPricing(false);
    }
  };

  const handleAddApiKey = async () => {
    if (!newApiKey.user_id || !newApiKey.api_key) return;

    setAddingApiKey(true);
    try {
      const response = await fetch('/api/admin/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newApiKey),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to assign API key');
      }

      setApiKeys([data.apiKey, ...apiKeys]);
      setNewApiKey({ user_id: '', api_key: '' });
      setShowAddApiKey(false);
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setAddingApiKey(false);
    }
  };

  const handleUpdateApiKey = async (userId: string, keyId: string) => {
    if (!editApiKeyValue) return;

    try {
      const response = await fetch(`/api/admin/api-keys/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: editApiKeyValue }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update API key');
      }

      setApiKeys(apiKeys.map(k => k.id === keyId ? { ...k, api_key: editApiKeyValue } : k));
      setEditingApiKeyId(null);
      setEditApiKeyValue('');
    } catch (error) {
      alert((error as Error).message);
    }
  };

  const handleDeleteApiKey = async (userId: string, keyId: string) => {
    if (!confirm('Are you sure you want to delete this API key?')) return;

    try {
      const response = await fetch(`/api/admin/api-keys/${userId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setApiKeys(apiKeys.filter(k => k.id !== keyId));
      }
    } catch (error) {
      console.error('Error deleting API key:', error);
    }
  };

  useEffect(() => {
    loadCredits();
    testConnection();
    fetchWebsites();
    if (isAdmin) {
      fetchAdminSettings();
      fetchApiKeys();
      fetchAllUsers();
      fetchWebhookKey();
    }
  }, [fetchWebsites, fetchAdminSettings, fetchApiKeys, fetchAllUsers, fetchWebhookKey, isAdmin]);

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

  const maskApiKey = (key: string) => {
    if (key.length <= 8) return '••••••••';
    return key.substring(0, 4) + '••••••••' + key.substring(key.length - 4);
  };

  // Get users without API keys for the dropdown
  const usersWithoutApiKey = allUsers.filter(
    u => !apiKeys.some(k => k.user_id === u.id)
  );

  return (
    <Layout title="Settings" pageTitle="Settings">
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

          {/* Admin: API Keys Management */}
          {isAdmin && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <IconKey className="icon me-2" />
                  User API Keys
                </h3>
                <div className="card-actions">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => setShowAddApiKey(true)}
                  >
                    <IconPlus size={16} className="me-1" />
                    Assign API Key
                  </button>
                </div>
              </div>
              <div className="card-body">
                {/* Add API Key Form */}
                {showAddApiKey && (
                  <div className="mb-4 p-3 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                    <div className="mb-3">
                      <label className="form-label">Select User</label>
                      <select
                        className="form-select"
                        value={newApiKey.user_id}
                        onChange={(e) => setNewApiKey({ ...newApiKey, user_id: e.target.value })}
                        disabled={addingApiKey}
                      >
                        <option value="">Choose a user...</option>
                        {usersWithoutApiKey.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.email} {user.full_name ? `(${user.full_name})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">API Key</label>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Enter the Traffic AI API key"
                        value={newApiKey.api_key}
                        onChange={(e) => setNewApiKey({ ...newApiKey, api_key: e.target.value })}
                        disabled={addingApiKey}
                      />
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        className="btn btn-primary"
                        onClick={handleAddApiKey}
                        disabled={!newApiKey.user_id || !newApiKey.api_key || addingApiKey}
                      >
                        {addingApiKey ? (
                          <>
                            <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                            Assigning...
                          </>
                        ) : (
                          <>
                            <IconCheck size={16} className="me-1" />
                            Assign API Key
                          </>
                        )}
                      </button>
                      <button
                        className="btn btn-outline-secondary"
                        onClick={() => {
                          setShowAddApiKey(false);
                          setNewApiKey({ user_id: '', api_key: '' });
                        }}
                        disabled={addingApiKey}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* API Keys List */}
                {apiKeysLoading ? (
                  <div className="text-center py-4">
                    <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                    <p className="text-muted mt-2 mb-0">Loading API keys...</p>
                  </div>
                ) : apiKeys.length === 0 ? (
                  <div className="text-center py-4">
                    <div className="mb-3">
                      <span className="avatar avatar-lg bg-azure-lt">
                        <IconKey size={24} className="text-azure" />
                      </span>
                    </div>
                    <h4 className="mb-2">No API keys assigned</h4>
                    <p className="text-muted mb-0">
                      Assign API keys to users to enable their API access.
                    </p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-vcenter">
                      <thead>
                        <tr>
                          <th>User</th>
                          <th>API Key</th>
                          <th>Assigned By</th>
                          <th className="w-1">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apiKeys.map((apiKey) => (
                          <tr key={apiKey.id}>
                            <td>
                              <div>{apiKey.user?.email}</div>
                              {apiKey.user?.full_name && (
                                <div className="text-muted small">{apiKey.user.full_name}</div>
                              )}
                            </td>
                            <td>
                              {editingApiKeyId === apiKey.id ? (
                                <div className="d-flex gap-2">
                                  <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    value={editApiKeyValue}
                                    onChange={(e) => setEditApiKeyValue(e.target.value)}
                                    autoFocus
                                  />
                                  <button
                                    className="btn btn-success btn-sm"
                                    onClick={() => handleUpdateApiKey(apiKey.user_id, apiKey.id)}
                                  >
                                    <IconCheck size={14} />
                                  </button>
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => {
                                      setEditingApiKeyId(null);
                                      setEditApiKeyValue('');
                                    }}
                                  >
                                    <IconX size={14} />
                                  </button>
                                </div>
                              ) : (
                                <div className="d-flex align-items-center gap-2">
                                  <code className="small">
                                    {showApiKey[apiKey.id] ? apiKey.api_key : maskApiKey(apiKey.api_key)}
                                  </code>
                                  <button
                                    className="btn btn-ghost-secondary btn-sm p-1"
                                    onClick={() => setShowApiKey({ ...showApiKey, [apiKey.id]: !showApiKey[apiKey.id] })}
                                  >
                                    {showApiKey[apiKey.id] ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="text-muted small">
                              {apiKey.assigned_by_user?.email}
                            </td>
                            <td>
                              <div className="d-flex gap-1">
                                <button
                                  className="btn btn-ghost-primary btn-sm"
                                  onClick={() => {
                                    setEditingApiKeyId(apiKey.id);
                                    setEditApiKeyValue(apiKey.api_key);
                                  }}
                                  title="Edit"
                                >
                                  <IconEdit size={14} />
                                </button>
                                <button
                                  className="btn btn-ghost-danger btn-sm"
                                  onClick={() => handleDeleteApiKey(apiKey.user_id, apiKey.id)}
                                  title="Delete"
                                >
                                  <IconTrash size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="col-lg-4">
          {/* Admin: API Configuration */}
          {isAdmin ? (
            <>
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <IconSettings className="icon me-2" />
                    API Configuration
                  </h3>
                </div>
                <div className="card-body">
                  {/* Base URL */}
                  <div className="mb-4">
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label mb-0">Base URL</label>
                      {!editingBaseUrl && (
                        <button
                          className="btn btn-ghost-primary btn-sm p-1"
                          onClick={() => setEditingBaseUrl(true)}
                        >
                          <IconEdit size={14} />
                        </button>
                      )}
                    </div>
                    {editingBaseUrl ? (
                      <div>
                        <input
                          type="url"
                          className="form-control mb-2"
                          value={baseUrl}
                          onChange={(e) => setBaseUrl(e.target.value)}
                          placeholder="https://api.example.com"
                        />
                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={handleSaveBaseUrl}
                            disabled={savingBaseUrl}
                          >
                            {savingBaseUrl ? <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} /> : <IconCheck size={14} className="me-1" />}
                            Save
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditingBaseUrl(false);
                              fetchAdminSettings();
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <code className="d-block p-2 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)', wordBreak: 'break-all' }}>
                        {baseUrl || 'Not configured'}
                      </code>
                    )}
                  </div>

                  {/* Endpoints */}
                  <div>
                    <div className="d-flex justify-content-between align-items-center mb-2">
                      <label className="form-label mb-0">API Endpoints</label>
                      {!editingEndpoints && (
                        <button
                          className="btn btn-ghost-primary btn-sm p-1"
                          onClick={() => setEditingEndpoints(true)}
                        >
                          <IconEdit size={14} />
                        </button>
                      )}
                    </div>

                    {editingEndpoints ? (
                      <div>
                        <div className="list-group mb-3">
                          {endpoints.map((ep, index) => (
                            <div key={index} className="list-group-item d-flex justify-content-between align-items-center py-2">
                              <div>
                                <code>{ep.path}</code>
                                <div className="text-muted small">{ep.description}</div>
                              </div>
                              <button
                                className="btn btn-ghost-danger btn-sm p-1"
                                onClick={() => handleDeleteEndpoint(index)}
                              >
                                <IconTrash size={14} />
                              </button>
                            </div>
                          ))}
                        </div>

                        <div className="mb-3 p-2 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                          <input
                            type="text"
                            className="form-control form-control-sm mb-2"
                            placeholder="/path"
                            value={newEndpoint.path}
                            onChange={(e) => setNewEndpoint({ ...newEndpoint, path: e.target.value })}
                          />
                          <input
                            type="text"
                            className="form-control form-control-sm mb-2"
                            placeholder="Description"
                            value={newEndpoint.description}
                            onChange={(e) => setNewEndpoint({ ...newEndpoint, description: e.target.value })}
                          />
                          <button
                            className="btn btn-outline-primary btn-sm w-100"
                            onClick={handleAddEndpoint}
                            disabled={!newEndpoint.path}
                          >
                            <IconPlus size={14} className="me-1" />
                            Add Endpoint
                          </button>
                        </div>

                        <div className="d-flex gap-2">
                          <button
                            className="btn btn-primary btn-sm"
                            onClick={handleSaveEndpoints}
                            disabled={savingEndpoints}
                          >
                            {savingEndpoints ? <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} /> : <IconCheck size={14} className="me-1" />}
                            Save Endpoints
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                              setEditingEndpoints(false);
                              fetchAdminSettings();
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <ul className="list-unstyled text-muted small mb-0">
                        {endpoints.map((ep, index) => (
                          <li key={index} className="mb-1">
                            <code>{ep.path}</code> - {ep.description}
                          </li>
                        ))}
                        {endpoints.length === 0 && (
                          <li className="text-muted">No endpoints configured</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* Webhook API Key */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <IconWebhook className="icon me-2" />
                    Webhook API Key
                  </h3>
                </div>
                <div className="card-body">
                  <p className="text-muted small mb-3">
                    Use this API key to authenticate webhook requests from identitypxl.app.
                    Send it in the <code>X-API-Key</code> header.
                  </p>

                  {webhookKeyLoading ? (
                    <div className="text-center py-3">
                      <IconLoader2 size={24} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
                    </div>
                  ) : (
                    <>
                      {newWebhookKey ? (
                        <div className="alert alert-success mb-3">
                          <div className="d-flex align-items-center justify-content-between">
                            <div>
                              <strong>New API Key Generated!</strong>
                              <p className="mb-0 small">Copy this key now. It won&apos;t be shown again.</p>
                            </div>
                          </div>
                          <div className="mt-2">
                            <div className="input-group">
                              <input
                                type="text"
                                className="form-control form-control-sm font-monospace"
                                value={newWebhookKey}
                                readOnly
                              />
                              <button
                                className="btn btn-outline-success btn-sm"
                                onClick={handleCopyWebhookKey}
                                title="Copy to clipboard"
                              >
                                {webhookKeyCopied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                {webhookKeyCopied ? ' Copied!' : ' Copy'}
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : webhookKeyExists ? (
                        <div className="mb-3">
                          <label className="form-label small text-muted">Current Key (masked)</label>
                          <code className="d-block p-2 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                            {webhookKeyMasked}
                          </code>
                        </div>
                      ) : (
                        <div className="alert alert-warning mb-3">
                          <strong>No webhook key configured.</strong>
                          <p className="mb-0 small">Generate a key to enable webhook authentication.</p>
                        </div>
                      )}

                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleGenerateWebhookKey}
                        disabled={generatingWebhookKey}
                      >
                        {generatingWebhookKey ? (
                          <>
                            <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                            Generating...
                          </>
                        ) : (
                          <>
                            <IconKey size={14} className="me-1" />
                            {webhookKeyExists ? 'Regenerate Key' : 'Generate Key'}
                          </>
                        )}
                      </button>

                      <hr className="my-3" />

                      <div className="small">
                        <strong>Webhook Endpoint:</strong>
                        <code className="d-block mt-1 p-2 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)', wordBreak: 'break-all' }}>
                          POST /api/pixel/webhook
                        </code>
                        <p className="text-muted mt-2 mb-0">
                          Configure identitypxl.app to send visitor data to this endpoint with the API key in the <code>X-API-Key</code> header.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Stripe Configuration */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <IconCreditCard className="icon me-2" />
                    Stripe Configuration
                  </h3>
                  <div className="card-actions">
                    {!editingStripe && (
                      <button
                        className="btn btn-ghost-primary btn-sm"
                        onClick={() => setEditingStripe(true)}
                      >
                        <IconEdit size={14} className="me-1" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  {editingStripe ? (
                    <div>
                      {/* App URL */}
                      <div className="mb-3">
                        <label className="form-label">Application URL</label>
                        <input
                          type="url"
                          className="form-control form-control-sm"
                          placeholder="https://app.trafficai.io"
                          value={stripeSettings.app_url}
                          onChange={(e) => setStripeSettings({ ...stripeSettings, app_url: e.target.value })}
                        />
                        <small className="text-muted">Used for Stripe redirect URLs</small>
                      </div>

                      {/* Secret Key */}
                      <div className="mb-3">
                        <label className="form-label">Secret API Key</label>
                        <div className="input-group input-group-sm">
                          <input
                            type={showStripeSecrets.secret_key ? 'text' : 'password'}
                            className="form-control"
                            placeholder="sk_live_xxx or sk_test_xxx"
                            value={stripeSettings.stripe_secret_key}
                            onChange={(e) => setStripeSettings({ ...stripeSettings, stripe_secret_key: e.target.value })}
                          />
                          <button
                            className="btn btn-outline-secondary"
                            type="button"
                            onClick={() => setShowStripeSecrets({ ...showStripeSecrets, secret_key: !showStripeSecrets.secret_key })}
                          >
                            {showStripeSecrets.secret_key ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                          </button>
                        </div>
                      </div>

                      {/* Webhook Secret */}
                      <div className="mb-3">
                        <label className="form-label">Webhook Secret</label>
                        <div className="input-group input-group-sm">
                          <input
                            type={showStripeSecrets.webhook_secret ? 'text' : 'password'}
                            className="form-control"
                            placeholder="whsec_xxx"
                            value={stripeSettings.stripe_webhook_secret}
                            onChange={(e) => setStripeSettings({ ...stripeSettings, stripe_webhook_secret: e.target.value })}
                          />
                          <button
                            className="btn btn-outline-secondary"
                            type="button"
                            onClick={() => setShowStripeSecrets({ ...showStripeSecrets, webhook_secret: !showStripeSecrets.webhook_secret })}
                          >
                            {showStripeSecrets.webhook_secret ? <IconEyeOff size={14} /> : <IconEye size={14} />}
                          </button>
                        </div>
                      </div>

                      <hr className="my-3" />
                      <h5 className="mb-2">Price IDs</h5>
                      <p className="text-muted small mb-3">
                        Enter the Stripe Price IDs from your{' '}
                        <a href="https://dashboard.stripe.com/products" target="_blank" rel="noopener noreferrer">
                          Stripe Dashboard
                        </a>
                        . Price IDs start with <code>price_</code> (e.g., <code>price_1ABC123xyz</code>).
                        Do not enter dollar amounts.
                      </p>

                      {/* Starter Plan */}
                      <div className="mb-3">
                        <label className="form-label fw-semibold">Starter Plan</label>
                        <div className="row g-2">
                          <div className="col-6">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="price_xxxxxxx (Monthly)"
                              value={stripeSettings.stripe_starter_monthly_price_id}
                              onChange={(e) => setStripeSettings({ ...stripeSettings, stripe_starter_monthly_price_id: e.target.value })}
                            />
                          </div>
                          <div className="col-6">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="price_xxxxxxx (Yearly)"
                              value={stripeSettings.stripe_starter_yearly_price_id}
                              onChange={(e) => setStripeSettings({ ...stripeSettings, stripe_starter_yearly_price_id: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Growth Plan */}
                      <div className="mb-3">
                        <label className="form-label fw-semibold">Growth Plan</label>
                        <div className="row g-2">
                          <div className="col-6">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="price_xxxxxxx (Monthly)"
                              value={stripeSettings.stripe_growth_monthly_price_id}
                              onChange={(e) => setStripeSettings({ ...stripeSettings, stripe_growth_monthly_price_id: e.target.value })}
                            />
                          </div>
                          <div className="col-6">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="price_xxxxxxx (Yearly)"
                              value={stripeSettings.stripe_growth_yearly_price_id}
                              onChange={(e) => setStripeSettings({ ...stripeSettings, stripe_growth_yearly_price_id: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Professional Plan */}
                      <div className="mb-3">
                        <label className="form-label fw-semibold">Professional Plan</label>
                        <div className="row g-2">
                          <div className="col-6">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="price_xxxxxxx (Monthly)"
                              value={stripeSettings.stripe_professional_monthly_price_id}
                              onChange={(e) => setStripeSettings({ ...stripeSettings, stripe_professional_monthly_price_id: e.target.value })}
                            />
                          </div>
                          <div className="col-6">
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              placeholder="price_xxxxxxx (Yearly)"
                              value={stripeSettings.stripe_professional_yearly_price_id}
                              onChange={(e) => setStripeSettings({ ...stripeSettings, stripe_professional_yearly_price_id: e.target.value })}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="d-flex gap-2 mt-3">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleSaveStripeSettings}
                          disabled={savingStripe}
                        >
                          {savingStripe ? (
                            <>
                              <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                              Saving...
                            </>
                          ) : (
                            <>
                              <IconCheck size={14} className="me-1" />
                              Save Settings
                            </>
                          )}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setEditingStripe(false);
                            fetchAdminSettings();
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      {/* Display current settings status */}
                      <div className="mb-2">
                        <span className="text-muted small">App URL:</span>
                        <span className="ms-2 small">{stripeSettings.app_url || 'Not configured'}</span>
                      </div>
                      <div className="mb-2">
                        <span className="text-muted small">Secret Key:</span>
                        <span className={`ms-2 badge ${stripeSettingsHasValue.stripe_secret_key ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                          {stripeSettingsHasValue.stripe_secret_key ? 'Configured' : 'Not set'}
                        </span>
                      </div>
                      <div className="mb-2">
                        <span className="text-muted small">Webhook Secret:</span>
                        <span className={`ms-2 badge ${stripeSettingsHasValue.stripe_webhook_secret ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                          {stripeSettingsHasValue.stripe_webhook_secret ? 'Configured' : 'Not set'}
                        </span>
                      </div>
                      <hr className="my-2" />
                      <div className="text-muted small mb-1">Price IDs:</div>
                      <div className="d-flex flex-wrap gap-1">
                        <span className={`badge ${stripeSettingsHasValue.stripe_starter_monthly_price_id ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                          Starter M {stripeSettingsHasValue.stripe_starter_monthly_price_id ? '✓' : '✗'}
                        </span>
                        <span className={`badge ${stripeSettingsHasValue.stripe_starter_yearly_price_id ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                          Starter Y {stripeSettingsHasValue.stripe_starter_yearly_price_id ? '✓' : '✗'}
                        </span>
                        <span className={`badge ${stripeSettingsHasValue.stripe_growth_monthly_price_id ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                          Growth M {stripeSettingsHasValue.stripe_growth_monthly_price_id ? '✓' : '✗'}
                        </span>
                        <span className={`badge ${stripeSettingsHasValue.stripe_growth_yearly_price_id ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                          Growth Y {stripeSettingsHasValue.stripe_growth_yearly_price_id ? '✓' : '✗'}
                        </span>
                        <span className={`badge ${stripeSettingsHasValue.stripe_professional_monthly_price_id ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                          Pro M {stripeSettingsHasValue.stripe_professional_monthly_price_id ? '✓' : '✗'}
                        </span>
                        <span className={`badge ${stripeSettingsHasValue.stripe_professional_yearly_price_id ? 'bg-green-lt' : 'bg-secondary-lt'}`}>
                          Pro Y {stripeSettingsHasValue.stripe_professional_yearly_price_id ? '✓' : '✗'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Plan Pricing Configuration */}
              <div className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    <IconCurrencyDollar className="icon me-2" />
                    Plan Pricing
                  </h3>
                  <div className="card-actions">
                    {!editingPricing && (
                      <button
                        className="btn btn-ghost-primary btn-sm"
                        onClick={() => setEditingPricing(true)}
                      >
                        <IconEdit size={14} className="me-1" />
                        Edit
                      </button>
                    )}
                  </div>
                </div>
                <div className="card-body">
                  {editingPricing ? (
                    <div>
                      <div className="alert alert-info mb-3 py-2">
                        <small>
                          <strong>Note:</strong> Monthly price is per month. Annual price is the effective monthly rate shown when user selects yearly billing.
                        </small>
                      </div>

                      {/* Starter Plan */}
                      <div className="border rounded p-3 mb-3">
                        <div className="d-flex align-items-center mb-2">
                          <IconStar size={18} className="text-yellow me-2" />
                          <h5 className="mb-0">Starter Plan</h5>
                        </div>
                        <div className="row g-2">
                          <div className="col-6">
                            <label className="form-label small text-muted mb-1">Monthly Price ($)</label>
                            <div className="input-group input-group-sm">
                              <span className="input-group-text">$</span>
                              <input
                                type="number"
                                className="form-control"
                                value={pricingSettings.plan_starter_monthly_price}
                                onChange={(e) => setPricingSettings({ ...pricingSettings, plan_starter_monthly_price: e.target.value })}
                              />
                              <span className="input-group-text">/mo</span>
                            </div>
                          </div>
                          <div className="col-6">
                            <label className="form-label small text-muted mb-1">Annual Rate ($)</label>
                            <div className="input-group input-group-sm">
                              <span className="input-group-text">$</span>
                              <input
                                type="number"
                                className="form-control"
                                value={pricingSettings.plan_starter_yearly_price}
                                onChange={(e) => setPricingSettings({ ...pricingSettings, plan_starter_yearly_price: e.target.value })}
                              />
                              <span className="input-group-text">/mo</span>
                            </div>
                            <small className="text-muted">
                              Yearly total: ${(parseInt(pricingSettings.plan_starter_yearly_price || '0') * 12).toLocaleString()}
                            </small>
                          </div>
                          <div className="col-12">
                            <label className="form-label small text-muted mb-1">Visitors Limit</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={pricingSettings.plan_starter_visitors}
                              onChange={(e) => setPricingSettings({ ...pricingSettings, plan_starter_visitors: e.target.value })}
                              placeholder="e.g., 3,000"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Growth Plan */}
                      <div className="border rounded p-3 mb-3 border-primary">
                        <div className="d-flex align-items-center mb-2">
                          <IconGrowth size={18} className="text-primary me-2" />
                          <h5 className="mb-0">Growth Plan</h5>
                          <span className="badge bg-primary ms-2">Popular</span>
                        </div>
                        <div className="row g-2">
                          <div className="col-6">
                            <label className="form-label small text-muted mb-1">Monthly Price ($)</label>
                            <div className="input-group input-group-sm">
                              <span className="input-group-text">$</span>
                              <input
                                type="number"
                                className="form-control"
                                value={pricingSettings.plan_growth_monthly_price}
                                onChange={(e) => setPricingSettings({ ...pricingSettings, plan_growth_monthly_price: e.target.value })}
                              />
                              <span className="input-group-text">/mo</span>
                            </div>
                          </div>
                          <div className="col-6">
                            <label className="form-label small text-muted mb-1">Annual Rate ($)</label>
                            <div className="input-group input-group-sm">
                              <span className="input-group-text">$</span>
                              <input
                                type="number"
                                className="form-control"
                                value={pricingSettings.plan_growth_yearly_price}
                                onChange={(e) => setPricingSettings({ ...pricingSettings, plan_growth_yearly_price: e.target.value })}
                              />
                              <span className="input-group-text">/mo</span>
                            </div>
                            <small className="text-muted">
                              Yearly total: ${(parseInt(pricingSettings.plan_growth_yearly_price || '0') * 12).toLocaleString()}
                            </small>
                          </div>
                          <div className="col-12">
                            <label className="form-label small text-muted mb-1">Visitors Limit</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={pricingSettings.plan_growth_visitors}
                              onChange={(e) => setPricingSettings({ ...pricingSettings, plan_growth_visitors: e.target.value })}
                              placeholder="e.g., 5,000"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Professional Plan */}
                      <div className="border rounded p-3 mb-3">
                        <div className="d-flex align-items-center mb-2">
                          <IconRocket size={18} className="text-azure me-2" />
                          <h5 className="mb-0">Professional Plan</h5>
                        </div>
                        <div className="row g-2">
                          <div className="col-6">
                            <label className="form-label small text-muted mb-1">Monthly Price ($)</label>
                            <div className="input-group input-group-sm">
                              <span className="input-group-text">$</span>
                              <input
                                type="number"
                                className="form-control"
                                value={pricingSettings.plan_professional_monthly_price}
                                onChange={(e) => setPricingSettings({ ...pricingSettings, plan_professional_monthly_price: e.target.value })}
                              />
                              <span className="input-group-text">/mo</span>
                            </div>
                          </div>
                          <div className="col-6">
                            <label className="form-label small text-muted mb-1">Annual Rate ($)</label>
                            <div className="input-group input-group-sm">
                              <span className="input-group-text">$</span>
                              <input
                                type="number"
                                className="form-control"
                                value={pricingSettings.plan_professional_yearly_price}
                                onChange={(e) => setPricingSettings({ ...pricingSettings, plan_professional_yearly_price: e.target.value })}
                              />
                              <span className="input-group-text">/mo</span>
                            </div>
                            <small className="text-muted">
                              Yearly total: ${(parseInt(pricingSettings.plan_professional_yearly_price || '0') * 12).toLocaleString()}
                            </small>
                          </div>
                          <div className="col-12">
                            <label className="form-label small text-muted mb-1">Visitors Limit</label>
                            <input
                              type="text"
                              className="form-control form-control-sm"
                              value={pricingSettings.plan_professional_visitors}
                              onChange={(e) => setPricingSettings({ ...pricingSettings, plan_professional_visitors: e.target.value })}
                              placeholder="e.g., 10,000"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="d-flex gap-2">
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={handleSavePricingSettings}
                          disabled={savingPricing}
                        >
                          {savingPricing ? (
                            <>
                              <IconLoader2 size={14} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                              Saving...
                            </>
                          ) : (
                            <>
                              <IconCheck size={14} className="me-1" />
                              Save Pricing
                            </>
                          )}
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setEditingPricing(false);
                            fetchAdminSettings();
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Starter */}
                      <div className="d-flex align-items-center p-2 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                        <span className="avatar avatar-sm bg-yellow-lt me-3">
                          <IconStar size={16} />
                        </span>
                        <div className="flex-fill">
                          <div className="fw-semibold">Starter</div>
                          <div className="text-muted small">{pricingSettings.plan_starter_visitors} visitors</div>
                        </div>
                        <div className="text-end">
                          <div className="fw-bold">${parseInt(pricingSettings.plan_starter_monthly_price || '0').toLocaleString()}<span className="text-muted fw-normal">/mo</span></div>
                          <div className="text-muted small">${parseInt(pricingSettings.plan_starter_yearly_price || '0').toLocaleString()}/mo annually</div>
                        </div>
                      </div>

                      {/* Growth */}
                      <div className="d-flex align-items-center p-2 rounded border border-primary" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                        <span className="avatar avatar-sm bg-primary me-3">
                          <IconGrowth size={16} />
                        </span>
                        <div className="flex-fill">
                          <div className="fw-semibold">Growth <span className="badge bg-primary ms-1" style={{ fontSize: '10px' }}>Popular</span></div>
                          <div className="text-muted small">{pricingSettings.plan_growth_visitors} visitors</div>
                        </div>
                        <div className="text-end">
                          <div className="fw-bold">${parseInt(pricingSettings.plan_growth_monthly_price || '0').toLocaleString()}<span className="text-muted fw-normal">/mo</span></div>
                          <div className="text-muted small">${parseInt(pricingSettings.plan_growth_yearly_price || '0').toLocaleString()}/mo annually</div>
                        </div>
                      </div>

                      {/* Professional */}
                      <div className="d-flex align-items-center p-2 rounded" style={{ backgroundColor: 'var(--tblr-bg-surface-secondary)' }}>
                        <span className="avatar avatar-sm bg-azure-lt me-3">
                          <IconRocket size={16} />
                        </span>
                        <div className="flex-fill">
                          <div className="fw-semibold">Professional</div>
                          <div className="text-muted small">{pricingSettings.plan_professional_visitors} visitors</div>
                        </div>
                        <div className="text-end">
                          <div className="fw-bold">${parseInt(pricingSettings.plan_professional_monthly_price || '0').toLocaleString()}<span className="text-muted fw-normal">/mo</span></div>
                          <div className="text-muted small">${parseInt(pricingSettings.plan_professional_yearly_price || '0').toLocaleString()}/mo annually</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="card bg-azure-lt">
                <div className="card-body">
                  <div className="d-flex">
                    <div className="me-3">
                      <IconApi className="icon icon-lg" />
                    </div>
                    <div>
                      <h4 className="mb-1">Admin Access</h4>
                      <p className="mb-0 small">
                        You have full access to configure API settings and manage user API keys.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* API Info for non-admin */}
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
            </>
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
