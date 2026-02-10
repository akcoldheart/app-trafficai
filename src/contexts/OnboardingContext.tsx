import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@/contexts/AuthContext';

interface OnboardingContextType {
  isOnboarding: boolean;
  startTour: () => void;
}

const OnboardingContext = createContext<OnboardingContextType>({
  isOnboarding: false,
  startTour: () => {},
});

const TOUR_STEPS = [
  {
    element: '[data-tour="sidebar-nav"]',
    popover: {
      title: 'Navigation Hub',
      description: 'This is your main navigation. All key features are accessible from this sidebar.',
      side: 'right' as const,
      align: 'start' as const,
    },
  },
  {
    element: '[data-tour="nav-pixels"]',
    popover: {
      title: 'Install Your Tracking Pixel',
      description: 'Start by installing a tracking pixel on your website to begin identifying visitors.',
      side: 'right' as const,
      align: 'start' as const,
    },
  },
  {
    element: '[data-tour="nav-visitors"]',
    popover: {
      title: 'View Visitors in Real-Time',
      description: 'Once your pixel is live, see who\'s visiting your website with detailed visitor profiles.',
      side: 'right' as const,
      align: 'start' as const,
    },
  },
  {
    element: '[data-tour="nav-audiences"]',
    popover: {
      title: 'Create Targeted Audiences',
      description: 'Build custom audiences from your visitors and sync them to your ad platforms.',
      side: 'right' as const,
      align: 'start' as const,
    },
  },
];

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { userProfile, refreshUser } = useAuth();
  const router = useRouter();
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const hasTriggered = useRef(false);

  const completeOnboarding = useCallback(async () => {
    try {
      await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      await refreshUser();
    } catch (error) {
      console.error('Error completing onboarding:', error);
    }
  }, [refreshUser]);

  const startDriverTour = useCallback(() => {
    setShowWelcome(false);
    setIsOnboarding(true);

    // Dynamically import driver.js only on client side
    setTimeout(async () => {
      const { driver } = await import('driver.js');

      const driverObj = driver({
        showProgress: true,
        animate: true,
        allowClose: false,
        overlayColor: 'rgba(0, 0, 0, 0.75)',
        stagePadding: 8,
        stageRadius: 8,
        popoverClass: 'onboarding-popover',
        doneBtnText: 'Finish',
        steps: TOUR_STEPS,
        onDestroyStarted: () => {
          if (driverObj.isLastStep()) {
            driverObj.destroy();
            setIsOnboarding(false);
            setShowCompletion(true);
          }
        },
        onDestroyed: () => {
          setIsOnboarding(false);
        },
      });

      driverObj.drive();
    }, 300);
  }, []);

  const skipTour = useCallback(async () => {
    setShowWelcome(false);
    setIsOnboarding(false);
    await completeOnboarding();
  }, [completeOnboarding]);

  const finishTour = useCallback(async () => {
    setShowCompletion(false);
    await completeOnboarding();
  }, [completeOnboarding]);

  const handleGoToPixels = useCallback(() => {
    setShowCompletion(false);
    completeOnboarding();
    router.push('/pixels');
  }, [completeOnboarding, router]);

  const startTour = useCallback(() => {
    setShowWelcome(true);
  }, []);

  // Auto-trigger on dashboard for new users
  useEffect(() => {
    const isDashboard = router.pathname === '/' || router.pathname === '/partner/dashboard';
    if (
      !hasTriggered.current &&
      isDashboard &&
      userProfile &&
      userProfile.onboarding_completed !== true &&
      userProfile.role !== 'admin'
    ) {
      hasTriggered.current = true;
      // Small delay to let dashboard render
      const timer = setTimeout(() => {
        setShowWelcome(true);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [router.pathname, userProfile]);

  return (
    <OnboardingContext.Provider value={{ isOnboarding, startTour }}>
      {children}

      {/* Welcome Modal */}
      {showWelcome && (
        <div
          className="modal modal-blur show"
          style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }}
          tabIndex={-1}
        >
          <div className="modal-dialog modal-md modal-dialog-centered">
            <div className="modal-content" style={{ overflow: 'hidden' }}>
              <div className="onboarding-welcome-header">
                <h2>Welcome to TrafficAI!</h2>
                <p>Let&apos;s get you set up in under a minute.</p>
              </div>
              <div className="modal-body py-4">
                <div className="mb-4">
                  <div className="onboarding-step-list">
                    <div className="onboarding-step-item">
                      <span className="onboarding-step-number">1</span>
                      <span>Install your tracking pixel</span>
                    </div>
                    <div className="onboarding-step-item">
                      <span className="onboarding-step-number">2</span>
                      <span>View your website visitors</span>
                    </div>
                    <div className="onboarding-step-item">
                      <span className="onboarding-step-number">3</span>
                      <span>Create targeted audiences</span>
                    </div>
                  </div>
                </div>
                <div className="d-flex flex-column gap-2">
                  <button
                    type="button"
                    className="btn btn-primary w-100"
                    onClick={startDriverTour}
                  >
                    Let&apos;s Get Started
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost-secondary w-100"
                    onClick={skipTour}
                  >
                    Skip Tour
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion Modal */}
      {showCompletion && (
        <div
          className="modal modal-blur show"
          style={{ display: 'block', background: 'rgba(0,0,0,0.5)' }}
          tabIndex={-1}
        >
          <div className="modal-dialog modal-md modal-dialog-centered">
            <div className="modal-content" style={{ overflow: 'hidden' }}>
              <div className="onboarding-completion-header">
                <div className="onboarding-completion-icon">&#10003;</div>
                <h2>You&apos;re All Set!</h2>
                <p>You&apos;re ready to start identifying your website visitors.</p>
              </div>
              <div className="modal-body py-4">
                <div className="d-flex flex-column gap-2">
                  <button
                    type="button"
                    className="btn btn-primary w-100"
                    onClick={handleGoToPixels}
                  >
                    Go to Pixels
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost-secondary w-100"
                    onClick={finishTour}
                  >
                    Explore Dashboard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}
