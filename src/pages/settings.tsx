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
    }
  }, [fetchWebsites, fetchAdminSettings, fetchApiKeys, fetchAllUsers, isAdmin]);

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
    <Layout title="Settings" pageTitle="Settings" pagePretitle="Traffic AI">
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
      `}</style>
    </Layout>
  );
}
