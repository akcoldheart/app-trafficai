import { useEffect, useState } from 'react';
import Link from 'next/link';
import Layout from '@/components/layout/Layout';
import { TrafficAPI, Audience } from '@/lib/api';
import { IconPlus, IconSearch } from '@tabler/icons-react';

export default function Dashboard() {
  const [hasApiKey, setHasApiKey] = useState(false);
  const [audiences, setAudiences] = useState<Audience[]>([]);
  const [totalAudiences, setTotalAudiences] = useState<number | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'error' | 'not_configured'>('checking');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const hasKey = TrafficAPI.hasApiKey();
    setHasApiKey(hasKey);

    if (!hasKey) {
      setApiStatus('not_configured');
      setLoading(false);
      return;
    }

    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load audiences
      const audiencesData = await TrafficAPI.getAudiences(1, 5);
      setAudiences(audiencesData.Data || []);
      setTotalAudiences(audiencesData.total_records || 0);
    } catch (error) {
      console.error('Error loading audiences:', error);
    }

    try {
      // Load credits
      const creditsData = await TrafficAPI.getCredits();
      setCredits(creditsData.credits || creditsData.available || 0);
    } catch (error) {
      console.error('Error loading credits:', error);
    }

    try {
      // Test API connection
      const testResult = await TrafficAPI.testConnection();
      setApiStatus(testResult.success ? 'connected' : 'error');
    } catch {
      setApiStatus('error');
    }

    setLoading(false);
  };

  return (
    <Layout title="Dashboard" pageTitle="Traffic AI Dashboard" pagePretitle="Overview">
      <div className="row row-cards">
        {/* API Key Warning */}
        {!hasApiKey && (
          <div className="col-12">
            <div className="alert alert-warning" role="alert">
              <div className="d-flex">
                <div>
                  <h4 className="alert-title">API Key Required</h4>
                  <div className="text-secondary">
                    Please configure your API key in{' '}
                    <Link href="/settings">Settings</Link> to use Traffic AI features.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Total Audiences</div>
              </div>
              <div className="h1 mb-3">
                {loading ? (
                  <div className="placeholder col-4"></div>
                ) : (
                  totalAudiences ?? '-'
                )}
              </div>
              <div className="d-flex mb-2">
                <Link href="/audiences" className="text-muted">
                  View all audiences
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Available Credits</div>
              </div>
              <div className="h1 mb-3">
                {loading ? (
                  <div className="placeholder col-4"></div>
                ) : (
                  credits?.toLocaleString() ?? '-'
                )}
              </div>
              <div className="d-flex mb-2">
                <span className="text-muted">API usage credits</span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">API Status</div>
              </div>
              <div className="h1 mb-3">
                {apiStatus === 'checking' && <div className="placeholder col-4"></div>}
                {apiStatus === 'connected' && <span className="badge bg-green">Connected</span>}
                {apiStatus === 'error' && <span className="badge bg-red">Error</span>}
                {apiStatus === 'not_configured' && <span className="badge bg-yellow">Not Configured</span>}
              </div>
              <div className="d-flex mb-2">
                <span className="text-muted">
                  {apiStatus === 'connected' && 'API is operational'}
                  {apiStatus === 'error' && 'Connection failed'}
                  {apiStatus === 'not_configured' && 'API key required'}
                  {apiStatus === 'checking' && 'Checking...'}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Quick Actions</div>
              </div>
              <div className="mt-3">
                <Link href="/audiences/create" className="btn btn-primary w-100 mb-2">
                  <IconPlus className="icon" />
                  Create Audience
                </Link>
                <Link href="/enrich" className="btn btn-outline-primary w-100">
                  <IconSearch className="icon" />
                  Enrich Contact
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Audiences */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recent Audiences</h3>
              <div className="card-actions">
                <Link href="/audiences" className="btn btn-sm">
                  View all
                </Link>
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-vcenter card-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>ID</th>
                    <th>Records</th>
                    <th>Created</th>
                    <th className="w-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        <div className="spinner-border spinner-border-sm me-2" role="status"></div>
                        Loading audiences...
                      </td>
                    </tr>
                  ) : !hasApiKey ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        Configure API key in Settings to view audiences
                      </td>
                    </tr>
                  ) : audiences.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-muted py-4">
                        No audiences found.{' '}
                        <Link href="/audiences/create">Create your first audience</Link>
                      </td>
                    </tr>
                  ) : (
                    audiences.map((audience) => (
                      <tr key={audience.id || audience.audienceId}>
                        <td>
                          <span className="text-reset">{audience.name || 'Unnamed'}</span>
                        </td>
                        <td>
                          <code className="small">
                            {(audience.id || audience.audienceId || '').substring(0, 8)}...
                          </code>
                        </td>
                        <td>{audience.total_records?.toLocaleString() || '-'}</td>
                        <td className="text-muted">
                          {audience.created_at
                            ? new Date(audience.created_at).toLocaleDateString()
                            : '-'}
                        </td>
                        <td>
                          <Link
                            href={`/audiences/${audience.id || audience.audienceId}`}
                            className="btn btn-sm"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* API Info */}
        <div className="col-lg-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">API Information</h3>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">API Endpoint</label>
                <div className="form-control-plaintext">
                  <code className="small">https://v3-api-job-72802495918.us-east1.run.app</code>
                </div>
              </div>
              <div className="mb-3">
                <label className="form-label">Available Endpoints</label>
                <ul className="list-unstyled space-y-1">
                  <li>
                    <code className="small">/audiences</code> - Manage audiences
                  </li>
                  <li>
                    <code className="small">/enrich</code> - Contact enrichment
                  </li>
                  <li>
                    <code className="small">/user/credits</code> - Check credits
                  </li>
                </ul>
              </div>
              <Link href="/settings" className="btn btn-outline-primary w-100">
                Configure API Key
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
