import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Link from 'next/link';
import { INTEGRATION_CONFIGS, INTEGRATION_ORDER } from '@/lib/integration-configs';

interface ConnectedStatus {
  platform: string;
  is_connected: boolean;
  last_synced_at: string | null;
}

const FEATURE_LABELS: Record<string, string> = {
  sync_visitors: 'Visitors',
  sync_audiences: 'Audiences',
  notifications: 'Notifications',
  webhooks: 'Webhooks',
  lists: 'Lists',
};

const CATEGORY_LABELS: Record<string, string> = {
  all: 'All',
  crm: 'CRM',
  email_marketing: 'Email Marketing',
  notifications: 'Notifications',
  automation: 'Automation',
  ecommerce: 'E-Commerce',
  advertising: 'Advertising',
  outreach: 'Outreach',
};

function hex(color: string, alpha: number): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export default function IntegrationsHub() {
  const [loading, setLoading] = useState(true);
  const [connectedPlatforms, setConnectedPlatforms] = useState<ConnectedStatus[]>([]);
  const [klaviyoConnected, setKlaviyoConnected] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStatuses() {
      try {
        const [platformResp, klaviyoResp] = await Promise.all([
          fetch('/api/integrations/status-all'),
          fetch('/api/integrations/klaviyo/status'),
        ]);
        if (platformResp.ok) setConnectedPlatforms((await platformResp.json()).integrations || []);
        if (klaviyoResp.ok) setKlaviyoConnected((await klaviyoResp.json()).integration?.is_connected || false);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchStatuses();
  }, []);

  const isConnected = (key: string) =>
    key === 'klaviyo' ? klaviyoConnected : connectedPlatforms.some(p => p.platform === key && p.is_connected);

  const getLastSynced = (key: string) =>
    key === 'klaviyo' ? null : (connectedPlatforms.find(p => p.platform === key)?.last_synced_at || null);

  const allIntegrations = INTEGRATION_ORDER.map(key => INTEGRATION_CONFIGS[key]).filter(Boolean);
  const connectedCount = allIntegrations.filter(c => isConnected(c.key)).length;

  const categoryCounts = INTEGRATION_ORDER.reduce((acc, key) => {
    const cat = INTEGRATION_CONFIGS[key]?.category;
    if (cat) acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categories = ['all', 'crm', 'email_marketing', 'notifications', 'automation', 'ecommerce', 'advertising', 'outreach']
    .map(id => ({
      id,
      label: CATEGORY_LABELS[id],
      count: id === 'all' ? allIntegrations.length : (categoryCounts[id] || 0),
    }))
    .filter(c => c.count > 0);

  const filtered = activeCategory === 'all'
    ? allIntegrations
    : allIntegrations.filter(c => c.category === activeCategory);

  return (
    <Layout title="Integrations" pageTitle="Integrations" pagePretitle="Settings">
      <div style={{ maxWidth: 1100 }}>

        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
          <p style={{ margin: 0, color: '#7a7a8c', fontSize: 13.5, lineHeight: 1.5 }}>
            Connect your tools to automatically sync visitors and audiences.
          </p>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 20,
            padding: '6px 14px 6px 10px',
            background: connectedCount > 0 ? 'rgba(47,203,114,0.1)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${connectedCount > 0 ? 'rgba(47,203,114,0.25)' : 'rgba(255,255,255,0.08)'}`,
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connectedCount > 0 ? '#2fcb72' : '#3d3d4d',
              boxShadow: connectedCount > 0 ? '0 0 0 3px rgba(47,203,114,0.2)' : 'none',
            }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: connectedCount > 0 ? '#2fcb72' : '#555', letterSpacing: '0.01em' }}>
              {loading ? '—' : connectedCount} of {allIntegrations.length} connected
            </span>
          </div>
        </div>

        {/* Category tabs */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 24 }}>
          {categories.map(cat => {
            const active = activeCategory === cat.id;
            return (
              <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
                appearance: 'none',
                background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                border: `1px solid ${active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 7,
                padding: '5px 12px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                color: active ? '#e8e8f0' : '#666',
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                transition: 'all 0.14s',
              }}>
                {cat.label}
                <span style={{
                  background: active ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.05)',
                  borderRadius: 5,
                  padding: '0px 7px',
                  fontSize: 11,
                  fontWeight: 700,
                  color: active ? '#c8c8dc' : '#4a4a5a',
                  lineHeight: '20px',
                }}>
                  {cat.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
            {[...Array(6)].map((_, i) => (
              <div key={i} style={{
                height: 160,
                borderRadius: 12,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.06)',
                animation: `pulse 1.5s ease-in-out ${i * 0.1}s infinite`,
              }} />
            ))}
          </div>
        )}

        {/* Cards grid */}
        {!loading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
            gap: 12,
          }}>
            {filtered.map(config => {
              const connected = isConnected(config.key);
              const lastSynced = getLastSynced(config.key);
              const hovered = hoveredCard === config.key;

              return (
                <Link
                  key={config.key}
                  href={`/integrations/${config.key}`}
                  style={{ textDecoration: 'none', display: 'block', outline: 'none' }}
                  onMouseEnter={() => setHoveredCard(config.key)}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div style={{
                    position: 'relative',
                    borderRadius: 12,
                    overflow: 'hidden',
                    border: `1px solid ${hovered
                      ? (connected ? hex(config.color, 0.35) : 'rgba(255,255,255,0.13)')
                      : (connected ? hex(config.color, 0.2) : 'rgba(255,255,255,0.07)')}`,
                    background: hovered
                      ? (connected ? hex(config.color, 0.05) : 'rgba(255,255,255,0.035)')
                      : 'rgba(255,255,255,0.025)',
                    transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
                    boxShadow: hovered
                      ? `0 12px 40px rgba(0,0,0,0.4), 0 0 0 1px ${connected ? hex(config.color, 0.15) : 'transparent'}`
                      : '0 1px 3px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s cubic-bezier(0.2, 0, 0, 1)',
                  }}>

                    {/* Top accent line (connected only) */}
                    {connected && (
                      <div style={{
                        position: 'absolute',
                        top: 0, left: 0, right: 0,
                        height: 2,
                        background: `linear-gradient(90deg, ${config.color}, ${hex(config.color, 0.4)})`,
                        borderRadius: '12px 12px 0 0',
                      }} />
                    )}

                    {/* Card body */}
                    <div style={{ padding: '20px 20px 15px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>

                        {/* Logo — solid brand color bg, white letter */}
                        <div style={{
                          width: 52,
                          height: 52,
                          borderRadius: 12,
                          background: `linear-gradient(145deg, ${config.color}, ${hex(config.color, 0.75)})`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          boxShadow: `0 4px 14px ${hex(config.color, 0.35)}`,
                          transition: 'box-shadow 0.2s ease',
                          ...(hovered ? { boxShadow: `0 6px 20px ${hex(config.color, 0.5)}` } : {}),
                        }}>
                          <span style={{
                            color: config.color === '#FFE01B' ? '#1a1200' : '#fff',
                            fontWeight: 800,
                            fontSize: config.letterIcon.length > 2 ? 11 : config.letterIcon.length > 1 ? 14 : 22,
                            letterSpacing: config.letterIcon.length > 1 ? '-0.5px' : '0',
                            fontFamily: "'SF Pro Display', system-ui, -apple-system, sans-serif",
                            lineHeight: 1,
                          }}>
                            {config.letterIcon}
                          </span>
                        </div>

                        {/* Name + description */}
                        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                          <div style={{
                            fontSize: 15,
                            fontWeight: 600,
                            color: '#ededf5',
                            lineHeight: 1.25,
                            marginBottom: 4,
                            letterSpacing: '-0.01em',
                          }}>
                            {config.name}
                          </div>
                          <div style={{
                            fontSize: 12.5,
                            color: '#5a5a6e',
                            lineHeight: 1.45,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {config.description}
                          </div>
                        </div>
                      </div>

                      {/* Feature chips */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                        {config.features.map(f => (
                          <span key={f} style={{
                            background: 'rgba(255,255,255,0.04)',
                            border: '1px solid rgba(255,255,255,0.07)',
                            borderRadius: 5,
                            padding: '2px 8px',
                            fontSize: 11,
                            color: '#5a5a72',
                            fontWeight: 500,
                            letterSpacing: '0.01em',
                          }}>
                            {FEATURE_LABELS[f] || f}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Divider */}
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '0 20px' }} />

                    {/* Card footer */}
                    <div style={{
                      padding: '12px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}>
                      {/* Status */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <div style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: connected ? '#2fcb72' : '#2e2e3e',
                          boxShadow: connected ? '0 0 0 2px rgba(47,203,114,0.2)' : 'none',
                          flexShrink: 0,
                        }} />
                        <span style={{
                          fontSize: 12.5,
                          color: connected ? '#3ddc84' : '#3e3e52',
                          fontWeight: 500,
                        }}>
                          {connected ? (
                            <>
                              Connected
                              {lastSynced && (
                                <span style={{ color: 'rgba(61,220,132,0.5)', marginLeft: 6 }}>
                                  · {new Date(lastSynced).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              )}
                            </>
                          ) : 'Not connected'}
                        </span>
                      </div>

                      {/* CTA button */}
                      {connected ? (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: hovered ? '#c0c0d0' : '#606070',
                          transition: 'color 0.15s',
                          letterSpacing: '0.01em',
                        }}>
                          Configure
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </div>
                      ) : (
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: hovered ? hex(config.color, 0.12) : 'rgba(255,255,255,0.04)',
                          border: `1px solid ${hovered ? hex(config.color, 0.4) : 'rgba(255,255,255,0.1)'}`,
                          borderRadius: 6,
                          padding: '5px 11px 5px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: hovered ? config.color : '#7a7a90',
                          transition: 'all 0.18s ease',
                          letterSpacing: '0.01em',
                          cursor: 'pointer',
                        }}>
                          Connect
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M5 12h14M12 5l7 7-7 7" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
      `}</style>
    </Layout>
  );
}
