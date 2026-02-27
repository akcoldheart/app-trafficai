import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { TrafficAPI } from '@/lib/api';
import {
  IconArrowLeft, IconRefresh, IconTrash, IconDownload, IconEye,
  IconUser, IconMail, IconPhone, IconBuilding, IconBrandLinkedin,
  IconWorld, IconBriefcase, IconChevronRight, IconChevronLeft,
  IconX, IconExternalLink, IconLoader2
} from '@tabler/icons-react';

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
  const [isManual, setIsManual] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<AudienceRecord | null>(null);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Priority columns for detail panel display order
  const priorityColumns = [
    'first_name', 'last_name', 'full_name', 'email', 'verified_email',
    'business_email', 'company', 'job_title', 'seniority', 'department',
    'phone', 'mobile_phone', 'direct_number', 'city', 'state',
    'country', 'gender', 'age_range', 'income_range', 'linkedin_url',
    'company_domain', 'company_description', 'company_revenue', 'company_phone',
  ];

  const getSortedColumns = (record: AudienceRecord) => {
    const keys = Object.keys(record).filter(k =>
      record[k] !== null && record[k] !== undefined && record[k] !== ''
    );
    return keys.sort((a, b) => {
      const aIndex = priorityColumns.indexOf(a);
      const bIndex = priorityColumns.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const formatColumnName = (name: string) => {
    return name.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getContactName = (record: AudienceRecord) => {
    if (record.full_name) return String(record.full_name);
    const first = record.first_name ? String(record.first_name) : '';
    const last = record.last_name ? String(record.last_name) : '';
    if (first || last) return `${first} ${last}`.trim();
    return 'Unknown Contact';
  };

  const getContactSubline = (record: AudienceRecord) => {
    return String(record.email || record.company || record.job_title || '');
  };

  const loadAudienceData = useCallback(async (page = 1) => {
    if (!id || typeof id !== 'string') return;

    setLoading(true);
    setCurrentPage(page);

    try {
      if (id.startsWith('manual_')) {
        setIsManual(true);
        const response = await fetch(`/api/audiences/manual/${id}?page=${page}&limit=${pageSize}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load manual audience');
        }

        setAudienceName(data.name || 'Manual Audience');
        setTotalRecords(data.total_records || 0);
        setTotalPages(data.total_pages || 1);
        setRecords(data.contacts || []);
      } else {
        setIsManual(false);
        const data = await TrafficAPI.getAudience(id, page, pageSize);

        setAudienceName((data as unknown as { name?: string }).name || 'Audience');
        setTotalRecords(data.total_records || 0);
        setTotalPages((data as unknown as { total_pages?: number }).total_pages || 1);
        setRecords((data as unknown as { Data?: AudienceRecord[] }).Data || []);
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
        const response = await fetch(`/api/audiences/manual/${id}`, { method: 'DELETE' });
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to delete audience');
        }
      } else {
        await TrafficAPI.deleteAudience(id);
      }

      setShowDeleteModal(false);
      showToast('Audience deleted successfully', 'success');
      setTimeout(() => router.push('/audiences'), 1500);
    } catch (error) {
      showToast('Error deleting audience: ' + (error as Error).message, 'error');
    }
  };

  const handleExport = async () => {
    if (!id || typeof id !== 'string') return;

    setExporting(true);
    try {
      let allRecords: AudienceRecord[] = [];

      if (isManual) {
        const response = await fetch(`/api/audiences/manual/${id}?export=true`);
        const data = await response.json();
        if (response.ok) allRecords = data.contacts || [];
      } else {
        allRecords = records;
      }

      if (allRecords.length === 0) {
        showToast('No data to export', 'error');
        setExporting(false);
        return;
      }

      const allColumns = new Set<string>();
      allRecords.forEach((record) => Object.keys(record).forEach((key) => allColumns.add(key)));
      allColumns.delete('uuid');

      const exportPriorityColumns = [
        'full_name', 'first_name', 'last_name', 'email', 'verified_email',
        'company', 'job_title', 'phone', 'mobile_phone', 'city', 'state',
        'country', 'gender', 'age_range', 'linkedin_url', 'company_domain',
        'business_email', 'business_verified_emails', 'company_city',
        'company_revenue', 'valid_phones'
      ];

      const exportColumns = Array.from(allColumns).sort((a, b) => {
        const aIndex = exportPriorityColumns.indexOf(a);
        const bIndex = exportPriorityColumns.indexOf(b);
        if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
        if (aIndex !== -1) return -1;
        if (bIndex !== -1) return 1;
        return a.localeCompare(b);
      });

      const csvRows: string[] = [];
      csvRows.push(['"S.No."', ...exportColumns.map(col => `"${formatColumnName(col)}"`)].join(','));
      allRecords.forEach((record, index) => {
        const row = exportColumns.map((col) => {
          const value = record[col];
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
          return `"${String(value).replace(/"/g, '""')}"`;
        });
        csvRows.push([`"${index + 1}"`, ...row].join(','));
      });

      const csvContent = csvRows.join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `${audienceName.replace(/[^a-z0-9]/gi, '_')}_export.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Exported ${allRecords.length} records successfully`, 'success');
    } catch (error) {
      showToast('Error exporting data: ' + (error as Error).message, 'error');
    } finally {
      setExporting(false);
    }
  };

  // Filter records by search query
  const filteredRecords = searchQuery
    ? records.filter((record) => {
        const q = searchQuery.toLowerCase();
        return (
          String(record.full_name || '').toLowerCase().includes(q) ||
          String(record.first_name || '').toLowerCase().includes(q) ||
          String(record.last_name || '').toLowerCase().includes(q) ||
          String(record.email || '').toLowerCase().includes(q) ||
          String(record.company || '').toLowerCase().includes(q) ||
          String(record.job_title || '').toLowerCase().includes(q)
        );
      })
    : records;

  return (
    <Layout title={audienceName} pageTitle="Audience Details">
      {/* Header */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <h2 className="mb-1">{audienceName}</h2>
              <div className="text-muted small">ID: {id}</div>
            </div>
            <div className="btn-list">
              <Link href="/audiences" className="btn btn-outline-secondary">
                <IconArrowLeft className="icon" />
                Back to Audiences
              </Link>
              <button className="btn btn-outline-danger" onClick={() => setShowDeleteModal(true)}>
                <IconTrash className="icon" />
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search / Filter Bar */}
      <div className="card mb-4">
        <div className="card-body py-3">
          <div className="row g-3 align-items-end">
            <div className="col-lg-4 col-md-6">
              <label className="form-label small text-muted">Search</label>
              <input
                type="text"
                className="form-control"
                placeholder="Name, email, or company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <div className="col-lg-2 col-md-3">
              <label className="form-label small text-muted">Per Page</label>
              <select
                className="form-select"
                value={pageSize}
                onChange={(e) => {
                  setPageSize(parseInt(e.target.value));
                  setCurrentPage(1);
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={500}>500</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Contact List */}
        <div className={selectedRecord ? 'col-lg-7' : 'col-12'}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                {loading ? (
                  <span className="text-muted">Loading...</span>
                ) : (
                  <>
                    {totalRecords.toLocaleString()} Contact{totalRecords !== 1 ? 's' : ''}
                    {isManual && (
                      <span className="badge bg-purple-lt text-purple ms-2" style={{ fontSize: '12px', fontWeight: 500 }}>
                        Manual
                      </span>
                    )}
                  </>
                )}
              </h3>
              <div className="card-actions">
                <div className="btn-list">
                  <button className="btn btn-sm" onClick={handleExport} disabled={exporting}>
                    {exporting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                        Exporting...
                      </>
                    ) : (
                      <>
                        <IconDownload size={16} className="me-1" />
                        Export
                      </>
                    )}
                  </button>
                  <button className="btn btn-sm" onClick={() => loadAudienceData(currentPage)}>
                    <IconRefresh size={16} className="me-1" />
                    Refresh
                  </button>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="card-body text-center py-5">
                <IconLoader2 size={40} className="text-primary mb-3" style={{ animation: 'spin 1s linear infinite' }} />
                <p className="text-muted mb-0">Loading audience data...</p>
              </div>
            ) : filteredRecords.length === 0 ? (
              <div className="card-body text-center py-5">
                <span className="avatar avatar-xl bg-primary-lt mb-3">
                  <IconUser size={32} />
                </span>
                <h4>No contacts found</h4>
                <p className="text-muted mb-0">
                  {searchQuery ? 'Try a different search term.' : 'No data available for this audience.'}
                </p>
              </div>
            ) : (
              <>
                <div className="list-group list-group-flush list-group-hoverable">
                  {filteredRecords.map((record, idx) => {
                    const name = getContactName(record);
                    const subline = getContactSubline(record);
                    const isSelected = selectedRecord === record;

                    return (
                      <div
                        key={idx}
                        className={`list-group-item ${isSelected ? 'bg-primary-lt' : ''}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedRecord(record)}
                      >
                        <div className="row align-items-center g-3">
                          <div className="col-auto">
                            <span className="avatar" style={{ backgroundColor: record.email ? '#d4edda' : '#e9ecef', color: record.email ? '#28a745' : '#6c757d' }}>
                              <IconUser size={20} />
                            </span>
                          </div>
                          <div className="col">
                            <div className="fw-semibold">{name}</div>
                            {subline && subline !== name && (
                              <div className="text-muted small">{subline}</div>
                            )}
                          </div>
                          {record.company && (
                            <div className="col-auto d-none d-md-block">
                              <span className="text-muted small d-flex align-items-center">
                                <IconBuilding size={14} className="me-1" />
                                {String(record.company).length > 25
                                  ? String(record.company).substring(0, 25) + '...'
                                  : String(record.company)}
                              </span>
                            </div>
                          )}
                          {record.job_title && (
                            <div className="col-auto d-none d-lg-block">
                              <span className="text-muted small d-flex align-items-center">
                                <IconBriefcase size={14} className="me-1" />
                                {String(record.job_title).length > 20
                                  ? String(record.job_title).substring(0, 20) + '...'
                                  : String(record.job_title)}
                              </span>
                            </div>
                          )}
                          <div className="col-auto">
                            <IconChevronRight size={16} className="text-muted" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="card-footer d-flex align-items-center justify-content-between">
                    <p className="m-0 text-muted small">
                      Page {currentPage} of {totalPages} ({totalRecords.toLocaleString()} total)
                    </p>
                    <div className="btn-group">
                      <button
                        className="btn btn-sm"
                        disabled={currentPage === 1}
                        onClick={() => loadAudienceData(currentPage - 1)}
                      >
                        <IconChevronLeft size={16} />
                      </button>
                      <button
                        className="btn btn-sm"
                        disabled={currentPage === totalPages}
                        onClick={() => loadAudienceData(currentPage + 1)}
                      >
                        <IconChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Contact Detail Panel */}
        {selectedRecord && (
          <div className="col-lg-5">
            <div className="card sticky-top" style={{ top: '1rem' }}>
              <div className="card-header">
                <h3 className="card-title">Contact Details</h3>
                <div className="card-actions">
                  <button
                    className="btn btn-ghost-secondary btn-icon btn-sm"
                    onClick={() => setSelectedRecord(null)}
                  >
                    <IconX size={18} />
                  </button>
                </div>
              </div>
              <div className="card-body" style={{ maxHeight: 'calc(100vh - 8rem)', overflowY: 'auto' }}>
                {/* Header */}
                <div className="text-center mb-4 pb-4 border-bottom">
                  <span
                    className="avatar avatar-xl mb-3"
                    style={{
                      backgroundColor: selectedRecord.email ? '#d4edda' : '#e9ecef',
                      color: selectedRecord.email ? '#28a745' : '#6c757d'
                    }}
                  >
                    <IconUser size={32} />
                  </span>
                  <h3 className="mb-1">{getContactName(selectedRecord)}</h3>
                  {selectedRecord.job_title && (
                    <div className="text-muted mb-2">{String(selectedRecord.job_title)}</div>
                  )}
                  {selectedRecord.company && (
                    <div className="text-muted small">{String(selectedRecord.company)}</div>
                  )}
                </div>

                {/* Contact Information */}
                {(selectedRecord.email || selectedRecord.phone || selectedRecord.company || selectedRecord.linkedin_url || selectedRecord.city) && (
                  <div className="mb-4">
                    <h5 className="text-muted small text-uppercase mb-3">Contact Information</h5>
                    <div className="list-group list-group-flush">
                      {selectedRecord.email && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-primary-lt me-3">
                            <IconMail size={14} />
                          </span>
                          <a href={`mailto:${selectedRecord.email}`} className="text-reset">
                            {String(selectedRecord.email)}
                          </a>
                        </div>
                      )}
                      {selectedRecord.verified_email && selectedRecord.verified_email !== selectedRecord.email && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-success-lt me-3">
                            <IconMail size={14} />
                          </span>
                          <div>
                            <a href={`mailto:${selectedRecord.verified_email}`} className="text-reset">
                              {String(selectedRecord.verified_email)}
                            </a>
                            <span className="badge bg-success-lt text-success ms-2" style={{ fontSize: '10px' }}>Verified</span>
                          </div>
                        </div>
                      )}
                      {selectedRecord.business_email && selectedRecord.business_email !== selectedRecord.email && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-azure-lt me-3">
                            <IconMail size={14} />
                          </span>
                          <div>
                            <a href={`mailto:${selectedRecord.business_email}`} className="text-reset">
                              {String(selectedRecord.business_email)}
                            </a>
                            <span className="badge bg-azure-lt text-azure ms-2" style={{ fontSize: '10px' }}>Business</span>
                          </div>
                        </div>
                      )}
                      {(selectedRecord.phone || selectedRecord.mobile_phone) && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-teal-lt me-3">
                            <IconPhone size={14} />
                          </span>
                          <a href={`tel:${selectedRecord.phone || selectedRecord.mobile_phone}`} className="text-reset">
                            {String(selectedRecord.phone || selectedRecord.mobile_phone)}
                          </a>
                        </div>
                      )}
                      {selectedRecord.company && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-azure-lt me-3">
                            <IconBuilding size={14} />
                          </span>
                          <div>
                            {String(selectedRecord.company)}
                            {selectedRecord.company_domain && (
                              <div className="text-muted small">{String(selectedRecord.company_domain)}</div>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedRecord.job_title && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-yellow-lt me-3">
                            <IconBriefcase size={14} />
                          </span>
                          <div>
                            {String(selectedRecord.job_title)}
                            {selectedRecord.seniority && (
                              <div className="text-muted small">{String(selectedRecord.seniority)}</div>
                            )}
                          </div>
                        </div>
                      )}
                      {selectedRecord.linkedin_url && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-blue-lt me-3">
                            <IconBrandLinkedin size={14} />
                          </span>
                          <a href={String(selectedRecord.linkedin_url)} target="_blank" rel="noopener noreferrer" className="text-reset">
                            LinkedIn <IconExternalLink size={12} className="ms-1" />
                          </a>
                        </div>
                      )}
                      {(selectedRecord.city || selectedRecord.country) && (
                        <div className="list-group-item px-0 py-2 d-flex align-items-center">
                          <span className="avatar avatar-sm bg-green-lt me-3">
                            <IconWorld size={14} />
                          </span>
                          {[selectedRecord.city, selectedRecord.state, selectedRecord.country]
                            .filter(Boolean)
                            .map(String)
                            .join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* All Other Fields */}
                <div>
                  <h5 className="text-muted small text-uppercase mb-3">All Details</h5>
                  <div className="table-responsive">
                    <table className="table table-sm table-borderless">
                      <tbody>
                        {getSortedColumns(selectedRecord)
                          .filter(key => !['full_name', 'first_name', 'last_name'].includes(key))
                          .map((key) => {
                            const value = selectedRecord[key];
                            return (
                              <tr key={key}>
                                <td className="text-muted small" style={{ width: '40%' }}>
                                  {formatColumnName(key)}
                                </td>
                                <td className="small" style={{ wordBreak: 'break-word' }}>
                                  {typeof value === 'object' ? (
                                    <code className="small">{JSON.stringify(value)}</code>
                                  ) : key.includes('url') || key.includes('linkedin') ? (
                                    <a href={String(value)} target="_blank" rel="noopener noreferrer" className="text-reset">
                                      {String(value).length > 40 ? String(value).substring(0, 40) + '...' : String(value)}
                                      <IconExternalLink size={10} className="ms-1" />
                                    </a>
                                  ) : (
                                    String(value)
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal modal-blur fade show" style={{ display: 'block' }} tabIndex={-1}>
          <div className="modal-dialog modal-sm modal-dialog-centered">
            <div className="modal-content">
              <button type="button" className="btn-close" onClick={() => setShowDeleteModal(false)}></button>
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
                      <button className="btn w-100" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                    </div>
                    <div className="col">
                      <button className="btn btn-danger w-100" onClick={handleDelete}>Delete</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show" onClick={() => setShowDeleteModal(false)}></div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast show position-fixed" style={{ top: '20px', right: '20px', zIndex: 9999, minWidth: '300px' }}>
          <div className={`toast-header ${toast.type === 'success' ? 'bg-success text-white' : 'bg-danger text-white'}`}>
            <strong className="me-auto">{toast.type === 'success' ? 'Success' : 'Error'}</strong>
            <button type="button" className="btn-close btn-close-white" onClick={() => setToast(null)}></button>
          </div>
          <div className="toast-body">{toast.message}</div>
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
