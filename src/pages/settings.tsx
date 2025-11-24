import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { TrafficAPI } from '@/lib/api';
import { IconEye, IconTrash, IconDeviceFloppy, IconRefresh, IconShield } from '@tabler/icons-react';

export default function Settings() {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'not_tested' | 'testing' | 'connected' | 'failed'>('not_tested');
  const [connectionMessage, setConnectionMessage] = useState('Click "Test Connection" to verify your API key');
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    const existingKey = TrafficAPI.getApiKey();
    if (existingKey) {
      setApiKey(existingKey);
      loadCredits();
    }
  }, []);

  const saveApiKey = () => {
    const key = apiKey.trim();
    if (!key) {
      alert('Please enter an API key');
      return;
    }

    TrafficAPI.setApiKey(key);
    alert('API key saved successfully!');
    testConnection();
  };

  const clearApiKey = () => {
    if (confirm('Are you sure you want to clear your API key?')) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('traffic_api_key');
      }
      setApiKey('');
      setConnectionStatus('not_tested');
      setConnectionMessage('API key cleared');
      setCredits(null);
    }
  };

  const testConnection = async () => {
    if (!TrafficAPI.hasApiKey()) {
      setConnectionStatus('failed');
      setConnectionMessage('Please save your API key first');
      return;
    }

    setConnectionStatus('testing');
    setConnectionMessage('Connecting to API...');

    try {
      const result = await TrafficAPI.testConnection();

      if (result.success) {
        setConnectionStatus('connected');
        setConnectionMessage('API connection successful');
        loadCredits();
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
    if (!TrafficAPI.hasApiKey()) {
      setCredits(null);
      return;
    }

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
          {/* API Configuration */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">API Configuration</h3>
            </div>
            <div className="card-body">
              <div className="mb-3">
                <label className="form-label">API Key</label>
                <div className="input-group">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    className="form-control"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your Traffic AI API key"
                  />
                  <button
                    className="btn btn-outline-secondary"
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    <IconEye className="icon" />
                  </button>
                </div>
                <small className="form-hint">
                  Your API key is stored locally in your browser and is never sent to any third-party servers.
                </small>
              </div>

              <div className="d-flex justify-content-between">
                <button className="btn btn-outline-danger" onClick={clearApiKey}>
                  <IconTrash className="icon" />
                  Clear API Key
                </button>
                <button className="btn btn-primary" onClick={saveApiKey}>
                  <IconDeviceFloppy className="icon" />
                  Save API Key
                </button>
              </div>
            </div>
          </div>

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
          {/* Help */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Getting Started</h3>
            </div>
            <div className="card-body">
              <ol>
                <li className="mb-2">Enter your Traffic AI API key in the field above</li>
                <li className="mb-2">Click &quot;Save API Key&quot; to store it locally</li>
                <li className="mb-2">Test the connection to verify it works</li>
                <li>Start using Traffic AI features!</li>
              </ol>
            </div>
          </div>

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

              <div className="mb-3">
                <label className="form-label">Authentication</label>
                <p className="text-muted small mb-0">
                  All API requests require the <code>X-Api-Key</code> header with your API key.
                </p>
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
                  <h4 className="mb-1">Security Notice</h4>
                  <p className="mb-0 small">
                    Your API key is stored in your browser&apos;s local storage. Never share your API key or commit it
                    to version control.
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
