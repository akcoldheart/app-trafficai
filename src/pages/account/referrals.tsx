import { useState, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import {
  IconUsersGroup,
  IconLoader2,
  IconCopy,
  IconCheck,
  IconClick,
  IconUserPlus,
  IconCreditCard,
  IconCoin,
  IconEdit,
  IconX,
  IconAlertCircle,
} from '@tabler/icons-react';

interface ReferralStats {
  total_clicks: number;
  total_signups: number;
  total_conversions: number;
  total_revenue: number;
  total_commission: number;
  pending_commission: number;
  referrals: Array<{
    id: string;
    status: string;
    referred_email: string;
    signed_up_at: string;
    converted_at: string | null;
    plan_id: string | null;
    monthly_revenue: number;
    commission_amount: number;
  }>;
}

interface ReferralCode {
  code: string;
  referral_url: string;
  commission_rate: number;
  total_clicks: number;
  is_custom: boolean;
}

const STATUS_BADGES: Record<string, { color: string; label: string }> = {
  signed_up: { color: 'bg-blue-lt text-blue', label: 'Signed Up' },
  converted: { color: 'bg-green-lt text-green', label: 'Converted' },
  churned: { color: 'bg-red-lt text-red', label: 'Churned' },
  pending: { color: 'bg-yellow-lt text-yellow', label: 'Pending' },
};

export default function Referrals() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [codeData, setCodeData] = useState<ReferralCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [customCode, setCustomCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [savingCode, setSavingCode] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/referrals/my-code').then(r => r.json()),
      fetch('/api/referrals/stats').then(r => r.json()),
    ]).then(([code, stats]) => {
      setCodeData(code);
      setStats(stats);
      setCustomCode(code.code || '');
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const copyLink = () => {
    if (codeData?.referral_url) {
      navigator.clipboard.writeText(codeData.referral_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const saveCustomCode = async () => {
    setSavingCode(true);
    setCodeError(null);

    try {
      const res = await fetch('/api/referrals/my-code', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: customCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setCodeError(data.error || 'Failed to update code');
        return;
      }

      setCodeData(data);
      setEditingCode(false);
    } catch {
      setCodeError('Failed to update code');
    } finally {
      setSavingCode(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Referrals" pageTitle="Referral Program">
        <div className="text-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
          <p className="text-muted mt-2">Loading referral data...</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Referrals" pageTitle="Referral Program">
      {/* Referral Link Card */}
      <div className="card mb-4">
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col">
              <h3 className="mb-1">
                <IconUsersGroup className="icon me-2" />
                Your Referral Link
              </h3>
              <p className="text-muted mb-0">
                Share this link and earn <strong>{codeData?.commission_rate || 20}% commission</strong> on every referred subscription.
              </p>
            </div>
          </div>
          <div className="row mt-3">
            <div className="col-lg-8">
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  value={codeData?.referral_url || ''}
                  readOnly
                />
                <button className="btn btn-primary" onClick={copyLink}>
                  {copied ? (
                    <><IconCheck size={16} className="me-1" /> Copied!</>
                  ) : (
                    <><IconCopy size={16} className="me-1" /> Copy Link</>
                  )}
                </button>
              </div>
            </div>
            <div className="col-lg-4 mt-2 mt-lg-0">
              {!editingCode ? (
                <button
                  className="btn btn-outline-secondary w-100"
                  onClick={() => setEditingCode(true)}
                >
                  <IconEdit size={16} className="me-1" />
                  Customize Code: <strong>{codeData?.code}</strong>
                </button>
              ) : (
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control"
                    value={customCode}
                    onChange={(e) => setCustomCode(e.target.value)}
                    placeholder="your-custom-code"
                    maxLength={20}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={saveCustomCode}
                    disabled={savingCode}
                  >
                    {savingCode ? <IconLoader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <IconCheck size={16} />}
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={() => { setEditingCode(false); setCodeError(null); setCustomCode(codeData?.code || ''); }}
                  >
                    <IconX size={16} />
                  </button>
                </div>
              )}
              {codeError && (
                <div className="text-danger small mt-1">
                  <IconAlertCircle size={14} className="me-1" />
                  {codeError}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="row row-cards mb-4">
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Link Clicks</div>
              </div>
              <div className="h1 mb-0">{stats?.total_clicks || 0}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Signups</div>
              </div>
              <div className="h1 mb-0">{stats?.total_signups || 0}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Conversions</div>
              </div>
              <div className="h1 mb-0">{stats?.total_conversions || 0}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center">
                <div className="subheader">Commission Earned</div>
              </div>
              <div className="h1 mb-0 text-green">${(stats?.total_commission || 0).toFixed(2)}</div>
              {(stats?.pending_commission || 0) > 0 && (
                <div className="text-muted small">${stats!.pending_commission.toFixed(2)} pending payout</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Referrals Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Your Referrals</h3>
        </div>
        <div className="table-responsive">
          <table className="table table-vcenter card-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Status</th>
                <th>Signed Up</th>
                <th>Converted</th>
                <th>Plan</th>
                <th className="text-end">Revenue</th>
                <th className="text-end">Commission</th>
              </tr>
            </thead>
            <tbody>
              {(!stats?.referrals || stats.referrals.length === 0) ? (
                <tr>
                  <td colSpan={7} className="text-center text-muted py-4">
                    No referrals yet. Share your link to get started!
                  </td>
                </tr>
              ) : (
                stats.referrals.map(ref => {
                  const badge = STATUS_BADGES[ref.status] || STATUS_BADGES.pending;
                  return (
                    <tr key={ref.id}>
                      <td>{ref.referred_email || '-'}</td>
                      <td>
                        <span className={`badge ${badge.color}`}>{badge.label}</span>
                      </td>
                      <td>{ref.signed_up_at ? new Date(ref.signed_up_at).toLocaleDateString() : '-'}</td>
                      <td>{ref.converted_at ? new Date(ref.converted_at).toLocaleDateString() : '-'}</td>
                      <td>{ref.plan_id ? <span className="text-capitalize">{ref.plan_id}</span> : '-'}</td>
                      <td className="text-end">${Number(ref.monthly_revenue || 0).toFixed(2)}/mo</td>
                      <td className="text-end text-green">${Number(ref.commission_amount || 0).toFixed(2)}/mo</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
