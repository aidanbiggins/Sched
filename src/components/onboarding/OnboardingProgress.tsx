/**
 * OnboardingProgress - Step progress indicator
 *
 * Visual indicator showing current step in the onboarding flow.
 */

'use client';

export interface OnboardingStep {
  id: string;
  label: string;
  icon: React.ReactNode;
}

export interface OnboardingProgressProps {
  steps: OnboardingStep[];
  currentStepIndex: number;
  className?: string;
}

export function OnboardingProgress({
  steps,
  currentStepIndex,
  className = '',
}: OnboardingProgressProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex;
        const isCurrent = index === currentStepIndex;
        const isPending = index > currentStepIndex;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step indicator */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center
                  transition-all duration-300
                  ${isCompleted
                    ? 'bg-[#1a5f5f] text-white'
                    : isCurrent
                      ? 'bg-[#1a5f5f]/10 text-[#1a5f5f] ring-2 ring-[#1a5f5f]'
                      : 'bg-gray-100 text-gray-400'
                  }
                `}
              >
                {isCompleted ? (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.icon
                )}
              </div>
              <span
                className={`
                  mt-2 text-xs font-medium hidden sm:block
                  ${isCurrent ? 'text-[#1a5f5f]' : isCompleted ? 'text-gray-600' : 'text-gray-400'}
                `}
              >
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {index < steps.length - 1 && (
              <div
                className={`
                  w-8 sm:w-16 h-0.5 mx-1 sm:mx-2
                  transition-colors duration-300
                  ${isCompleted ? 'bg-[#1a5f5f]' : 'bg-gray-200'}
                `}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default OnboardingProgress;
