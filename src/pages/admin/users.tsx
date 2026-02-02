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
  IconCalendarPlus,
  IconClock,
} from '@tabler/icons-react';
import type { Role } from '@/lib/supabase/types';

interface User {
  id: string;
  email: string;
  role: 'admin' | 'team' | 'user';
  role_id: string | null;
  plan: string | null;
  company_website: string | null;
  trial_ends_at: string | null;
  created_at: string;
  updated_at: string;
  has_api_key?: boolean;
  api_key?: string;
}

// Available subscription plans
const PLAN_OPTIONS = [
  { id: 'trial', name: 'Trial', color: 'bg-secondary-lt text-secondary' },
  { id: 'starter', name: 'Starter', color: 'bg-blue-lt text-blue' },
  { id: 'growth', name: 'Growth', color: 'bg-cyan-lt text-cyan' },
  { id: 'professional', name: 'Professional', color: 'bg-purple-lt text-purple' },
  { id: 'enterprise', name: 'Enterprise', color: 'bg-orange-lt text-orange' },
];

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
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Extend trial state
  const [extendingTrialUserId, setExtendingTrialUserId] = useState<string | null>(null);

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

  const userRole = userProfile?.role;

  useEffect(() => {
    // Redirect non-admin users
    if (!authLoading && userRole && userRole !== 'admin') {
      router.push('/');
      return;
    }

    if (!authLoading && userRole === 'admin') {
      fetchUsers();
      fetchRoles();
    }
  }, [authLoading, userRole, router, fetchUsers, fetchRoles]);

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
        u.id === userId ? { ...u, role: selectedRole.name as 'admin' | 'team' | 'user', role_id: roleId } : u
      ));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handlePlanChange = async (userId: string, plan: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/plan`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update plan');
      }

      setUsers(users.map(u =>
        u.id === userId ? { ...u, plan } : u
      ));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleExtendTrial = async (userId: string, days: number) => {
    setExtendingTrialUserId(userId);
    try {
      const response = await fetch(`/api/admin/users/${userId}/extend-trial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to extend trial');
      }

      // Update local state with new trial info
      setUsers(users.map(u =>
        u.id === userId
          ? { ...u, plan: 'trial', trial_ends_at: data.user.trial_ends_at }
          : u
      ));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setExtendingTrialUserId(null);
    }
  };

  const getTrialStatus = (user: User) => {
    if (!user.trial_ends_at || user.plan !== 'trial') return null;
    const trialEnd = new Date(user.trial_ends_at);
    const now = new Date();
    const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return {
      daysLeft,
      isExpired: daysLeft <= 0,
      endsAt: trialEnd.toLocaleDateString(),
    };
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenDeleteModal = (user: User) => {
    setUserToDelete(user);
    setDeleteConfirmText('');
    setDeleteError(null);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false);
    setUserToDelete(null);
    setDeleteConfirmText('');
    setDeleteError(null);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;

    if (deleteConfirmText !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm');
      return;
    }

    setDeletingUserId(userToDelete.id);
    setDeleteError(null);

    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}/delete`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete user');
      }

      // Remove user from local state
      setUsers(users.filter(u => u.id !== userToDelete.id));
      handleCloseDeleteModal();
    } catch (err) {
      setDeleteError((err as Error).message);
    } finally {
      setDeletingUserId(null);
    }
  };

  const filteredUsers = users.filter(user =>
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-lt text-red';
      case 'team': return 'bg-blue-lt text-blue';
      case 'user': return 'bg-green-lt text-green';
      default: return 'bg-secondary-lt';
    }
  };

  const getPlanBadgeClass = (plan: string | null) => {
    const planOption = PLAN_OPTIONS.find(p => p.id === plan);
    return planOption?.color || 'bg-secondary-lt text-secondary';
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <Layout title="Admin - Users" pageTitle="User Management">
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
                  <th>Plan</th>
                  <th>Trial Status</th>
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
                        value={user.role_id || roles.find(r => r.name === user.role)?.id || ''}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        style={{ width: '120px' }}
                      >
                        {roles.length === 0 ? (
                          <option value="">{user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Unknown'}</option>
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
                      {user.role === 'admin' || user.role === 'team' ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <select
                          className={`form-select form-select-sm ${getPlanBadgeClass(user.plan)}`}
                          value={user.plan || 'trial'}
                          onChange={(e) => handlePlanChange(user.id, e.target.value)}
                          style={{ width: '130px' }}
                        >
                          {PLAN_OPTIONS.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {user.role === 'admin' || user.role === 'team' ? (
                        <span className="text-muted">—</span>
                      ) : user.plan !== 'trial' ? (
                        <span className="text-muted">—</span>
                      ) : (() => {
                        const trialStatus = getTrialStatus(user);
                        return (
                          <div className="d-flex align-items-center gap-2">
                            {trialStatus ? (
                              <span className={`badge ${trialStatus.isExpired ? 'bg-red-lt text-red' : trialStatus.daysLeft <= 3 ? 'bg-yellow-lt text-yellow' : 'bg-green-lt text-green'}`}>
                                <IconClock size={12} className="me-1" />
                                {trialStatus.isExpired ? 'Expired' : `${trialStatus.daysLeft}d left`}
                              </span>
                            ) : (
                              <span className="text-muted small">No end date</span>
                            )}
                            <div className="dropdown">
                              <button
                                className="btn btn-sm btn-outline-primary dropdown-toggle"
                                type="button"
                                data-bs-toggle="dropdown"
                                disabled={extendingTrialUserId === user.id}
                                title="Extend Trial"
                              >
                                {extendingTrialUserId === user.id ? (
                                  <IconLoader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                ) : (
                                  <IconCalendarPlus size={14} />
                                )}
                              </button>
                              <ul className="dropdown-menu">
                                <li>
                                  <button
                                    className="dropdown-item"
                                    onClick={() => handleExtendTrial(user.id, 7)}
                                  >
                                    +7 days
                                  </button>
                                </li>
                                <li>
                                  <button
                                    className="dropdown-item"
                                    onClick={() => handleExtendTrial(user.id, 15)}
                                  >
                                    +15 days
                                  </button>
                                </li>
                              </ul>
                            </div>
                          </div>
                        );
                      })()}
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
                      <div className="btn-list flex-nowrap">
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => handleOpenApiKeyModal(user)}
                        >
                          <IconKey size={16} className="me-1" />
                          API Key
                        </button>
                        {user.role !== 'admin' && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleOpenDeleteModal(user)}
                            title="Delete user and all data"
                          >
                            <IconTrash size={16} />
                          </button>
                        )}
                      </div>
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

      {/* Delete User Modal */}
      {showDeleteModal && userToDelete && (
        <div className="modal modal-blur show d-block" tabIndex={-1} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered modal-sm">
            <div className="modal-content">
              <div className="modal-status bg-danger" />
              <div className="modal-body text-center py-4">
                <IconTrash size={48} className="text-danger mb-3" />
                <h3>Delete User</h3>
                <div className="text-muted mb-3">
                  Are you sure you want to delete <strong>{userToDelete.email}</strong>?
                </div>
                <div className="text-start mb-3">
                  <div className="alert alert-warning py-2" style={{ fontSize: '13px' }}>
                    <strong>This will permanently delete:</strong>
                    <ul className="mb-0 mt-1 ps-3">
                      <li>User account</li>
                      <li>All pixels and tracking data</li>
                      <li>All visitors data</li>
                      <li>All integrations</li>
                      <li>All API keys</li>
                    </ul>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label text-start d-block">
                    Type <strong>DELETE</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="DELETE"
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value.toUpperCase())}
                    autoFocus
                  />
                </div>
                {deleteError && (
                  <div className="alert alert-danger py-2 mb-0">
                    {deleteError}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseDeleteModal}
                  disabled={deletingUserId === userToDelete.id}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleConfirmDelete}
                  disabled={deleteConfirmText !== 'DELETE' || deletingUserId === userToDelete.id}
                >
                  {deletingUserId === userToDelete.id ? (
                    <>
                      <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <IconTrash size={16} className="me-1" />
                      Delete User
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
