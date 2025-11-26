import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { TrafficAPI, Audience } from '@/lib/api';
import { IconPlus, IconMoon, IconRefresh, IconTrash, IconUsers } from '@tabler/icons-react';

export default function Audiences() {
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const pageSize = 20;

  const loadAudiences = useCallback(async (page = 1) => {
    setLoading(true);
    setCurrentPage(page);

    try {
      const data = await TrafficAPI.getAudiences(page, pageSize);
      setAudiences(data.Data || []);
      setTotalRecords(data.total_records || 0);
      setTotalPages(Math.ceil((data.total_records || 0) / pageSize));
    } catch (error) {
      console.error('Error loading audiences:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAudiences();
  }, [loadAudiences]);

  const handleDelete = async () => {
    if (!deleteId) return;

    try {
      await TrafficAPI.deleteAudience(deleteId);
      setShowDeleteModal(false);
      setDeleteId(null);
      loadAudiences(currentPage);
    } catch (error) {
      alert('Error deleting audience: ' + (error as Error).message);
    }
  };

  const start = audiences.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, totalRecords);

  return (
    <Layout title="Audiences" pageTitle="Audiences" pagePretitle="Traffic AI">
      <div className="row row-cards">
        {/* Header Actions */}
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h3 className="mb-1">Manage Audiences</h3>
                  <p className="text-muted mb-0">View, create, and manage your target audiences</p>
                </div>
                <div className="btn-list">
                  <Link href="/audiences/custom" className="btn btn-outline-primary">
                    <IconMoon className="icon" />
                    Custom Audience
                  </Link>
                  <Link href="/audiences/create" className="btn btn-primary">
                    <IconPlus className="icon" />
                    Create Audience
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Audiences Table */}
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">All Audiences</h3>
              <div className="card-actions">
                <button className="btn btn-sm" onClick={() => loadAudiences(currentPage)}>
                  <IconRefresh className="icon" />
                  Refresh
                </button>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Audience ID</th>
                    <th>Total Records</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th className="w-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                        Loading audiences...
                      </td>
                    </tr>
                  ) : audiences.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">
                        No audiences found. <Link href="/audiences/create">Create your first audience</Link>
                      </td>
                    </tr>
                  ) : (
                    audiences.map((audience) => {
                      const id = audience.id || audience.audienceId || '';
                      return (
                        <tr key={id}>
                          <td>
                            <div className="d-flex align-items-center">
                              <span className="avatar avatar-sm bg-primary-lt me-2">
                                <IconUsers className="icon" />
                              </span>
                              <span className="text-reset">{audience.name || 'Unnamed Audience'}</span>
                            </div>
                          </td>
                          <td><code className="small">{id}</code></td>
                          <td>{audience.total_records?.toLocaleString() || '-'}</td>
                          <td>
                            <span className={`badge ${
                              (audience as unknown as { status?: string }).status === 'ready' ? 'bg-green' :
                              (audience as unknown as { status?: string }).status === 'processing' ? 'bg-yellow' : 'bg-blue'
                            }`}>
                              {(audience as unknown as { status?: string }).status || 'Active'}
                            </span>
                          </td>
                          <td className="text-muted">
                            {audience.created_at ? new Date(audience.created_at).toLocaleDateString() : '-'}
                          </td>
                          <td>
                            <div className="btn-list flex-nowrap">
                              <Link href={`/audiences/${id}`} className="btn btn-sm">View</Link>
                              <button
                                className="btn btn-sm btn-outline-danger"
                                onClick={() => {
                                  setDeleteId(id);
                                  setShowDeleteModal(true);
                                }}
                              >
                                <IconTrash className="icon icon-sm" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <div className="card-footer d-flex align-items-center">
              <p className="m-0 text-muted">
                Showing {start} to {end} of {totalRecords} entries
              </p>
              <ul className="pagination m-0 ms-auto">
                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => loadAudiences(currentPage - 1)}>
                    prev
                  </button>
                </li>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((page) => (
                  <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
                    <button className="page-link" onClick={() => loadAudiences(page)}>
                      {page}
                    </button>
                  </li>
                ))}
                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => loadAudiences(currentPage + 1)}>
                    next
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal modal-blur fade show" style={{ display: 'block' }} tabIndex={-1}>
          <div className="modal-dialog modal-sm modal-dialog-centered">
            <div className="modal-content">
              <button
                type="button"
                className="btn-close"
                onClick={() => setShowDeleteModal(false)}
              ></button>
              <div className="modal-status bg-danger"></div>
              <div className="modal-body text-center py-4">
                <IconTrash className="icon mb-2 text-danger icon-lg" />
                <h3>Are you sure?</h3>
                <div className="text-muted">
                  Do you really want to delete this audience? This action cannot be undone.
                </div>
              </div>
              <div className="modal-footer">
                <div className="w-100">
                  <div className="row">
                    <div className="col">
                      <button className="btn w-100" onClick={() => setShowDeleteModal(false)}>
                        Cancel
                      </button>
                    </div>
                    <div className="col">
                      <button className="btn btn-danger w-100" onClick={handleDelete}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowDeleteModal(false)}></div>
        </div>
      )}
    </Layout>
  );
}
