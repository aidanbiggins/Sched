/**
 * WelcomeStep - First step of onboarding
 *
 * Introduces the user to the system and what they'll set up.
 */

'use client';

export interface WelcomeStepProps {
  userName?: string;
  onNext: () => void;
}

export function WelcomeStep({ userName, onNext }: WelcomeStepProps) {
  const firstName = userName?.split(' ')[0] || 'there';

  return (
    <div className="text-center px-4">
      {/* Welcome illustration */}
      <div className="w-20 h-20 bg-[#1a5f5f]/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-[#1a5f5f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">
        Welcome, {firstName}!
      </h1>
      <p className="text-gray-600 mb-8 max-w-md mx-auto">
        Let's set up your interview scheduling in just a few steps.
        This will only take a minute.
      </p>

      {/* What we'll do */}
      <div className="bg-gray-50 rounded-xl p-6 mb-8 max-w-md mx-auto text-left">
        <h3 className="font-medium text-gray-900 mb-4">Here's what we'll do:</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-[#1a5f5f]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-[#1a5f5f]">1</span>
            </div>
            <div>
              <span className="font-medium text-gray-900">Create your organization</span>
              <p className="text-sm text-gray-500">Set up your team workspace</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-[#1a5f5f]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-[#1a5f5f]">2</span>
            </div>
            <div>
              <span className="font-medium text-gray-900">Verify calendar connection</span>
              <p className="text-sm text-gray-500">Confirm your calendar is linked</p>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-[#1a5f5f]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs font-bold text-[#1a5f5f]">3</span>
            </div>
            <div>
              <span className="font-medium text-gray-900">Invite your team</span>
              <p className="text-sm text-gray-500">Optionally add colleagues</p>
            </div>
          </li>
        </ul>
      </div>

      <button
        onClick={onNext}
        className="px-8 py-3 bg-[#1a5f5f] text-white font-medium rounded-lg hover:bg-[#154d4d] transition-colors"
      >
        Let's Get Started
      </button>
    </div>
  );
}

export default WelcomeStep;
