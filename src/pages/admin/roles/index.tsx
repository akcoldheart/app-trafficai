import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  IconLock,
  IconPlus,
  IconEdit,
  IconTrash,
  IconLoader2,
  IconSearch,
  IconRefresh,
  IconShieldCheck,
  IconUsers,
} from '@tabler/icons-react';
import type { RoleWithUserCount } from '@/lib/supabase/types';

export default function AdminRoles() {
  const { userProfile, userRole, loading: authLoading } = useAuth();
  const router = useRouter();
  const [roles, setRoles] = useState<RoleWithUserCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/roles');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch roles');
      }

      setRoles(data.roles || []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Redirect non-admin users
    if (!authLoading && userProfile && userProfile.role !== 'admin') {
      router.push('/');
      return;
    }

    if (!authLoading && userProfile?.role === 'admin') {
      fetchRoles();
    }
  }, [authLoading, userProfile, router, fetchRoles]);

  const handleDelete = async (roleId: string, roleName: string) => {
    if (!confirm(`Are you sure you want to delete the role "${roleName}"? This action cannot be undone.`)) {
      return;
    }

    setDeleting(roleId);
    try {
      const response = await fetch(`/api/admin/roles/${roleId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete role');
      }

      setRoles(roles.filter(r => r.id !== roleId));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  const filteredRoles = roles.filter(role =>
    role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (role.description && role.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Show loading while checking auth
  if (authLoading) {
    return (
      <Layout title="Admin - Roles" pageTitle="Role Management">
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
      title="Admin - Roles"
      pageTitle="Role Management"
     
      pageActions={
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary" onClick={fetchRoles}>
            <IconRefresh size={16} className="me-1" />
            Refresh
          </button>
          <Link href="/admin/roles/new" className="btn btn-primary">
            <IconPlus size={16} className="me-1" />
            Create Role
          </Link>
        </div>
      }
    >
      {error && (
        <div className="alert alert-danger mb-4">
          {error}
          <button className="btn btn-sm btn-outline-danger ms-3" onClick={fetchRoles}>
            Retry
          </button>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <IconLock className="icon me-2" />
            All Roles ({roles.length})
          </h3>
          <div className="card-actions">
            <div className="input-group input-group-sm" style={{ width: '250px' }}>
              <span className="input-group-text">
                <IconSearch size={16} />
              </span>
              <input
                type="text"
                className="form-control"
                placeholder="Search roles..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="card-body text-center py-5">
            <IconLoader2 size={48} className="text-muted mb-3" style={{ animation: 'spin 1s linear infinite' }} />
            <p className="text-muted">Loading roles...</p>
          </div>
        ) : filteredRoles.length === 0 ? (
          <div className="card-body text-center py-5">
            <IconLock size={48} className="text-muted mb-3" />
            <h4>No roles found</h4>
            <p className="text-muted">
              {searchTerm ? 'Try a different search term' : 'Create your first custom role'}
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Description</th>
                  <th>Users</th>
                  <th>Type</th>
                  <th className="w-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRoles.map((role) => (
                  <tr key={role.id}>
                    <td>
                      <div className="d-flex align-items-center">
                        <span className={`avatar avatar-sm me-2 ${role.is_system ? 'bg-blue-lt' : 'bg-purple-lt'}`}>
                          {role.is_system ? <IconShieldCheck size={16} /> : <IconLock size={16} />}
                        </span>
                        <div>
                          <div className="fw-semibold text-capitalize">{role.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="text-muted">
                      {role.description || <span className="text-muted fst-italic">No description</span>}
                    </td>
                    <td>
                      <span className="badge bg-secondary-lt">
                        <IconUsers size={14} className="me-1" />
                        {role.user_count} user{role.user_count !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td>
                      {role.is_system ? (
                        <span className="badge bg-blue-lt text-blue">System</span>
                      ) : (
                        <span className="badge bg-purple-lt text-purple">Custom</span>
                      )}
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <Link
                          href={`/admin/roles/${role.id}`}
                          className="btn btn-sm btn-outline-primary"
                        >
                          <IconEdit size={16} />
                        </Link>
                        {!role.is_system && (
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => handleDelete(role.id, role.name)}
                            disabled={deleting === role.id || role.user_count > 0}
                            title={role.user_count > 0 ? 'Cannot delete role with assigned users' : 'Delete role'}
                          >
                            {deleting === role.id ? (
                              <IconLoader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                            ) : (
                              <IconTrash size={16} />
                            )}
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

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Layout>
  );
}
