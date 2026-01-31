import { useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconClock,
  IconAlertTriangle,
  IconRocket,
  IconGift,
} from '@tabler/icons-react';

interface TrialNotificationProps {
  className?: string;
}

export default function TrialNotification({ className = '' }: TrialNotificationProps) {
  const { userProfile } = useAuth();

  const trialStatus = useMemo(() => {
    if (!userProfile) return null;

    // Only show for free plan users
    const currentPlan = userProfile.plan || 'free';
    if (currentPlan !== 'free') return null;

    // Check if trial_ends_at exists
    if (!userProfile.trial_ends_at) {
      // Fallback: calculate from created_at + 7 days
      if (userProfile.created_at) {
        const createdAt = new Date(userProfile.created_at);
        const trialEnd = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        const now = new Date();
        const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

        return {
          daysRemaining,
          isExpired: daysRemaining <= 0,
          isExpiring: daysRemaining <= 2 && daysRemaining > 0,
          trialEndDate: trialEnd,
        };
      }
      return null;
    }

    const trialEnd = new Date(userProfile.trial_ends_at);
    const now = new Date();
    const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

    return {
      daysRemaining,
      isExpired: daysRemaining <= 0,
      isExpiring: daysRemaining <= 2 && daysRemaining > 0,
      trialEndDate: trialEnd,
    };
  }, [userProfile]);

  // Don't show if no trial status or paid user
  if (!trialStatus) return null;

  const { daysRemaining, isExpired, isExpiring } = trialStatus;

  // Determine notification style
  const getNotificationConfig = () => {
    if (isExpired) {
      return {
        bgClass: 'bg-danger text-white',
        icon: <IconAlertTriangle size={20} />,
        title: 'Trial Expired',
        message: 'Your free trial has ended. Upgrade now to continue accessing all features.',
        buttonText: 'Upgrade Now',
        buttonClass: 'btn-light',
      };
    }
    if (isExpiring) {
      return {
        bgClass: 'bg-warning',
        icon: <IconClock size={20} />,
        title: `Trial Ending Soon`,
        message: `Your free trial ends in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}. Upgrade to keep your data and features.`,
        buttonText: 'Choose a Plan',
        buttonClass: 'btn-dark',
      };
    }
    // Normal trial - show friendly reminder
    return {
      bgClass: 'bg-primary-lt',
      icon: <IconGift size={20} />,
      title: `${daysRemaining} Days Left in Trial`,
      message: 'Explore all features during your trial. Upgrade anytime to unlock more visitors.',
      buttonText: 'View Plans',
      buttonClass: 'btn-primary',
    };
  };

  const config = getNotificationConfig();

  return (
    <div className={`alert ${config.bgClass} alert-dismissible mb-3 ${className}`} role="alert">
      <div className="d-flex align-items-center">
        <span className="me-2">{config.icon}</span>
        <div className="flex-grow-1">
          <h4 className="alert-title mb-1">{config.title}</h4>
          <div className={isExpired ? '' : 'text-secondary'}>
            {config.message}
          </div>
        </div>
        <div className="ms-3">
          <Link href="/account/billing" className={`btn btn-sm ${config.buttonClass}`}>
            <IconRocket size={16} className="me-1" />
            {config.buttonText}
          </Link>
        </div>
      </div>

      {/* Progress bar showing trial progress */}
      {!isExpired && (
        <div className="mt-2">
          <div className="d-flex justify-content-between small mb-1">
            <span>Trial Progress</span>
            <span>{7 - daysRemaining} of 7 days used</span>
          </div>
          <div className="progress progress-sm">
            <div
              className={`progress-bar ${isExpiring ? 'bg-warning' : 'bg-primary'}`}
              style={{ width: `${((7 - daysRemaining) / 7) * 100}%` }}
              role="progressbar"
            />
          </div>
        </div>
      )}
    </div>
  );
}
