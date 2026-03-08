import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconPlug,
  IconCheck,
  IconLoader2,
  IconArrowRight,
} from '@tabler/icons-react';
import Link from 'next/link';
import { INTEGRATION_CONFIGS, INTEGRATION_ORDER } from '@/lib/integration-configs';

interface ConnectedStatus {
  platform: string;
  is_connected: boolean;
  last_synced_at: string | null;
}

export default function IntegrationsHub() {
  const { userProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedStatus[]>([]);
  const [klaviyoConnected, setKlaviyoConnected] = useState(false);

  useEffect(() => {
    async function fetchStatuses() {
      try {
        setLoading(true);

        // Fetch platform_integrations statuses
        const [platformResp, klaviyoResp] = await Promise.all([
          fetch('/api/integrations/status-all'),
          fetch('/api/integrations/klaviyo/status'),
        ]);

        if (platformResp.ok) {
          const data = await platformResp.json();
          setConnectedPlatforms(data.integrations || []);
        }

        if (klaviyoResp.ok) {
          const data = await klaviyoResp.json();
          setKlaviyoConnected(data.integration?.is_connected || false);
        }
      } catch (error) {
        console.error('Error fetching integration statuses:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStatuses();
  }, []);

  const isConnected = (key: string): boolean => {
    if (key === 'klaviyo') return klaviyoConnected;
    return connectedPlatforms.some(p => p.platform === key && p.is_connected);
  };

  const getLastSynced = (key: string): string | null => {
    if (key === 'klaviyo') return null;
    return connectedPlatforms.find(p => p.platform === key)?.last_synced_at || null;
  };

  const getHref = (key: string): string => {
    // Platforms with dedicated pages
    if (key === 'klaviyo' || key === 'zapier') return `/integrations/${key}`;
    return `/integrations/${key}`;
  };

  const categoryLabels: Record<string, string> = {
    email_marketing: 'Email Marketing',
    crm: 'CRM',
    notifications: 'Notifications',
    automation: 'Automation',
    ecommerce: 'E-Commerce',
  };

  // Group integrations by category
  const grouped = INTEGRATION_ORDER.reduce((acc, key) => {
    const config = INTEGRATION_CONFIGS[key];
    if (!config) return acc;
    const cat = config.category;
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(config);
    return acc;
  }, {} as Record<string, typeof INTEGRATION_CONFIGS[string][]>);

  const categoryOrder = ['crm', 'email_marketing', 'notifications', 'automation', 'ecommerce'];

  if (loading) {
    return (
      <Layout title="Integrations" pageTitle="Integrations">
        <div className="d-flex justify-content-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Integrations" pageTitle="Integrations" pagePretitle="Settings">
      <div className="mb-4">
        <p className="text-muted">
          Connect your favorite tools to automatically sync visitors and audiences from Traffic AI.
        </p>
      </div>

      {categoryOrder.map(cat => {
        const items = grouped[cat];
        if (!items || items.length === 0) return null;
        return (
          <div key={cat} className="mb-4">
            <h3 className="mb-3">{categoryLabels[cat] || cat}</h3>
            <div className="row row-cards">
              {items.map((config) => {
                const connected = isConnected(config.key);
                const lastSynced = getLastSynced(config.key);
                return (
                  <div key={config.key} className="col-sm-6 col-lg-4">
                    <Link href={getHref(config.key)} className="card card-link" style={{ textDecoration: 'none' }}>
                      <div className="card-body">
                        <div className="d-flex align-items-center mb-3">
                          <div
                            className="me-3 flex-shrink-0"
                            style={{
                              width: 44,
                              height: 44,
                              borderRadius: 10,
                              background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}cc 100%)`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <span style={{ color: config.color === '#FFE01B' ? '#000' : '#fff', fontWeight: 700, fontSize: config.letterIcon.length > 1 ? 11 : 16 }}>
                              {config.letterIcon}
                            </span>
                          </div>
                          <div className="flex-grow-1">
                            <h3 className="card-title mb-0">{config.name}</h3>
                            <div className="text-muted small">{config.description}</div>
                          </div>
                          <div className="ms-2">
                            {connected ? (
                              <span className="badge bg-green-lt">
                                <IconCheck size={12} className="me-1" />
                                Connected
                              </span>
                            ) : (
                              <IconArrowRight size={18} className="text-muted" />
                            )}
                          </div>
                        </div>
                        {connected && lastSynced && (
                          <div className="text-muted small">
                            Last synced: {new Date(lastSynced).toLocaleDateString()}
                          </div>
                        )}
                        <div className="d-flex flex-wrap gap-1 mt-2">
                          {config.features.map(f => (
                            <span key={f} className="badge bg-secondary-lt" style={{ fontSize: '0.65rem' }}>
                              {f === 'sync_visitors' ? 'Visitors' :
                               f === 'sync_audiences' ? 'Audiences' :
                               f === 'notifications' ? 'Notifications' :
                               f === 'webhooks' ? 'Webhooks' :
                               f === 'lists' ? 'Lists' : f}
                            </span>
                          ))}
                        </div>
                      </div>
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Layout>
  );
}
