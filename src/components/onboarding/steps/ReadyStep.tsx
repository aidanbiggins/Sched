/**
 * ReadyStep - Final step of onboarding
 *
 * Congratulates the user and provides next steps.
 */

'use client';

import Link from 'next/link';

export interface ReadyStepProps {
  organizationName: string;
  onComplete: () => void;
}

export function ReadyStep({ organizationName, onComplete }: ReadyStepProps) {
  return (
    <div className="text-center px-4 max-w-lg mx-auto">
      {/* Success animation */}
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-10 h-10 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <h2 className="text-2xl font-bold text-gray-900 mb-2">You're All Set!</h2>
      <p className="text-gray-600 mb-8">
        <span className="font-medium">{organizationName}</span> is ready for interview scheduling.
      </p>

      {/* Quick actions */}
      <div className="grid gap-3 mb-8">
        <Link
          href="/coordinator"
          className="flex items-center gap-4 p-4 bg-[#1a5f5f]/5 border border-[#1a5f5f]/20 rounded-xl hover:bg-[#1a5f5f]/10 transition-colors text-left"
        >
          <div className="w-12 h-12 bg-[#1a5f5f] rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Create Your First Request</h3>
            <p className="text-sm text-gray-500">Start scheduling an interview</p>
          </div>
          <svg className="w-5 h-5 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link
          href="/settings/team"
          className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
        >
          <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Manage Team</h3>
            <p className="text-sm text-gray-500">Invite more members or adjust roles</p>
          </div>
          <svg className="w-5 h-5 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link
          href="/settings"
          className="flex items-center gap-4 p-4 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-colors text-left"
        >
          <div className="w-12 h-12 bg-gray-200 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-gray-900">Settings</h3>
            <p className="text-sm text-gray-500">Configure calendars and preferences</p>
          </div>
          <svg className="w-5 h-5 text-gray-400 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      {/* Go to dashboard */}
      <button
        onClick={onComplete}
        className="px-8 py-3 bg-[#1a5f5f] text-white font-medium rounded-lg hover:bg-[#154d4d] transition-colors"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

export default ReadyStep;
