import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import {
  IconShoppingCart,
  IconLoader2,
  IconSearch,
  IconExternalLink,
  IconUser,
  IconAddressBook,
  IconCircleCheck,
  IconCircleDashed,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';

interface MatchedPerson {
  id: string;
  full_name: string | null;
  email: string | null;
  company: string | null;
}

interface Conversion {
  id: string;
  pixel_id: string;
  platform: string;
  external_order_number: string | null;
  order_url: string | null;
  customer_email: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  total_price: number | null;
  currency: string | null;
  financial_status: string | null;
  ordered_at: string;
  matched_visitor_id: string | null;
  matched_contact_id: string | null;
  match_method: 'email' | 'phone' | 'unmatched' | null;
  identified_before_order: boolean | null;
  matched_visitor: MatchedPerson | null;
  matched_contact: MatchedPerson | null;
}

interface Pixel {
  id: string;
  name: string;
  domain: string | null;
}

export default function ConversionsPage() {
  const [conversions, setConversions] = useState<Conversion[]>([]);
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Filters
  const [pixelFilter, setPixelFilter] = useState<string>('');
  const [matchFilter, setMatchFilter] = useState<string>('');
  const [daysFilter, setDaysFilter] = useState<string>('30');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const loadConversions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page), days: daysFilter });
      if (pixelFilter) params.set('pixel_id', pixelFilter);
      if (matchFilter) params.set('match_status', matchFilter);
      if (search) params.set('search', search);

      const response = await fetch(`/api/conversions?${params.toString()}`);
      const data = await response.json();
      if (response.ok) {
        setConversions(data.conversions || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotal(data.pagination?.total || 0);
      }
    } catch (e) {
      console.error('Error loading conversions:', e);
    } finally {
      setLoading(false);
    }
  }, [page, daysFilter, pixelFilter, matchFilter, search]);

  const loadPixels = useCallback(async () => {
    try {
      const response = await fetch('/api/pixels');
      const data = await response.json();
      if (response.ok && Array.isArray(data.pixels)) {
        setPixels(data.pixels.map((p: Record<string, unknown>) => ({
          id: p.id as string,
          name: (p.name as string) || (p.domain as string) || 'Unnamed pixel',
          domain: p.domain as string | null,
        })));
      }
    } catch (e) {
      console.error('Error loading pixels:', e);
    }
  }, []);

  useEffect(() => { loadPixels(); }, [loadPixels]);
  useEffect(() => { loadConversions(); }, [loadConversions]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const formatMoney = (value: number | null, currency: string | null) => {
    if (value == null) return '—';
    return value.toLocaleString(undefined, {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const renderMatchedTo = (c: Conversion) => {
    if (c.matched_visitor) {
      return (
        <div className="d-flex align-items-center">
          <IconUser size={14} className="me-1 text-success" />
          <div>
            <div className="small fw-medium">{c.matched_visitor.full_name || c.matched_visitor.email || 'Visitor'}</div>
            {c.matched_visitor.company && (
              <div className="text-muted" style={{ fontSize: 11 }}>{c.matched_visitor.company}</div>
            )}
          </div>
        </div>
      );
    }
    if (c.matched_contact) {
      return (
        <div className="d-flex align-items-center">
          <IconAddressBook size={14} className="me-1 text-info" />
          <div>
            <div className="small fw-medium">{c.matched_contact.full_name || c.matched_contact.email || 'Contact'}</div>
            {c.matched_contact.company && (
              <div className="text-muted" style={{ fontSize: 11 }}>{c.matched_contact.company}</div>
            )}
          </div>
        </div>
      );
    }
    return <span className="text-muted small">—</span>;
  };

  return (
    <Layout title="Conversions" pageTitle="Conversions" pagePretitle="Attribution">
      <div className="row row-cards mb-4">
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconShoppingCart size={20} className="me-2" />
                Recent Conversions
              </h3>
              <div className="card-actions text-muted small">
                {total.toLocaleString()} order{total !== 1 ? 's' : ''} in the last {daysFilter} days
              </div>
            </div>

            {/* Filters */}
            <div className="card-body border-bottom">
              <div className="row g-2">
                <div className="col-md-3">
                  <select
                    className="form-select form-select-sm"
                    value={pixelFilter}
                    onChange={(e) => { setPixelFilter(e.target.value); setPage(1); }}
                  >
                    <option value="">All pixels</option>
                    {pixels.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.domain ? ` (${p.domain})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-md-2">
                  <select
                    className="form-select form-select-sm"
                    value={matchFilter}
                    onChange={(e) => { setMatchFilter(e.target.value); setPage(1); }}
                  >
                    <option value="">All orders</option>
                    <option value="matched">Attributed only</option>
                    <option value="unmatched">Unmatched only</option>
                  </select>
                </div>
                <div className="col-md-2">
                  <select
                    className="form-select form-select-sm"
                    value={daysFilter}
                    onChange={(e) => { setDaysFilter(e.target.value); setPage(1); }}
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                    <option value="365">Last 365 days</option>
                  </select>
                </div>
                <div className="col-md-5">
                  <form onSubmit={handleSearchSubmit}>
                    <div className="input-group input-group-sm">
                      <span className="input-group-text"><IconSearch size={14} /></span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Search by email or order number"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                      />
                      {searchInput && (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }}
                        >
                          Clear
                        </button>
                      )}
                      <button type="submit" className="btn btn-primary">Search</button>
                    </div>
                  </form>
                </div>
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <div className="d-flex justify-content-center py-5">
                <IconLoader2 size={28} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : conversions.length === 0 ? (
              <div className="card-body text-center py-5">
                <IconShoppingCart size={48} className="text-muted mb-2" />
                <h3 className="mb-1">No conversions yet</h3>
                <p className="text-muted">
                  Connect Shopify on the <Link href="/integrations/shopify">Integrations page</Link> and run an orders sync to see attributed conversions here.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-vcenter card-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Customer</th>
                      <th>Total</th>
                      <th>Status</th>
                      <th>Date</th>
                      <th>Matched to</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversions.map((c) => {
                      const isMatched = c.matched_visitor_id || c.matched_contact_id;
                      return (
                        <tr key={c.id}>
                          <td>
                            <div className="d-flex align-items-center">
                              <span className="fw-medium">{c.external_order_number || '—'}</span>
                              {c.order_url && (
                                <a href={c.order_url} target="_blank" rel="noopener noreferrer" className="ms-2 text-muted">
                                  <IconExternalLink size={12} />
                                </a>
                              )}
                            </div>
                            <div className="text-muted" style={{ fontSize: 11 }}>{c.platform}</div>
                          </td>
                          <td>
                            <div className="small">
                              {c.customer_first_name || c.customer_last_name
                                ? `${c.customer_first_name || ''} ${c.customer_last_name || ''}`.trim()
                                : '—'}
                            </div>
                            <div className="text-muted" style={{ fontSize: 11 }}>{c.customer_email || ''}</div>
                          </td>
                          <td className="fw-medium">{formatMoney(c.total_price, c.currency)}</td>
                          <td>
                            <span className={`badge ${
                              c.financial_status === 'paid' ? 'bg-green-lt' :
                              c.financial_status === 'refunded' || c.financial_status === 'partially_refunded' ? 'bg-red-lt' :
                              'bg-secondary-lt'
                            }`}>
                              {c.financial_status || 'unknown'}
                            </span>
                          </td>
                          <td className="text-muted small">{formatDate(c.ordered_at)}</td>
                          <td>{renderMatchedTo(c)}</td>
                          <td>
                            {isMatched ? (
                              <div>
                                <span className="badge bg-green-lt">
                                  <IconCircleCheck size={12} className="me-1" />
                                  {c.match_method}
                                </span>
                                {c.identified_before_order === false && (
                                  <div className="text-muted" style={{ fontSize: 10 }}>after order</div>
                                )}
                              </div>
                            ) : (
                              <span className="badge bg-secondary-lt">
                                <IconCircleDashed size={12} className="me-1" />
                                unmatched
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="card-footer d-flex align-items-center justify-content-between">
                <div className="text-muted small">
                  Page {page} of {totalPages}
                </div>
                <div className="d-flex gap-1">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1 || loading}
                  >
                    <IconChevronLeft size={14} />
                    Prev
                  </button>
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || loading}
                  >
                    Next
                    <IconChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
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
