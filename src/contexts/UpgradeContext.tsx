import { createContext, useContext, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';
import {
  IconRocket,
  IconX,
  IconAlertTriangle,
  IconLock,
} from '@tabler/icons-react';

// Plan features configuration
export const PLAN_FEATURES: Record<string, string[]> = {
  free: [],
  starter: ['visitors_3000', 'intent_data'],
  growth: ['visitors_5000', 'intent_data'],
  professional: ['visitors_10000', 'intent_data', 'enrichment'],
  enterprise: ['visitors_unlimited', 'intent_data', 'enrichment', 'multi_channel', 'dedicated_support'],
};

// Feature display names
export const FEATURE_NAMES: Record<string, string> = {
  visitors_3000: 'Up to 3,000 identified visitors',
  visitors_5000: 'Up to 5,000 identified visitors',
  visitors_10000: 'Up to 10,000 identified visitors',
  visitors_unlimited: 'Unlimited identified visitors',
  intent_data: 'Intent data & lead scoring',
  enrichment: 'Email & LinkedIn enrichment',
  multi_channel: 'Multi-channel activation tools',
  dedicated_support: 'Dedicated account manager',
};

// Required plan for each feature
export const FEATURE_REQUIRED_PLAN: Record<string, string> = {
  enrichment: 'professional',
  multi_channel: 'enterprise',
  dedicated_support: 'enterprise',
};

interface UpgradePrompt {
  title: string;
  message: string;
  feature?: string;
  requiredPlan?: string;
}

interface UpgradeContextType {
  showUpgradePrompt: (prompt: UpgradePrompt) => void;
  hideUpgradePrompt: () => void;
  checkFeatureAccess: (feature: string) => boolean;
  requireFeature: (feature: string, callback?: () => void) => boolean;
}

const UpgradeContext = createContext<UpgradeContextType>({
  showUpgradePrompt: () => {},
  hideUpgradePrompt: () => {},
  checkFeatureAccess: () => false,
  requireFeature: () => false,
});

export function UpgradeProvider({ children }: { children: React.ReactNode }) {
  const { userProfile } = useAuth();
  const router = useRouter();
  const [prompt, setPrompt] = useState<UpgradePrompt | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const currentPlan = userProfile?.plan || 'free';
  const currentFeatures = PLAN_FEATURES[currentPlan] || [];

  const showUpgradePrompt = useCallback((newPrompt: UpgradePrompt) => {
    setPrompt(newPrompt);
    setIsVisible(true);
  }, []);

  const hideUpgradePrompt = useCallback(() => {
    setIsVisible(false);
    setTimeout(() => setPrompt(null), 300); // Clear after animation
  }, []);

  const checkFeatureAccess = useCallback((feature: string): boolean => {
    if (currentPlan === 'enterprise') return true;
    return currentFeatures.includes(feature);
  }, [currentPlan, currentFeatures]);

  const requireFeature = useCallback((feature: string, callback?: () => void): boolean => {
    if (checkFeatureAccess(feature)) {
      callback?.();
      return true;
    }

    const requiredPlan = FEATURE_REQUIRED_PLAN[feature] || 'starter';
    const featureName = FEATURE_NAMES[feature] || feature;

    showUpgradePrompt({
      title: 'Upgrade Required',
      message: `${featureName} is available on the ${requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1)} plan and above.`,
      feature,
      requiredPlan,
    });

    return false;
  }, [checkFeatureAccess, showUpgradePrompt]);

  const handleUpgrade = () => {
    hideUpgradePrompt();
    router.push('/account/billing');
  };

  return (
    <UpgradeContext.Provider
      value={{
        showUpgradePrompt,
        hideUpgradePrompt,
        checkFeatureAccess,
        requireFeature,
      }}
    >
      {children}

      {/* Upgrade Modal */}
      {prompt && (
        <div
          className={`modal modal-blur ${isVisible ? 'show' : ''}`}
          style={{ display: isVisible ? 'block' : 'none' }}
          tabIndex={-1}
          onClick={(e) => {
            if (e.target === e.currentTarget) hideUpgradePrompt();
          }}
        >
          <div className="modal-dialog modal-sm modal-dialog-centered">
            <div className="modal-content">
              <button
                type="button"
                className="btn-close"
                onClick={hideUpgradePrompt}
                aria-label="Close"
                style={{ position: 'absolute', top: '1rem', right: '1rem', zIndex: 1 }}
              />
              <div className="modal-body text-center py-4">
                <div className="mb-3">
                  <span className="avatar avatar-lg bg-warning-lt">
                    <IconLock size={32} className="text-warning" />
                  </span>
                </div>
                <h3 className="mb-2">{prompt.title}</h3>
                <p className="text-muted mb-4">{prompt.message}</p>
                <div className="d-flex gap-2 justify-content-center">
                  <button
                    type="button"
                    className="btn btn-ghost-secondary"
                    onClick={hideUpgradePrompt}
                  >
                    Maybe Later
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={handleUpgrade}
                  >
                    <IconRocket size={16} className="me-1" />
                    View Plans
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className={`modal-backdrop fade ${isVisible ? 'show' : ''}`} />
        </div>
      )}
    </UpgradeContext.Provider>
  );
}

export function useUpgrade() {
  const context = useContext(UpgradeContext);
  if (context === undefined) {
    throw new Error('useUpgrade must be used within an UpgradeProvider');
  }
  return context;
}
