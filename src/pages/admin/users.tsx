import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import {
  IconUsers,
  IconKey,
  IconCheck,
  IconX,
  IconLoader2,
  IconSearch,
  IconShieldCheck,
  IconUser,
  IconUserPlus,
  IconRefresh,
  IconEdit,
  IconTrash,
  IconCopy,
  IconEye,
  IconEyeOff,
} from '@tabler/icons-react';
import type { Role } from '@/lib/supabase/types';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'team' | 'partner';
  role_id: string | null;
  company_website: string | null;
  created_at: string;
  updated_at: string;
  has_api_key?: boolean;
  api_key?: string;
}

export default function AdminUsers() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // API Key modal state
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/users');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch users');
      }

      setUsers(data.users || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRoles = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/roles');
      const data = await response.json();

      if (response.ok) {
        setRoles(data.roles || []);
      }
    } catch (err) {
      console.error('Failed to fetch roles:', err);
    }
  }, []);

  useEffect(() => {
    // Redirect non-admin users
    if (!authLoading && userProfile && userProfile.role !== 'admin') {
      router.push('/');
      return;
    }

    if (!authLoading && userProfile?.role === 'admin') {
      fetchUsers();
      fetchRoles();
    }
  }, [authLoading, userProfile, router, fetchUsers, fetchRoles]);

  const handleOpenApiKeyModal = async (user: User) => {
    setSelectedUser(user);
    setApiKeyInput('');
    setShowApiKey(false);

    // Fetch current API key if exists
    try {
      const response = await fetch(`/api/admin/api-keys/${user.id}`);
      const data = await response.json();
      if (data && data.api_key) {
        setApiKeyInput(data.api_key);
      }
    } catch (err) {
      console.error('Error fetching API key:', err);
    }

    setShowApiKeyModal(true);
  };

  const handleSaveApiKey = async () => {
    if (!selectedUser) return;

    setSavingApiKey(true);
    try {
      const response = await fetch(`/api/admin/api-keys/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save API key');
      }

      // Update local state
      setUsers(users.map(u =>
        u.id === selectedUser.id
          ? { ...u, has_api_key: true, api_key: apiKeyInput }
          : u
      ));

      setShowApiKeyModal(false);
      setSelectedUser(null);
      setApiKeyInput('');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleRemoveApiKey = async () => {
    if (!selectedUser) return;
    if (!confirm('Are you sure you want to remove this API key?')) return;

    setSavingApiKey(true);
    try {
      const response = await fetch(`/api/admin/api-keys/${selectedUser.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to remove API key');
      }

      // Update local state
      setUsers(users.map(u =>
        u.id === selectedUser.id
          ? { ...u, has_api_key: false, api_key: undefined }
          : u
      ));

      setShowApiKeyModal(false);
      setSelectedUser(null);
      setApiKeyInput('');
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setSavingApiKey(false);
    }
  };

  const handleRoleChange = async (userId: string, roleId: string) => {
    const selectedRole = roles.find(r => r.id === roleId);
    if (!selectedRole) return;

    try {
      const response = await fetch(`/api/admin/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role_id: roleId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update role');
      }

      setUsers(users.map(u =>
        u.id === userId ? { ...u, role: selectedRole.name as 'admin' | 'team' | 'partner', role_id: roleId } : u
      ));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-lt text-red';
      case 'team': return 'bg-blue-lt text-blue';
      case 'partner': return 'bg-green-lt text-green';
      default: return 'bg-secondary-lt';
    }
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <Layout title="Admin - Users" pageTitle="User Management" pagePretitle="Admin">
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <IconLoader2 size={48} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  // Don't render if not admin
  if (!userProfile || userProfile.role !== 'admin') {
    return null;
  }

  return (
    <Layout
      title="Admin - Users"
      pageTitle="User Management"
      pagePretitle="Admin"
      pageActions={
        <button className="btn btn-outline-primary" onClick={fetchUsers}>
          <IconRefresh size={16} className="me-1" />
          Refresh
        </button>
      }
    >
      {error && (
        <div className="alert alert-danger mb-4">
          {error}
          <button className="btn btn-sm btn-outline-danger ms-3" onClick={fetchUsers}>
            Retry
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <IconUsers className="icon me-2" />
            All Users ({users.length})
          </h3>
          <div className="card-actions">
            <div className="input-group input-group-sm" style={{ width: '250px' }}>
              <span className="input-group-text">
                <IconSearch size={16} />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search by email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card-body text-center py-5">
            <IconLoader2 size={48} className="text-muted mb-3" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-muted">Loading users...</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="card-body text-center py-5">
            <IconUsers size={48} className="text-muted mb-3" />
            <h4>No users found</h4>
            <p className="text-muted">
              {searchTerm ? 'Try a different search term' : 'No users have signed up yet'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>API Key</th>
                  <th>Joined</th>
                  <th className="w-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="d-flex align-items-center">
                        <span className={`avatar avatar-sm me-2 ${user.role === 'admin' ? 'bg-red-lt' : 'bg-blue-lt'}`}>
                          {user.role === 'admin' ? <IconShieldCheck size={16} /> : <IconUser size={16} />}
                        </span>
                        <div>
                          <div className="fw-semibold">{user.email}</div>
                          {user.company_website && (
                            <div className="text-muted small">{user.company_website}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <select
                        className={`form-select form-select-sm ${getRoleBadgeClass(user.role)}`}
                        value={user.role_id || ''}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        style={{ width: '120px' }}
                      >
                        {roles.length === 0 ? (
                          <>
                            <option value="admin">Admin</option>
                            <option value="team">Team</option>
                            <option value="partner">Partner</option>
                          </>
                        ) : (
                          roles.map((role) => (
                            <option key={role.id} value={role.id}>
                              {role.name.charAt(0).toUpperCase() + role.name.slice(1)}
                            </option>
                          ))
                        )}
                      </select>
                    </td>
                    <td>
                      {user.has_api_key ? (
                        <span className="badge bg-green-lt text-green">
                          <IconCheck size={14} className="me-1" />
                          Assigned
                        </span>
                      ) : (
                        <span className="badge bg-yellow-lt text-yellow">
                          <IconX size={14} className="me-1" />
                          Not Assigned
                        </span>
                      )}
                    </td>
                    <td className="text-muted">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => handleOpenApiKeyModal(user)}
                      >
                        <IconKey size={16} className="me-1" />
                        API Key
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* API Key Modal */}
      {showApiKeyModal && selectedUser && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <IconKey className="icon me-2" />
                  Manage API Key
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowApiKeyModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">User</label>
                  <div className="form-control-plaintext">{selectedUser.email}</div>
                </div>
                <div className="mb-3">
                  <label className="form-label">Traffic AI API Key</label>
                  <div className="input-group">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      className="form-control"
                      placeholder="Enter API key from Traffic AI service"
                      value={apiKeyInput}
                      onChange={(e) => setApiKeyInput(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setShowApiKey(!showApiKey)}
                    >
                      {showApiKey ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                    {apiKeyInput && (
                      <button
                        type="button"
                        className={`btn ${copiedId === 'apiKey' ? 'btn-success' : 'btn-outline-secondary'}`}
                        onClick={() => copyToClipboard(apiKeyInput, 'apiKey')}
                      >
                        {copiedId === 'apiKey' ? <IconCheck size={16} /> : <IconCopy size={16} />}
                      </button>
                    )}
                  </div>
                  <small className="form-hint">
                    This is the API key from the Traffic AI service (v3-api-job-72802495918.us-east1.run.app)
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                {selectedUser.has_api_key && (
                  <button
                    type="button"
                    className="btn btn-outline-danger me-auto"
                    onClick={handleRemoveApiKey}
                    disabled={savingApiKey}
                  >
                    <IconTrash size={16} className="me-1" />
                    Remove Key
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowApiKeyModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleSaveApiKey}
                  disabled={!apiKeyInput || savingApiKey}
                >
                  {savingApiKey ? (
                    <>
                      <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <IconCheck size={16} className="me-1" />
                      Save API Key
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Layout>
  );
}
