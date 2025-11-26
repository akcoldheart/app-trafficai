import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { TrafficAPI } from '@/lib/api';
import { IconRefresh, IconShield } from '@tabler/icons-react';

export default function Settings() {
  const [connectionStatus, setConnectionStatus] = useState<'not_tested' | 'testing' | 'connected' | 'failed'>('not_tested');
  const [connectionMessage, setConnectionMessage] = useState('Click "Test Connection" to verify your access');
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    loadCredits();
    testConnection();
  }, []);

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
        </div>

        <div className="col-lg-4">
          {/* API Info */}
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
        </div>
      </div>
    </Layout>
  );
}
