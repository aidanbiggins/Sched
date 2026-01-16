/**
 * OnboardingWizard - Main wizard controller
 *
 * Manages the multi-step onboarding flow for new users.
 */

'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { OnboardingProgress, type OnboardingStep } from './OnboardingProgress';
import { WelcomeStep } from './steps/WelcomeStep';
import { ConnectCalendarStep } from './steps/ConnectCalendarStep';
import { InviteTeamStep } from './steps/InviteTeamStep';
import { ReadyStep } from './steps/ReadyStep';

type WizardStep = 'welcome' | 'calendar' | 'invite' | 'ready';

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export function OnboardingWizard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>('welcome');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  // Step definitions
  const steps: OnboardingStep[] = useMemo(
    () => [
      {
        id: 'welcome',
        label: 'Welcome',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
          </svg>
        ),
      },
      {
        id: 'calendar',
        label: 'Calendar',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        ),
      },
      {
        id: 'invite',
        label: 'Team',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        ),
      },
      {
        id: 'ready',
        label: 'Ready',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ),
      },
    ],
    []
  );

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  // Fetch organization
  useEffect(() => {
    if (session?.user) {
      fetchOrganization();
    }
  }, [session]);

  const fetchOrganization = async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();

      if (data.organizations?.length > 0) {
        // API returns flat structure: { id, name, slug, role, joinedAt }
        const org = data.organizations[0];
        setOrganization({ id: org.id, name: org.name, slug: org.slug });
      }
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  // Navigation handlers
  const goToStep = (step: WizardStep) => setCurrentStep(step);

  const handleComplete = async () => {
    // Mark onboarding as completed (could persist this)
    router.push('/hub');
  };

  // Loading states
  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#1a5f5f] border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-500 mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (status === 'unauthenticated') {
    router.push('/signin');
    return null;
  }

  // No organization - should redirect to create org
  if (!organization && !loading) {
    router.push('/onboarding');
    return null;
  }

  return (
    <div className="min-h-screen bg-[#faf9f7] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-4xl mx-auto">
          <OnboardingProgress steps={steps} currentStepIndex={currentStepIndex} />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 flex items-center justify-center py-12">
        <div className="w-full max-w-2xl">
          {currentStep === 'welcome' && (
            <WelcomeStep
              userName={session?.user?.name || undefined}
              onNext={() => goToStep('calendar')}
            />
          )}

          {currentStep === 'calendar' && (
            <ConnectCalendarStep
              onNext={() => goToStep('invite')}
              onBack={() => goToStep('welcome')}
            />
          )}

          {currentStep === 'invite' && organization && (
            <InviteTeamStep
              organizationId={organization.id}
              onNext={() => goToStep('ready')}
              onBack={() => goToStep('calendar')}
            />
          )}

          {currentStep === 'ready' && organization && (
            <ReadyStep
              organizationName={organization.name}
              onComplete={handleComplete}
            />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <span>Step {currentStepIndex + 1} of {steps.length}</span>
          <button
            onClick={() => router.push('/hub')}
            className="hover:text-gray-700 transition-colors"
          >
            Skip setup
          </button>
        </div>
      </footer>
    </div>
  );
}

export default OnboardingWizard;
