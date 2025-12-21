import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  IconLock,
  IconArrowLeft,
  IconCheck,
  IconLoader2,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import type { Role, MenuItem } from '@/lib/supabase/types';

export default function RoleEdit() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id } = router.query;
  const isNew = id === 'new';

  const [role, setRole] = useState<Partial<Role>>({
    name: '',
    description: '',
  });
  const [allMenuItems, setAllMenuItems] = useState<MenuItem[]>([]);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRole = useCallback(async () => {
    if (!id || id === 'new') return;

    try {
      setLoading(true);
      const response = await fetch(`/api/admin/roles/${id}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch role');
      }

      setRole(data.role);
      setSelectedPermissions(data.permissions.map((p: { menu_item_id: string }) => p.menu_item_id));
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchMenuItems = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/menu-items');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch menu items');
      }

      setAllMenuItems(data.menuItems || []);
    } catch (err) {
      console.error('Error fetching menu items:', err);
    }
  }, []);

  useEffect(() => {
    // Redirect non-admin users
    if (!authLoading && userProfile && userProfile.role !== 'admin') {
      router.push('/');
      return;
    }

    if (!authLoading && userProfile?.role === 'admin' && id) {
      fetchRole();
      fetchMenuItems();
    }
  }, [authLoading, userProfile, router, id, fetchRole, fetchMenuItems]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!role.name?.trim()) {
      setError('Role name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/admin/roles' : `/api/admin/roles/${id}`;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: role.name.trim(),
          description: role.description?.trim() || null,
          permissions: selectedPermissions,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save role');
      }

      router.push('/admin/roles');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePermission = (menuItemId: string) => {
    setSelectedPermissions((prev) =>
      prev.includes(menuItemId)
        ? prev.filter((id) => id !== menuItemId)
        : [...prev, menuItemId]
    );
  };

  const selectAll = () => {
    setSelectedPermissions(allMenuItems.map((m) => m.id));
  };

  const deselectAll = () => {
    setSelectedPermissions([]);
  };

  // Show loading while checking auth
  if (authLoading || (loading && !isNew)) {
    return (
      <Layout
        title={isNew ? 'Create Role' : 'Edit Role'}
        pageTitle={isNew ? 'Create Role' : 'Edit Role'}
        pagePretitle="Admin"
      >
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
      title={isNew ? 'Create Role' : 'Edit Role'}
      pageTitle={isNew ? 'Create New Role' : `Edit Role: ${role.name}`}
      pagePretitle="Admin"
      pageActions={
        <Link href="/admin/roles" className="btn btn-outline-secondary">
          <IconArrowLeft size={16} className="me-1" />
          Back to Roles
        </Link>
      }
    >
      {error && (
        <div className="alert alert-danger mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="row">
          <div className="col-lg-8">
            {/* Role Details Card */}
            <div className="card mb-4">
              <div className="card-header">
                <h3 className="card-title">
                  <IconLock className="icon me-2" />
                  Role Details
                </h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label required">Role Name</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g., manager, viewer, editor"
                    value={role.name || ''}
                    onChange={(e) => setRole({ ...role, name: e.target.value })}
                    disabled={role.is_system}
                    required
                  />
                  {role.is_system && (
                    <small className="form-hint text-warning">
                      System role names cannot be changed
                    </small>
                  )}
                </div>
                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Describe what this role can do..."
                    value={role.description || ''}
                    onChange={(e) => setRole({ ...role, description: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Permissions Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  <IconCheck className="icon me-2" />
                  Menu Permissions
                </h3>
                <div className="card-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary me-2"
                    onClick={selectAll}
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={deselectAll}
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="card-body">
                <p className="text-muted mb-3">
                  Select which menu items this role can access. Users with this role will only see the selected items in their sidebar.
                </p>
                <div className="row">
                  {allMenuItems.map((menuItem) => (
                    <div key={menuItem.id} className="col-md-6 col-lg-4 mb-2">
                      <div
                        className={`d-flex align-items-center p-2 rounded border ${
                          selectedPermissions.includes(menuItem.id)
                            ? 'border-primary bg-primary-lt'
                            : 'border-secondary bg-white'
                        }`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => togglePermission(menuItem.id)}
                      >
                        <input
                          type="checkbox"
                          className="form-check-input me-2 m-0"
                          checked={selectedPermissions.includes(menuItem.id)}
                          onChange={() => togglePermission(menuItem.id)}
                          style={{ minWidth: '16px' }}
                        />
                        <span className={`fw-medium ${
                          selectedPermissions.includes(menuItem.id)
                            ? 'text-primary'
                            : 'text-dark'
                        }`}>
                          {menuItem.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {allMenuItems.length === 0 && (
                  <div className="text-center text-muted py-4">
                    <IconLoader2 size={24} className="mb-2" style={{ animation: 'spin 1s linear infinite' }} />
                    <p>Loading menu items...</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            {/* Summary Card */}
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">Summary</h3>
              </div>
              <div className="card-body">
                <div className="mb-3">
                  <div className="subheader">Selected Permissions</div>
                  <div className="h3 mb-0">
                    {selectedPermissions.length} / {allMenuItems.length}
                  </div>
                </div>
                <div className="mb-3">
                  <div className="subheader">Role Type</div>
                  <div>
                    {role.is_system ? (
                      <span className="badge bg-blue-lt text-blue">System Role</span>
                    ) : (
                      <span className="badge bg-purple-lt text-purple">Custom Role</span>
                    )}
                  </div>
                </div>
                {role.is_system && (
                  <div className="alert alert-info mb-3">
                    <strong>Note:</strong> System roles cannot be deleted. You can only modify their permissions.
                  </div>
                )}
              </div>
              <div className="card-footer">
                <button
                  type="submit"
                  className="btn btn-primary w-100"
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <IconDeviceFloppy size={16} className="me-1" />
                      {isNew ? 'Create Role' : 'Save Changes'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Layout>
  );
}
