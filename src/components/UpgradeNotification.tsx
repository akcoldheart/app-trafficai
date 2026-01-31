import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconAlertTriangle,
  IconRocket,
  IconTrendingUp,
  IconUsers,
} from '@tabler/icons-react';

// Plan limits configuration (identified visitors per month)
const PLAN_LIMITS: Record<string, { visitors: number; name: string }> = {
  free: { visitors: 100, name: 'Free' },
  starter: { visitors: 3000, name: 'Starter' },
  growth: { visitors: 5000, name: 'Growth' },
  professional: { visitors: 10000, name: 'Professional' },
  enterprise: { visitors: Infinity, name: 'Enterprise' },
};

// Threshold percentages for showing warnings
const WARNING_THRESHOLD = 80; // Show warning at 80% usage
const CRITICAL_THRESHOLD = 95; // Show critical warning at 95%

interface UpgradeNotificationProps {
  className?: string;
}

export default function UpgradeNotification({ className = '' }: UpgradeNotificationProps) {
  const { userProfile } = useAuth();
  const [identifiedVisitors, setIdentifiedVisitors] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  const currentPlan = userProfile?.plan || 'free';
  const planLimit = PLAN_LIMITS[currentPlan] || PLAN_LIMITS.free;

  const loadUsage = useCallback(async () => {
    try {
      // Fetch dashboard stats to get identified visitors count
      const response = await fetch('/api/dashboard/stats');
      if (response.ok) {
        const data = await response.json();
        setIdentifiedVisitors(data.overview?.identifiedVisitors || 0);
      }
    } catch (error) {
      console.error('Error loading usage:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsage();
  }, [loadUsage]);

  // Check dismissal state from session storage
  useEffect(() => {
    const dismissedKey = `upgrade_notification_dismissed_${currentPlan}`;
    const dismissedTime = sessionStorage.getItem(dismissedKey);
    if (dismissedTime) {
      // Allow re-showing after 1 hour
      const hourAgo = Date.now() - 60 * 60 * 1000;
      if (parseInt(dismissedTime) > hourAgo) {
        setDismissed(true);
      }
    }
  }, [currentPlan]);

  const handleDismiss = () => {
    const dismissedKey = `upgrade_notification_dismissed_${currentPlan}`;
    sessionStorage.setItem(dismissedKey, Date.now().toString());
    setDismissed(true);
  };

  // Don't show for enterprise users
  if (currentPlan === 'enterprise') {
    return null;
  }

  // Don't show while loading
  if (loading || identifiedVisitors === null) {
    return null;
  }

  // Calculate usage percentage
  const usagePercent = planLimit.visitors === Infinity
    ? 0
    : Math.round((identifiedVisitors / planLimit.visitors) * 100);

  const isOverLimit = usagePercent >= 100;
  const isCritical = usagePercent >= CRITICAL_THRESHOLD;
  const isWarning = usagePercent >= WARNING_THRESHOLD;

  // Don't show if below warning threshold
  if (!isWarning) {
    return null;
  }

  // Always show if over limit, even if dismissed
  if (dismissed && !isOverLimit) {
    return null;
  }

  // Determine the next plan for upgrade
  const getNextPlan = () => {
    const planOrder = ['free', 'starter', 'growth', 'professional', 'enterprise'];
    const currentIndex = planOrder.indexOf(currentPlan);
    if (currentIndex < planOrder.length - 1) {
      return PLAN_LIMITS[planOrder[currentIndex + 1]];
    }
    return null;
  };

  const nextPlan = getNextPlan();

  // Determine notification style
  const getNotificationConfig = () => {
    if (isOverLimit) {
      return {
        bgClass: 'bg-danger text-white',
        icon: <IconAlertTriangle size={20} />,
        title: 'Visitor Limit Exceeded',
        message: `You've identified ${identifiedVisitors.toLocaleString()} visitors, exceeding your ${planLimit.visitors.toLocaleString()} limit.`,
        subMessage: 'New visitors won\'t be tracked until you upgrade.',
      };
    }
    if (isCritical) {
      return {
        bgClass: 'bg-warning',
        icon: <IconAlertTriangle size={20} />,
        title: 'Almost at Visitor Limit',
        message: `You've used ${usagePercent}% of your monthly visitor limit (${identifiedVisitors.toLocaleString()}/${planLimit.visitors.toLocaleString()}).`,
        subMessage: 'Upgrade soon to avoid missing new visitors.',
      };
    }
    return {
      bgClass: 'bg-azure-lt',
      icon: <IconTrendingUp size={20} />,
      title: 'Approaching Visitor Limit',
      message: `You've used ${usagePercent}% of your monthly visitor limit (${identifiedVisitors.toLocaleString()}/${planLimit.visitors.toLocaleString()}).`,
      subMessage: nextPlan ? `Upgrade to ${nextPlan.name} for up to ${nextPlan.visitors.toLocaleString()} visitors.` : '',
    };
  };

  const config = getNotificationConfig();

  return (
    <div className={`alert ${config.bgClass} alert-dismissible mb-3 ${className}`} role="alert">
      <div className="d-flex align-items-center">
        <span className="me-2">{config.icon}</span>
        <div className="flex-grow-1">
          <h4 className="alert-title mb-1 d-flex align-items-center gap-2">
            <IconUsers size={18} />
            {config.title}
          </h4>
          <div className={isOverLimit ? '' : 'text-secondary'}>
            {config.message}
            {config.subMessage && (
              <span className="ms-1">{config.subMessage}</span>
            )}
          </div>
        </div>
        <div className="ms-3 d-flex align-items-center gap-2">
          <Link href="/account/billing" className={`btn btn-sm ${isOverLimit ? 'btn-light' : 'btn-primary'}`}>
            <IconRocket size={16} className="me-1" />
            Upgrade Now
          </Link>
          {!isOverLimit && (
            <button
              type="button"
              className="btn-close"
              aria-label="Close"
              onClick={handleDismiss}
            />
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-2">
        <div className="d-flex justify-content-between small mb-1">
          <span>Identified Visitors</span>
          <span>{identifiedVisitors.toLocaleString()} / {planLimit.visitors.toLocaleString()}</span>
        </div>
        <div className="progress progress-sm">
          <div
            className={`progress-bar ${isOverLimit ? 'bg-danger' : isCritical ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${Math.min(usagePercent, 100)}%` }}
            role="progressbar"
            aria-valuenow={usagePercent}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>
    </div>
  );
}
