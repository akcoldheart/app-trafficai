import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { TrafficAPI } from '@/lib/api';
import { IconArrowLeft, IconRefresh, IconTrash } from '@tabler/icons-react';

interface AudienceRecord {
  [key: string]: unknown;
}

export default function AudienceView() {
  const router = useRouter();
  const { id } = router.query;

  const [audienceName, setAudienceName] = useState('Audience');
  const [records, setRecords] = useState<AudienceRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [columns, setColumns] = useState<string[]>([]);
  const [isManual, setIsManual] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAudienceData = useCallback(async (page = 1) => {
    if (!id || typeof id !== 'string') return;

    setLoading(true);
    setCurrentPage(page);

    try {
      // Check if this is a manual audience
      if (id.startsWith('manual_')) {
        setIsManual(true);
        // Fetch from local database
        const response = await fetch(`/api/audiences/manual/${id}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load manual audience');
        }

        setAudienceName(data.name || 'Manual Audience');
        const contacts = data.contacts || [];
        setTotalRecords(contacts.length);
        setTotalPages(Math.ceil(contacts.length / pageSize));

        // Paginate locally
        const startIdx = (page - 1) * pageSize;
        const paginatedContacts = contacts.slice(startIdx, startIdx + pageSize);
        setRecords(paginatedContacts);

        // Extract columns from records - prioritize useful fields
        if (paginatedContacts.length > 0) {
          const allKeys = new Set<string>();
          paginatedContacts.forEach((record: AudienceRecord) => {
            Object.keys(record).forEach((key) => allKeys.add(key));
          });

          // Prioritize these columns in order
          const priorityColumns = [
            'first_name', 'last_name', 'full_name', 'email', 'verified_email',
            'company', 'job_title', 'phone', 'mobile_phone', 'city', 'state',
            'country', 'gender', 'linkedin_url', 'company_domain'
          ];

          const sortedColumns = Array.from(allKeys).sort((a, b) => {
            const aIndex = priorityColumns.indexOf(a);
            const bIndex = priorityColumns.indexOf(b);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.localeCompare(b);
          });

          setColumns(sortedColumns.slice(0, 12));
        }
      } else {
        setIsManual(false);
        // Fetch from external API
        const data = await TrafficAPI.getAudience(id, page, pageSize);

        setAudienceName((data as unknown as { name?: string }).name || 'Audience');
        setTotalRecords(data.total_records || 0);
        setTotalPages((data as unknown as { total_pages?: number }).total_pages || 1);

        const recordsData = (data as unknown as { Data?: AudienceRecord[] }).Data || [];
        setRecords(recordsData);

        // Extract columns from records
        if (recordsData.length > 0) {
          const allKeys = new Set<string>();
          recordsData.forEach((record) => {
            Object.keys(record).forEach((key) => allKeys.add(key));
          });
          setColumns(Array.from(allKeys).slice(0, 10));
        }
      }
    } catch (error) {
      console.error('Error loading audience:', error);
    } finally {
      setLoading(false);
    }
  }, [id, pageSize]);

  useEffect(() => {
    if (id) {
      loadAudienceData();
    }
  }, [id, loadAudienceData]);

  const handleDelete = async () => {
    if (!id || typeof id !== 'string') return;

    try {
      if (isManual) {
        // Delete manual audience by updating the request
        const response = await fetch(`/api/audiences/manual/${id}`, {
          method: 'DELETE',
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to delete audience');
        }
      } else {
        // Delete from external API
        await TrafficAPI.deleteAudience(id);
      }

      setShowDeleteModal(false);
      showToast('Audience deleted successfully', 'success');
      // Redirect after a short delay to show toast
      setTimeout(() => router.push('/audiences'), 1500);
    } catch (error) {
      showToast('Error deleting audience: ' + (error as Error).message, 'error');
    }
  };

  const formatColumnName = (name: string) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const formatCellValue = (value: unknown) => {
    if (value === null || value === undefined) return <span className="text-muted">-</span>;
    if (typeof value === 'object') {
      return <code className="small">{JSON.stringify(value).substring(0, 50)}...</code>;
    }
    if (typeof value === 'string' && value.length > 50) {
      return value.substring(0, 50) + '...';
    }
    return String(value);
  };

  const start = records.length > 0 ? (currentPage - 1) * pageSize + 1 : 0;
  const end = Math.min(currentPage * pageSize, totalRecords);

  return (
    <Layout title={audienceName} pageTitle="Audience Details">
      <div className="row row-cards">
        {/* Audience Info */}
        <div className="col-12">
          <div className="card">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  <h2 className="mb-1">{audienceName}</h2>
                  <div className="text-muted">ID: {id}</div>
                </div>
                <div className="btn-list">
                  <Link href="/audiences" className="btn btn-outline-secondary">
                    <IconArrowLeft className="icon" />
                    Back to Audiences
                  </Link>
                  <button
                    className="btn btn-outline-danger"
                    onClick={() => setShowDeleteModal(true)}
                  >
                    <IconTrash className="icon" />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Total Records</div>
              </div>
              <div className="h1 mb-0">
                {loading ? <div className="placeholder col-4"></div> : totalRecords.toLocaleString()}
              </div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Current Page</div>
              </div>
              <div className="h1 mb-0">
                {loading ? <div className="placeholder col-4"></div> : currentPage}
              </div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Page Size</div>
              </div>
              <div className="h1 mb-0">
                {loading ? <div className="placeholder col-4"></div> : pageSize}
              </div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Total Pages</div>
              </div>
              <div className="h1 mb-0">
                {loading ? <div className="placeholder col-4"></div> : totalPages}
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Audience Data</h3>
              <div className="card-actions">
                <div className="btn-list">
                  <select
                    className="form-select form-select-sm"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(parseInt(e.target.value));
                      setCurrentPage(1);
                    }}
                    style={{ width: 'auto' }}
                  >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                    <option value={500}>500 per page</option>
                  </select>
                  <button className="btn btn-sm" onClick={() => loadAudienceData(currentPage)}>
                    <IconRefresh className="icon" />
                    Refresh
                  </button>
                </div>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table table-striped">
                <thead>
                  <tr>
                    {columns.length > 0 ? (
                      columns.map((col) => <th key={col}>{formatColumnName(col)}</th>)
                    ) : (
                      <th>Loading...</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="text-center py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                        Loading audience data...
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="text-center text-muted py-4">
                        No data available for this audience
                      </td>
                    </tr>
                  ) : (
                    records.map((record, idx) => (
                      <tr key={idx}>
                        {columns.map((col) => (
                          <td key={col}>{formatCellValue(record[col])}</td>
                        ))}
                      </tr>
                    ))
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
                  <button className="page-link" onClick={() => loadAudienceData(currentPage - 1)}>
                    prev
                  </button>
                </li>
                {Array.from(
                  { length: Math.min(5, totalPages) },
                  (_, i) => Math.max(1, currentPage - 2) + i
                )
                  .filter((page) => page <= totalPages)
                  .map((page) => (
                    <li key={page} className={`page-item ${page === currentPage ? 'active' : ''}`}>
                      <button className="page-link" onClick={() => loadAudienceData(page)}>
                        {page}
                      </button>
                    </li>
                  ))}
                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                  <button className="page-link" onClick={() => loadAudienceData(currentPage + 1)}>
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
                <h3>Delete Audience?</h3>
                <div className="text-muted">
                  This action cannot be undone. All audience data will be permanently deleted.
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

      {/* Toast Notification */}
      {toast && (
        <div
          className="toast show position-fixed"
          style={{
            top: '20px',
            right: '20px',
            zIndex: 9999,
            minWidth: '300px',
          }}
        >
          <div className={`toast-header ${
            toast.type === 'success' ? 'bg-success text-white' : 'bg-danger text-white'
          }`}>
            <strong className="me-auto">
              {toast.type === 'success' ? 'Success' : 'Error'}
            </strong>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={() => setToast(null)}
            ></button>
          </div>
          <div className="toast-body">
            {toast.message}
          </div>
        </div>
      )}
    </Layout>
  );
}
