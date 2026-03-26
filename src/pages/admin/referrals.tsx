import { useState, useEffect, useCallback } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';
import {
  IconUsersGroup,
  IconLoader2,
  IconClick,
  IconUserPlus,
  IconCreditCard,
  IconCoin,
  IconRefresh,
  IconCheck,
  IconPercentage,
  IconCash,
} from '@tabler/icons-react';

interface AdminStats {
  total_clicks: number;
  total_signups: number;
  total_conversions: number;
  conversion_rate: string;
  total_revenue: number;
  total_commission: number;
  total_paid: number;
  outstanding_commission: number;
  total_codes: number;
  top_affiliates: Array<{
    user_id: string;
    email: string;
    signups: number;
    conversions: number;
    revenue: number;
    commission: number;
  }>;
}

interface ReferralCode {
  id: string;
  code: string;
  is_custom: boolean;
  commission_rate: number;
  total_clicks: number;
  is_active: boolean;
  cookie_duration_days: number;
  user: { email: string };
}

interface Referral {
  id: string;
  status: string;
  referred_email: string;
  signed_up_at: string;
  converted_at: string | null;
  plan_id: string | null;
  monthly_revenue: number;
  commission_amount: number;
  commission_rate: number;
  created_at: string;
  referrer: { email: string } | null;
  referred: { email: string } | null;
}

interface Payout {
  id: string;
  amount: number;
  status: string;
  payout_method: string;
  payout_reference: string | null;
  notes: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  user: { email: string };
}

const STATUS_BADGES: Record<string, { color: string; label: string }> = {
  signed_up: { color: 'bg-blue-lt text-blue', label: 'Signed Up' },
  converted: { color: 'bg-green-lt text-green', label: 'Converted' },
  churned: { color: 'bg-red-lt text-red', label: 'Churned' },
  pending: { color: 'bg-yellow-lt text-yellow', label: 'Pending' },
  processing: { color: 'bg-cyan-lt text-cyan', label: 'Processing' },
  paid: { color: 'bg-green-lt text-green', label: 'Paid' },
  failed: { color: 'bg-red-lt text-red', label: 'Failed' },
};

export default function AdminReferrals() {
  const { userProfile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'overview' | 'codes' | 'referrals' | 'payouts'>('overview');
  const [loading, setLoading] = useState(true);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);

  // Edit commission rate
  const [editingCodeId, setEditingCodeId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState('');

  useEffect(() => {
    if (!authLoading && userProfile?.role !== 'admin') {
      router.push('/');
    }
  }, [authLoading, userProfile, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, codesRes, referralsRes, payoutsRes] = await Promise.all([
        fetch('/api/admin/referrals/stats').then(r => r.json()),
        fetch('/api/admin/referrals/codes').then(r => r.json()),
        fetch('/api/admin/referrals').then(r => r.json()),
        fetch('/api/admin/referrals/payouts').then(r => r.json()),
      ]);
      setStats(statsRes);
      setCodes(codesRes.codes || []);
      setReferrals(referralsRes.referrals || []);
      setPayouts(payoutsRes.payouts || []);
    } catch (err) {
      console.error('Error fetching referral data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userProfile?.role === 'admin') fetchData();
  }, [userProfile, fetchData]);

  const updateCommissionRate = async (codeId: string, rate: number) => {
    await fetch('/api/admin/referrals/codes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: codeId, commission_rate: rate }),
    });
    setEditingCodeId(null);
    fetchData();
  };

  const toggleCodeActive = async (codeId: string, isActive: boolean) => {
    await fetch('/api/admin/referrals/codes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: codeId, is_active: !isActive }),
    });
    fetchData();
  };

  const markPayoutPaid = async (payoutId: string) => {
    await fetch('/api/admin/referrals/payouts', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: payoutId, status: 'paid' }),
    });
    fetchData();
  };

  if (authLoading || loading) {
    return (
      <Layout title="Referrals" pageTitle="Referral Management">
        <div className="text-center py-5">
          <IconLoader2 size={32} className="text-muted" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Referrals" pageTitle="Referral Management">
      {/* Stats Overview */}
      <div className="row row-cards mb-4">
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center mb-1">
                <IconClick size={20} className="text-muted me-2" />
                <div className="subheader">Total Clicks</div>
              </div>
              <div className="h1 mb-0">{stats?.total_clicks || 0}</div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center mb-1">
                <IconUserPlus size={20} className="text-muted me-2" />
                <div className="subheader">Signups / Conversions</div>
              </div>
              <div className="h1 mb-0">
                {stats?.total_signups || 0} / {stats?.total_conversions || 0}
                <span className="ms-2 text-muted fs-5">({stats?.conversion_rate || 0}%)</span>
              </div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center mb-1">
                <IconCreditCard size={20} className="text-muted me-2" />
                <div className="subheader">Referred Revenue</div>
              </div>
              <div className="h1 mb-0 text-green">${(stats?.total_revenue || 0).toFixed(2)}<span className="fs-5">/mo</span></div>
            </div>
          </div>
        </div>
        <div className="col-sm-6 col-lg-3">
          <div className="card">
            <div className="card-body">
              <div className="d-flex align-items-center mb-1">
                <IconCoin size={20} className="text-muted me-2" />
                <div className="subheader">Outstanding Commission</div>
              </div>
              <div className="h1 mb-0 text-orange">${(stats?.outstanding_commission || 0).toFixed(2)}</div>
              <div className="text-muted small">${(stats?.total_paid || 0).toFixed(2)} paid out</div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card">
        <div className="card-header">
          <ul className="nav nav-tabs card-header-tabs">
            {(['overview', 'codes', 'referrals', 'payouts'] as const).map(tab => (
              <li className="nav-item" key={tab}>
                <a
                  className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                  href="#"
                  onClick={(e) => { e.preventDefault(); setActiveTab(tab); }}
                >
                  {tab === 'overview' ? 'Top Affiliates' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </a>
              </li>
            ))}
          </ul>
          <div className="card-actions">
            <button className="btn btn-outline-secondary btn-sm" onClick={fetchData}>
              <IconRefresh size={16} className="me-1" />
              Refresh
            </button>
          </div>
        </div>

        {/* Top Affiliates Tab */}
        {activeTab === 'overview' && (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Affiliate</th>
                  <th className="text-center">Signups</th>
                  <th className="text-center">Conversions</th>
                  <th className="text-end">Revenue</th>
                  <th className="text-end">Commission</th>
                </tr>
              </thead>
              <tbody>
                {(!stats?.top_affiliates || stats.top_affiliates.length === 0) ? (
                  <tr><td colSpan={5} className="text-center text-muted py-4">No affiliate data yet</td></tr>
                ) : (
                  stats.top_affiliates.map(aff => (
                    <tr key={aff.user_id}>
                      <td>{aff.email}</td>
                      <td className="text-center">{aff.signups}</td>
                      <td className="text-center">{aff.conversions}</td>
                      <td className="text-end">${aff.revenue.toFixed(2)}/mo</td>
                      <td className="text-end text-green">${aff.commission.toFixed(2)}/mo</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Codes Tab */}
        {activeTab === 'codes' && (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Code</th>
                  <th className="text-center">Clicks</th>
                  <th className="text-center">Commission %</th>
                  <th className="text-center">Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {codes.length === 0 ? (
                  <tr><td colSpan={6} className="text-center text-muted py-4">No referral codes yet</td></tr>
                ) : (
                  codes.map(code => (
                    <tr key={code.id}>
                      <td>{code.user?.email || '-'}</td>
                      <td>
                        <code>{code.code}</code>
                        {code.is_custom && <span className="badge bg-purple-lt text-purple ms-2">Custom</span>}
                      </td>
                      <td className="text-center">{code.total_clicks}</td>
                      <td className="text-center">
                        {editingCodeId === code.id ? (
                          <div className="input-group input-group-sm" style={{ width: '120px', margin: '0 auto' }}>
                            <input
                              type="number"
                              className="form-control form-control-sm"
                              value={editRate}
                              onChange={(e) => setEditRate(e.target.value)}
                              min="0"
                              max="100"
                              step="0.5"
                            />
                            <button
                              className="btn btn-sm btn-primary"
                              onClick={() => updateCommissionRate(code.id, parseFloat(editRate))}
                            >
                              <IconCheck size={14} />
                            </button>
                          </div>
                        ) : (
                          <span
                            className="cursor-pointer"
                            onClick={() => { setEditingCodeId(code.id); setEditRate(String(code.commission_rate)); }}
                            style={{ cursor: 'pointer' }}
                            title="Click to edit"
                          >
                            {code.commission_rate}%
                          </span>
                        )}
                      </td>
                      <td className="text-center">
                        <span className={`badge ${code.is_active ? 'bg-green-lt text-green' : 'bg-red-lt text-red'}`}>
                          {code.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`btn btn-sm ${code.is_active ? 'btn-outline-danger' : 'btn-outline-success'}`}
                          onClick={() => toggleCodeActive(code.id, code.is_active)}
                        >
                          {code.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Referrals Tab */}
        {activeTab === 'referrals' && (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Referrer</th>
                  <th>Referred</th>
                  <th>Status</th>
                  <th>Signed Up</th>
                  <th>Converted</th>
                  <th>Plan</th>
                  <th className="text-end">Revenue</th>
                  <th className="text-end">Commission</th>
                </tr>
              </thead>
              <tbody>
                {referrals.length === 0 ? (
                  <tr><td colSpan={8} className="text-center text-muted py-4">No referrals yet</td></tr>
                ) : (
                  referrals.map(ref => {
                    const badge = STATUS_BADGES[ref.status] || STATUS_BADGES.pending;
                    return (
                      <tr key={ref.id}>
                        <td>{ref.referrer?.email || '-'}</td>
                        <td>{ref.referred?.email || ref.referred_email || '-'}</td>
                        <td><span className={`badge ${badge.color}`}>{badge.label}</span></td>
                        <td>{ref.signed_up_at ? new Date(ref.signed_up_at).toLocaleDateString() : '-'}</td>
                        <td>{ref.converted_at ? new Date(ref.converted_at).toLocaleDateString() : '-'}</td>
                        <td>{ref.plan_id ? <span className="text-capitalize">{ref.plan_id}</span> : '-'}</td>
                        <td className="text-end">${Number(ref.monthly_revenue || 0).toFixed(2)}</td>
                        <td className="text-end">${Number(ref.commission_amount || 0).toFixed(2)} <span className="text-muted">({ref.commission_rate}%)</span></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Payouts Tab */}
        {activeTab === 'payouts' && (
          <div className="table-responsive">
            <table className="table table-vcenter card-table">
              <thead>
                <tr>
                  <th>Affiliate</th>
                  <th className="text-end">Amount</th>
                  <th>Status</th>
                  <th>Method</th>
                  <th>Reference</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payouts.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted py-4">No payouts yet</td></tr>
                ) : (
                  payouts.map(payout => {
                    const badge = STATUS_BADGES[payout.status] || STATUS_BADGES.pending;
                    return (
                      <tr key={payout.id}>
                        <td>{payout.user?.email || '-'}</td>
                        <td className="text-end">${Number(payout.amount).toFixed(2)}</td>
                        <td><span className={`badge ${badge.color}`}>{badge.label}</span></td>
                        <td>{payout.payout_method || '-'}</td>
                        <td>{payout.payout_reference || '-'}</td>
                        <td>{new Date(payout.created_at).toLocaleDateString()}</td>
                        <td>
                          {payout.status === 'pending' && (
                            <button
                              className="btn btn-sm btn-success"
                              onClick={() => markPayoutPaid(payout.id)}
                            >
                              <IconCheck size={14} className="me-1" />
                              Mark Paid
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
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
