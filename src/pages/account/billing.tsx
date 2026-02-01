import { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconCreditCard,
  IconCheck,
  IconX,
  IconStar,
  IconRocket,
  IconBolt,
  IconTrendingUp as IconGrowth,
  IconLoader2,
  IconTrendingUp,
  IconUsers,
  IconEye,
  IconRefresh,
  IconExternalLink,
  IconClock,
} from '@tabler/icons-react';

interface PlanFeature {
  name: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: PlanFeature[];
  visitors: string;
  popular?: boolean;
  contactSales?: boolean;
  stripePriceIdMonthly?: string;
  stripePriceIdYearly?: string;
  buttonText?: string;
}

const defaultPlans: Plan[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 500,
    yearlyPrice: 425, // Effective monthly rate when billed annually
    description: 'For small teams beginning intent-driven sales.',
    visitors: '3,000',
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    buttonText: 'Get Started with Starter',
    features: [
      { name: 'Up to 3,000 identified visitors', included: true },
      { name: 'Intent data & lead scoring', included: false },
      { name: 'Email & LinkedIn enrichment', included: false },
      { name: 'Multi-channel activation tools', included: false },
      { name: 'Dedicated account manager & support', included: false },
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    monthlyPrice: 800,
    yearlyPrice: 680, // Effective monthly rate when billed annually
    description: 'For scaling teams boosting pipeline and outreach.',
    visitors: '5,000',
    popular: true,
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    buttonText: 'Upgrade To Growth',
    features: [
      { name: 'Up to 5,000 identified visitors', included: true },
      { name: 'Intent data & lead scoring', included: true },
      { name: 'Email & LinkedIn enrichment', included: false },
      { name: 'Multi-channel activation tools', included: false },
      { name: 'Dedicated account manager & support', included: false },
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 1200,
    yearlyPrice: 1020, // Effective monthly rate when billed annually
    description: 'For established teams needing advanced data & automation.',
    visitors: '10,000',
    stripePriceIdMonthly: '',
    stripePriceIdYearly: '',
    buttonText: 'Go Pro Now',
    features: [
      { name: 'Up to 10,000 identified visitors', included: true },
      { name: 'Intent data & lead scoring', included: true },
      { name: 'Email & LinkedIn enrichment', included: true },
      { name: 'Multi-channel activation tools', included: false },
      { name: 'Dedicated account manager & support', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 0,
    yearlyPrice: 0,
    description: 'For large organizations with custom needs & support.',
    visitors: 'Unlimited',
    contactSales: true,
    buttonText: 'Contact Sales',
    features: [
      { name: 'Unlimited identified visitors', included: true },
      { name: 'Intent data & lead scoring', included: true },
      { name: 'Email & LinkedIn enrichment', included: true },
      { name: 'Multi-channel activation tools', included: true },
      { name: 'Dedicated account manager & support', included: true },
    ],
  },
];

// Plan limits for visitor tracking
const PLAN_VISITOR_LIMITS: Record<string, number> = {
  free: 100,
  starter: 3000,
  growth: 5000,
  professional: 10000,
  enterprise: Infinity,
};

export default function Billing() {
  const { userProfile } = useAuth();
  const [identifiedVisitors, setIdentifiedVisitors] = useState<number | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [upgrading, setUpgrading] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [plans, setPlans] = useState<Plan[]>(defaultPlans);

  const currentPlan = userProfile?.plan || 'free';
  const visitorLimit = PLAN_VISITOR_LIMITS[currentPlan] || PLAN_VISITOR_LIMITS.free;

  // Calculate trial status
  const trialStatus = useMemo(() => {
    if (!userProfile || currentPlan !== 'free') return null;

    let trialEnd: Date;
    if (userProfile.trial_ends_at) {
      trialEnd = new Date(userProfile.trial_ends_at);
    } else if (userProfile.created_at) {
      const createdAt = new Date(userProfile.created_at);
      trialEnd = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else {
      return null;
    }

    const now = new Date();
    const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    return {
      daysRemaining: Math.max(0, daysRemaining),
      isExpired: daysRemaining <= 0,
      isExpiring: daysRemaining <= 2 && daysRemaining > 0,
    };
  }, [userProfile, currentPlan]);

  const loadVisitorStats = useCallback(async () => {
    try {
      setLoadingStats(true);
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const data = await response.json();
        setIdentifiedVisitors(data.overview?.identifiedVisitors || 0);
      }
    } catch (error) {
      console.error('Error loading visitor stats:', error);
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadStripePrices = useCallback(async () => {
    try {
      const response = await fetch('/api/settings/stripe-prices');
      const data = await response.json();

      if (response.ok) {
        // Update plans with Stripe price IDs and pricing from database
        setPlans(prevPlans =>
          prevPlans.map(plan => {
            const prices = data.prices?.[plan.id];
            const pricing = data.pricing?.[plan.id];

            return {
              ...plan,
              // Update Stripe price IDs
              stripePriceIdMonthly: prices?.monthly || plan.stripePriceIdMonthly,
              stripePriceIdYearly: prices?.yearly || plan.stripePriceIdYearly,
              // Update pricing from database
              monthlyPrice: pricing?.monthlyPrice || plan.monthlyPrice,
              yearlyPrice: pricing?.yearlyPrice || plan.yearlyPrice,
              visitors: pricing?.visitors || plan.visitors,
              // Update feature with visitors count
              features: plan.features.map((f, i) =>
                i === 0 && pricing?.visitors
                  ? { ...f, name: `Up to ${pricing.visitors} identified visitors` }
                  : f
              ),
            };
          })
        );
      }
    } catch (error) {
      console.error('Error loading Stripe prices:', error);
    }
  }, []);

  useEffect(() => {
    loadVisitorStats();
    loadStripePrices();
  }, [loadVisitorStats, loadStripePrices]);

  const handleUpgrade = async (plan: Plan) => {
    if (plan.contactSales) {
      window.location.href = 'mailto:sales@trafficai.io?subject=Enterprise Plan Inquiry';
      return;
    }

    const priceId = billingPeriod === 'monthly'
      ? plan.stripePriceIdMonthly
      : plan.stripePriceIdYearly;

    // Validate price ID before making the request
    if (!priceId) {
      alert(`Stripe is not configured for the ${plan.name} plan (${billingPeriod}). Please contact support.`);
      return;
    }

    if (!priceId.startsWith('price_')) {
      alert(`Invalid Stripe configuration for the ${plan.name} plan. The Price ID "${priceId}" is not a valid Stripe Price ID. Please contact support.`);
      return;
    }

    setSelectedPlan(plan.id);
    setUpgrading(true);

    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId,
          planId: plan.id,
          billingPeriod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Error creating checkout:', error);
      alert((error as Error).message || 'Failed to start checkout. Please try again.');
    } finally {
      setUpgrading(false);
      setSelectedPlan(null);
    }
  };

  const getPlanIcon = (planId: string) => {
    switch (planId) {
      case 'starter':
        return <IconStar size={24} />;
      case 'growth':
        return <IconGrowth size={24} />;
      case 'professional':
        return <IconRocket size={24} />;
      case 'enterprise':
        return <IconBolt size={24} />;
      default:
        return <IconStar size={24} />;
    }
  };

  // Get price to display (always shows monthly rate)
  const getDisplayPrice = (plan: Plan) => {
    if (plan.contactSales) return null;
    if (billingPeriod === 'monthly') {
      return plan.monthlyPrice;
    }
    // For yearly, yearlyPrice is the effective monthly rate (already set by admin)
    return plan.yearlyPrice;
  };

  const getSavings = (plan: Plan) => {
    if (plan.contactSales) return 0;
    // yearlyPrice is the effective monthly rate for annual billing
    const monthlyCostPerYear = plan.monthlyPrice * 12;
    const yearlyCostPerYear = plan.yearlyPrice * 12;
    return monthlyCostPerYear - yearlyCostPerYear;
  };

  return (
    <Layout title="Billing & Plan" pageTitle="Billing & Plan">
      <div className="row row-cards">
        {/* Current Usage */}
        <div className="col-12">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconTrendingUp className="icon me-2" />
                Current Usage
              </h3>
              <div className="card-actions">
                <button className="btn btn-ghost-primary btn-sm" onClick={loadVisitorStats}>
                  <IconRefresh size={16} className="me-1" />
                  Refresh
                </button>
              </div>
            </div>
            <div className="card-body">
              <div className="row g-4">
                <div className="col-md-4">
                  <div className="card card-sm">
                    <div className="card-body">
                      {(() => {
                        // Calculate available credits as (Plan Limit - Used Visitors)
                        const availableCredits = visitorLimit !== Infinity && identifiedVisitors !== null
                          ? Math.max(0, visitorLimit - identifiedVisitors)
                          : visitorLimit === Infinity ? null : visitorLimit;
                        const isLow = availableCredits !== null && visitorLimit !== Infinity
                          ? availableCredits < visitorLimit * 0.2
                          : false;
                        const isZero = availableCredits === 0;

                        return (
                          <div className="d-flex align-items-center">
                            <span className={`avatar me-3 ${isZero ? 'bg-danger-lt' : isLow ? 'bg-warning-lt' : 'bg-primary-lt'}`}>
                              <IconCreditCard size={20} />
                            </span>
                            <div>
                              <div className="text-muted small">Available Credits</div>
                              <div className={`h3 mb-0 ${isZero ? 'text-danger' : isLow ? 'text-warning' : ''}`}>
                                {loadingStats || identifiedVisitors === null ? (
                                  <IconLoader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                                ) : availableCredits !== null ? (
                                  availableCredits.toLocaleString()
                                ) : (
                                  'Unlimited'
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card card-sm">
                    <div className="card-body">
                      <div className="d-flex align-items-center">
                        <span className="avatar bg-green-lt me-3">
                          <IconEye size={20} />
                        </span>
                        <div>
                          <div className="text-muted small">Current Plan</div>
                          <div className="h3 mb-0 text-capitalize">{currentPlan}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="card card-sm">
                    <div className="card-body">
                      {(() => {
                        const usagePercent = identifiedVisitors !== null && visitorLimit !== Infinity
                          ? Math.round((identifiedVisitors / visitorLimit) * 100)
                          : 0;
                        const isOverLimit = usagePercent >= 100;
                        const isNearLimit = usagePercent >= 80;

                        return (
                          <>
                            <div className="d-flex align-items-center mb-2">
                              <span className={`avatar me-3 ${isOverLimit ? 'bg-danger-lt' : isNearLimit ? 'bg-warning-lt' : 'bg-azure-lt'}`}>
                                <IconUsers size={20} />
                              </span>
                              <div className="flex-grow-1">
                                <div className="text-muted small">Identified Visitors</div>
                                <div className={`h3 mb-0 ${isOverLimit ? 'text-danger' : isNearLimit ? 'text-warning' : ''}`}>
                                  {identifiedVisitors !== null ? identifiedVisitors.toLocaleString() : '-'}
                                  {visitorLimit !== Infinity && (
                                    <span className="text-muted fs-5"> / {visitorLimit.toLocaleString()}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {visitorLimit !== Infinity && identifiedVisitors !== null && (
                              <div className="progress progress-sm">
                                <div
                                  className={`progress-bar ${isOverLimit ? 'bg-danger' : isNearLimit ? 'bg-warning' : 'bg-primary'}`}
                                  style={{ width: `${Math.min(usagePercent, 100)}%` }}
                                />
                              </div>
                            )}
                            {trialStatus && (
                              <div className="mt-2 small">
                                <span className={trialStatus.isExpired ? 'text-danger' : trialStatus.isExpiring ? 'text-warning' : 'text-muted'}>
                                  {trialStatus.isExpired ? (
                                    <>Trial expired</>
                                  ) : (
                                    <><IconClock size={14} className="me-1" />{trialStatus.daysRemaining} days left in trial</>
                                  )}
                                </span>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Plans */}
        <div className="col-12">
          <div className="card">
            <div className="card-header position-relative">
              <h3 className="card-title">
                <IconRocket className="icon me-2" />
                Choose Your Plan
              </h3>
              {/* Billing Period Toggle - Centered */}
              <div className="billing-toggle-wrapper">
                <span className={`billing-label ${billingPeriod === 'monthly' ? 'active' : ''}`}>
                  Monthly
                </span>
                <label className="billing-switch">
                  <input
                    type="checkbox"
                    checked={billingPeriod === 'yearly'}
                    onChange={() => setBillingPeriod(billingPeriod === 'monthly' ? 'yearly' : 'monthly')}
                  />
                  <span className="billing-slider"></span>
                </label>
                <span className={`billing-label ${billingPeriod === 'yearly' ? 'active' : ''}`}>
                  Annually
                </span>
              </div>
            </div>
            <div className="card-body">
              <div className="row g-4">
                {plans.map((plan) => {
                  const price = getDisplayPrice(plan);
                  const savings = getSavings(plan);
                  const isCurrentPlan = currentPlan === plan.id;

                  return (
                    <div key={plan.id} className="col-lg-3 col-md-6">
                      <div
                        className={`card h-100 ${plan.popular ? 'border-primary' : ''}`}
                        style={plan.popular ? { borderWidth: '2px' } : {}}
                      >
                        {plan.popular && (
                          <div className="ribbon ribbon-top ribbon-bookmark bg-primary">
                            Popular
                          </div>
                        )}
                        <div className="card-body d-flex flex-column">
                          <div className="text-center mb-4">
                            <span className={`avatar avatar-lg ${plan.popular ? 'bg-primary' : 'bg-primary-lt'} mb-3`}>
                              {getPlanIcon(plan.id)}
                            </span>
                            <h3 className="mb-1">{plan.name}</h3>
                            {plan.contactSales ? (
                              <div className="h3 mb-0">Contact us for<br />custom solutions</div>
                            ) : (
                              <>
                                <div className="h1 mb-0">
                                  ${price?.toLocaleString()}
                                  <span className="text-muted fs-5">/mo</span>
                                </div>
                                {billingPeriod === 'yearly' && savings > 0 && (
                                  <small className="text-green">
                                    Save ${savings.toLocaleString()}/year
                                  </small>
                                )}
                              </>
                            )}
                          </div>

                          <p className="text-muted text-center small mb-3">
                            {plan.description}
                          </p>

                          <div className="mb-3">
                            <div className="fw-bold small mb-2">Key Features:</div>
                            <ul className="list-unstyled space-y-2 mb-0">
                              {plan.features.map((feature, index) => (
                                <li key={index} className="d-flex align-items-start">
                                  {feature.included ? (
                                    <IconCheck size={16} className="text-green me-2 flex-shrink-0 mt-1" />
                                  ) : (
                                    <IconX size={16} className="text-red me-2 flex-shrink-0 mt-1" />
                                  )}
                                  <span className={!feature.included ? 'text-muted' : ''}>
                                    {feature.name}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="mt-auto">
                            {isCurrentPlan ? (
                              <button className="btn btn-success w-100" disabled>
                                <IconCheck size={16} className="me-1" />
                                Current Plan
                              </button>
                            ) : plan.contactSales ? (
                              <a
                                href="mailto:sales@trafficai.io?subject=Enterprise Plan Inquiry"
                                className="btn btn-outline-primary w-100"
                              >
                                {plan.buttonText || 'Contact Sales'}
                              </a>
                            ) : (
                              <button
                                className={`btn ${plan.popular ? 'btn-primary' : 'btn-outline-primary'} w-100`}
                                onClick={() => handleUpgrade(plan)}
                                disabled={upgrading && selectedPlan === plan.id}
                              >
                                {upgrading && selectedPlan === plan.id ? (
                                  <>
                                    <IconLoader2 size={16} className="me-1" style={{ animation: 'spin 1s linear infinite' }} />
                                    Processing...
                                  </>
                                ) : (
                                  plan.buttonText || `Get Started with ${plan.name}`
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Billing History & Management */}
        <div className="col-lg-8">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <IconCreditCard className="icon me-2" />
                Billing History
              </h3>
              {currentPlan !== 'free' && (
                <div className="card-actions">
                  <button
                    className="btn btn-outline-secondary btn-sm"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/stripe/portal', {
                          method: 'POST',
                        });
                        const data = await response.json();
                        if (data.url) {
                          window.location.href = data.url;
                        }
                      } catch (error) {
                        console.error('Error opening portal:', error);
                      }
                    }}
                  >
                    <IconExternalLink size={16} className="me-1" />
                    Manage Subscription
                  </button>
                </div>
              )}
            </div>
            <div className="card-body">
              <div className="text-center py-4">
                <div className="text-muted">No billing history available</div>
                <small className="text-muted">
                  Your invoices and payment history will appear here
                </small>
              </div>
            </div>
          </div>
        </div>

        {/* Need Help */}
        <div className="col-lg-4">
          <div className="card bg-azure-lt">
            <div className="card-body">
              <h4 className="mb-2">Need a custom plan?</h4>
              <p className="text-muted mb-3">
                Contact our sales team for custom pricing, enterprise features, and volume discounts.
              </p>
              <a
                href="mailto:sales@trafficai.io"
                className="btn btn-azure"
              >
                <IconExternalLink size={16} className="me-1" />
                Contact Sales
              </a>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h4 className="mb-2">Secure Payments</h4>
              <p className="text-muted mb-3">
                All payments are processed securely through Stripe. We never store your card details.
              </p>
              <div className="d-flex gap-2 flex-wrap">
                <span className="badge bg-secondary-lt">Visa</span>
                <span className="badge bg-secondary-lt">Mastercard</span>
                <span className="badge bg-secondary-lt">Amex</span>
                <span className="badge bg-secondary-lt">Stripe</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .space-y-2 > li + li {
          margin-top: 0.5rem;
        }
        .billing-toggle-wrapper {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .billing-label {
          font-size: 1rem;
          font-weight: 500;
          color: var(--tblr-secondary-color);
          transition: color 0.2s ease;
        }
        .billing-label.active {
          color: var(--tblr-body-color);
          font-weight: 600;
        }
        .billing-switch {
          position: relative;
          display: inline-block;
          width: 64px;
          height: 32px;
          margin: 0;
          cursor: pointer;
        }
        .billing-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }
        .billing-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: var(--tblr-primary);
          transition: 0.3s;
          border-radius: 32px;
        }
        .billing-slider:before {
          position: absolute;
          content: "";
          height: 24px;
          width: 24px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: 0.3s;
          border-radius: 50%;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .billing-switch input:checked + .billing-slider:before {
          transform: translateX(32px);
        }
        .billing-switch:hover .billing-slider {
          box-shadow: 0 0 8px rgba(217, 57, 123, 0.5);
        }
      `}</style>
    </Layout>
  );
}
