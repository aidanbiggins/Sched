'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type WalkthroughStep =
  | 'welcome'
  | 'create-request'
  | 'link-generated'
  | 'select-time'
  | 'booking-confirmed'
  | 'candidate-portal'
  | 'coordinator-dashboard'
  | 'complete';

const STEPS: WalkthroughStep[] = [
  'welcome',
  'create-request',
  'link-generated',
  'select-time',
  'booking-confirmed',
  'candidate-portal',
  'coordinator-dashboard',
  'complete',
];

const DEMO_DATA = {
  candidate: {
    name: 'Alex Morgan',
    email: 'alex.morgan@example.com',
  },
  position: {
    title: 'Senior Software Engineer',
    type: 'Phone Screen',
    duration: 60,
  },
  interviewer: {
    name: 'Sarah Chen',
    email: 'sarah.chen@acme.com',
  },
  booking: {
    date: 'Tomorrow',
    time: '10:00 AM',
    timezone: 'Pacific Time (PT)',
  },
  link: 'https://sched.example.com/book/abc123xyz',
};

function useTypewriter(text: string, delay: number = 50, trigger: boolean = true) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!trigger) {
      setDisplayText('');
      setIsComplete(false);
      return;
    }

    let i = 0;
    setDisplayText('');
    setIsComplete(false);

    const interval = setInterval(() => {
      if (i < text.length) {
        setDisplayText(text.slice(0, i + 1));
        i++;
      } else {
        setIsComplete(true);
        clearInterval(interval);
      }
    }, delay);

    return () => clearInterval(interval);
  }, [text, delay, trigger]);

  return { displayText, isComplete };
}

function ProgressBar({ currentStep }: { currentStep: WalkthroughStep }) {
  const currentIndex = STEPS.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, index) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-3 h-3 rounded-full transition-all duration-300 ${
              index < currentIndex
                ? 'bg-green-500'
                : index === currentIndex
                ? 'bg-indigo-600 ring-4 ring-indigo-100'
                : 'bg-gray-300'
            }`}
          />
          {index < STEPS.length - 1 && (
            <div
              className={`w-8 h-0.5 transition-all duration-300 ${
                index < currentIndex ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: 'coordinator' | 'candidate' | 'system' }) {
  const colors = {
    coordinator: 'bg-indigo-100 text-indigo-700',
    candidate: 'bg-emerald-100 text-emerald-700',
    system: 'bg-slate-100 text-slate-700',
  };

  const labels = {
    coordinator: 'Coordinator View',
    candidate: 'Candidate View',
    system: 'Overview',
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${colors[role]}`}>
      {labels[role]}
    </span>
  );
}

function StepContainer({
  children,
  title,
  description,
  role,
  onBack,
  onNext,
  nextLabel = 'Continue',
  showBack = true,
}: {
  children: React.ReactNode;
  title: string;
  description: string;
  role?: 'coordinator' | 'candidate' | 'system';
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  showBack?: boolean;
}) {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-6">
        {role && (
          <div className="mb-4">
            <RoleBadge role={role} />
          </div>
        )}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
        <p className="text-gray-600">{description}</p>
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
        {children}
      </div>

      <div className="flex justify-between items-center">
        {showBack && onBack ? (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition px-4 py-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        ) : (
          <div />
        )}
        <button
          onClick={onNext}
          className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition"
        >
          {nextLabel}
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="mb-8">
        <div className="w-24 h-24 bg-indigo-100 rounded-full mb-6 mx-auto flex items-center justify-center text-4xl">
          📅
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          See Interview Scheduling in Action
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          A 60-second guided tour - no sign-up required
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-6 mb-8 text-left">
        <h3 className="font-semibold text-gray-900 mb-4">What you&apos;ll see:</h3>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-indigo-600 text-xs font-bold">1</span>
            </div>
            <span className="text-gray-700">How coordinators create scheduling requests</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-indigo-600 text-xs font-bold">2</span>
            </div>
            <span className="text-gray-700">The candidate booking experience</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-indigo-600 text-xs font-bold">3</span>
            </div>
            <span className="text-gray-700">Self-service candidate portal</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-indigo-600 text-xs font-bold">4</span>
            </div>
            <span className="text-gray-700">The coordinator dashboard for tracking</span>
          </li>
        </ul>
      </div>

      <button
        onClick={onNext}
        className="inline-flex items-center gap-2 bg-indigo-600 text-white px-8 py-3 rounded-lg font-semibold text-lg hover:bg-indigo-700 transition"
      >
        Start Tour
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
        </svg>
      </button>
    </div>
  );
}

function CreateRequestStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [animationPhase, setAnimationPhase] = useState(0);

  const candidateName = useTypewriter(DEMO_DATA.candidate.name, 50, animationPhase >= 1);
  const candidateEmail = useTypewriter(DEMO_DATA.candidate.email, 30, animationPhase >= 2);
  const position = useTypewriter(DEMO_DATA.position.title, 40, animationPhase >= 3);
  const interviewer = useTypewriter(DEMO_DATA.interviewer.email, 30, animationPhase >= 4);

  useEffect(() => {
    const timers = [
      setTimeout(() => setAnimationPhase(1), 300),
      setTimeout(() => setAnimationPhase(2), 1200),
      setTimeout(() => setAnimationPhase(3), 2200),
      setTimeout(() => setAnimationPhase(4), 3000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <StepContainer
      title="Coordinator Creates Request"
      description="This is what your recruiting team sees when scheduling an interview"
      role="coordinator"
      onBack={onBack}
      onNext={onNext}
      nextLabel="Create Request"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Name</label>
          <div className="relative">
            <input
              type="text"
              value={candidateName.displayText}
              readOnly
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
            />
            {!candidateName.isComplete && animationPhase >= 1 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-600 animate-pulse" />
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Email</label>
          <div className="relative">
            <input
              type="text"
              value={candidateEmail.displayText}
              readOnly
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
            />
            {!candidateEmail.isComplete && animationPhase >= 2 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-600 animate-pulse" />
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
            <div className="relative">
              <input
                type="text"
                value={position.displayText}
                readOnly
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
              />
              {!position.isComplete && animationPhase >= 3 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-600 animate-pulse" />
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interview Type</label>
            <div className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-900">
              {animationPhase >= 3 ? 'Phone Screen' : 'Select type...'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
            <div className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-900">
              {animationPhase >= 3 ? '60 minutes' : 'Select duration...'}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interviewer</label>
            <div className="relative">
              <input
                type="text"
                value={interviewer.displayText}
                readOnly
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-50 text-gray-900"
              />
              {!interviewer.isComplete && animationPhase >= 4 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-indigo-600 animate-pulse" />
              )}
            </div>
          </div>
        </div>
      </div>
    </StepContainer>
  );
}

function LinkGeneratedStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowCheck(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <StepContainer
      title="Booking Link Generated"
      description="A unique link is generated for each candidate"
      role="system"
      onBack={onBack}
      onNext={onNext}
      nextLabel="Send to Candidate"
    >
      <div className="text-center">
        <div className={`inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6 transition-all duration-500 ${showCheck ? 'scale-100 opacity-100' : 'scale-50 opacity-0'}`}>
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-2">Request Created Successfully</h3>
        <p className="text-gray-600 mb-6">Share this link with the candidate to let them book their interview</p>

        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center gap-3">
          <div className="flex-1 text-left">
            <p className="text-xs text-gray-500 mb-1">Booking Link</p>
            <p className="text-sm font-mono text-gray-900 truncate">{DEMO_DATA.link}</p>
          </div>
          <button className="p-2 text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        </div>

        <div className="mt-6 text-sm text-gray-500">
          <p>Candidate: {DEMO_DATA.candidate.name} &middot; {DEMO_DATA.candidate.email}</p>
        </div>
      </div>
    </StepContainer>
  );
}

function SelectTimeStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setSelectedSlot(1), 800);
    return () => clearTimeout(timer);
  }, []);

  const slots = [
    { time: '9:00 AM', available: true },
    { time: '10:00 AM', available: true },
    { time: '11:00 AM', available: true },
    { time: '2:00 PM', available: true },
    { time: '3:00 PM', available: true },
  ];

  return (
    <StepContainer
      title="Candidate Selects Time"
      description="The candidate picks a time that works for them"
      role="candidate"
      onBack={onBack}
      onNext={onNext}
      nextLabel="Select 10:00 AM"
    >
      <div>
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span>Tomorrow - {DEMO_DATA.booking.timezone}</span>
          </div>
          <h3 className="font-semibold text-gray-900">{DEMO_DATA.position.title}</h3>
          <p className="text-sm text-gray-600">{DEMO_DATA.position.type} &middot; {DEMO_DATA.position.duration} minutes with {DEMO_DATA.interviewer.name}</p>
        </div>

        <div className="space-y-2">
          {slots.map((slot, index) => (
            <button
              key={slot.time}
              className={`w-full p-3 rounded-lg border-2 text-left transition-all duration-300 ${
                selectedSlot === index
                  ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-200'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-medium ${selectedSlot === index ? 'text-indigo-700' : 'text-gray-900'}`}>
                  {slot.time}
                </span>
                {selectedSlot === index && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-indigo-600 font-medium animate-pulse">Selected</span>
                    <svg className="w-5 h-5 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </StepContainer>
  );
}

function BookingConfirmedStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowDetails(true), 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <StepContainer
      title="Booking Confirmed!"
      description="Calendar invites sent to everyone automatically"
      role="candidate"
      onBack={onBack}
      onNext={onNext}
      nextLabel="View Candidate Portal"
    >
      <div className="text-center">
        <div className={`inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6 transition-all duration-500 ${showDetails ? 'scale-100' : 'scale-0'}`}>
          <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h3 className="text-lg font-semibold text-gray-900 mb-6">Your interview is scheduled!</h3>

        <div className={`bg-gray-50 rounded-lg p-5 text-left transition-all duration-500 ${showDetails ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="text-sm text-gray-500">Date & Time</p>
                <p className="font-medium text-gray-900">{DEMO_DATA.booking.date} at {DEMO_DATA.booking.time} ({DEMO_DATA.booking.timezone})</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="text-sm text-gray-500">Interview</p>
                <p className="font-medium text-gray-900">{DEMO_DATA.position.title} - {DEMO_DATA.position.type}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <div>
                <p className="text-sm text-gray-500">Interviewer</p>
                <p className="font-medium text-gray-900">{DEMO_DATA.interviewer.name}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-gray-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <div>
                <p className="text-sm text-gray-500">Meeting Link</p>
                <p className="font-medium text-indigo-600">teams.microsoft.com/meet/abc123</p>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-4 text-sm text-gray-500">
          A calendar invite has been sent to your email
        </p>
      </div>
    </StepContainer>
  );
}

function CandidatePortalStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <StepContainer
      title="Candidate Portal"
      description="Candidates can view, reschedule, or cancel anytime"
      role="candidate"
      onBack={onBack}
      onNext={onNext}
      nextLabel="View Coordinator Dashboard"
    >
      <div>
        <div className="mb-4 pb-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">My Interviews</h3>
          <p className="text-sm text-gray-500">Manage your upcoming interviews</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h4 className="font-semibold text-gray-900">{DEMO_DATA.position.title}</h4>
              <p className="text-sm text-gray-600">{DEMO_DATA.position.type}</p>
            </div>
            <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              Confirmed
            </span>
          </div>

          <div className="space-y-2 text-sm mb-4">
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{DEMO_DATA.booking.date} at {DEMO_DATA.booking.time}</span>
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>With {DEMO_DATA.interviewer.name}</span>
            </div>
          </div>

          <div className="flex gap-2">
            <button className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Reschedule
            </button>
            <button className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
              Join Meeting
            </button>
          </div>
        </div>

        <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-start gap-2">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-blue-700">
            Candidates access their portal via a secure link sent to their email - no login required.
          </p>
        </div>
      </div>
    </StepContainer>
  );
}

function CoordinatorDashboardStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <StepContainer
      title="Coordinator Dashboard"
      description="Track all requests, view message history, manage bookings"
      role="coordinator"
      onBack={onBack}
      onNext={onNext}
      nextLabel="Finish Tour"
    >
      <div>
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-200">
          <h3 className="font-semibold text-gray-900">Scheduling Requests</h3>
          <span className="text-sm text-gray-500">3 total requests</span>
        </div>

        <div className="space-y-3">
          {/* The demo request */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-gray-900">{DEMO_DATA.candidate.name}</h4>
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    Booked
                  </span>
                </div>
                <p className="text-sm text-gray-600">{DEMO_DATA.position.title}</p>
                <p className="text-xs text-gray-500 mt-1">{DEMO_DATA.booking.date} at {DEMO_DATA.booking.time}</p>
              </div>
              <button className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                View Details
              </button>
            </div>
          </div>

          {/* Other sample requests */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 opacity-60">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-gray-900">Jordan Lee</h4>
                  <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                    Pending
                  </span>
                </div>
                <p className="text-sm text-gray-600">Product Manager</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 opacity-60">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-gray-900">Riley Zhang</h4>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
                    Completed
                  </span>
                </div>
                <p className="text-sm text-gray-600">UX Designer</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </StepContainer>
  );
}

function CompleteStep({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Tour Complete!
        </h1>
        <p className="text-lg text-gray-600 mb-2">
          That&apos;s the complete interview scheduling flow.
        </p>
        <p className="text-gray-500">
          From request creation to booking confirmation in just a few clicks.
        </p>
      </div>

      <div className="bg-gray-50 rounded-xl p-6 mb-8">
        <h3 className="font-semibold text-gray-900 mb-4">Key Benefits</h3>
        <div className="grid grid-cols-2 gap-4 text-left">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-700">Zero back-and-forth emails</span>
          </div>
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-700">Automatic calendar syncing</span>
          </div>
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-700">Self-service rescheduling</span>
          </div>
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-700">Full audit trail</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/demo"
          className="inline-flex items-center justify-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700 transition"
        >
          Try It Yourself
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center gap-2 bg-white text-gray-700 px-6 py-3 rounded-lg font-semibold border border-gray-300 hover:bg-gray-50 transition"
        >
          Sign Up
        </Link>
        <button
          onClick={onRestart}
          className="inline-flex items-center justify-center gap-2 text-gray-600 px-6 py-3 rounded-lg font-medium hover:text-gray-900 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Restart Tour
        </button>
      </div>
    </div>
  );
}

function WalkthroughContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState<WalkthroughStep>('welcome');

  // Sync step from URL on mount
  useEffect(() => {
    const stepParam = searchParams.get('step');
    if (stepParam) {
      const stepIndex = parseInt(stepParam, 10) - 1;
      if (stepIndex >= 0 && stepIndex < STEPS.length) {
        setCurrentStep(STEPS[stepIndex]);
      }
    }
  }, [searchParams]);

  // Update URL when step changes
  const updateStep = useCallback((step: WalkthroughStep) => {
    setCurrentStep(step);
    const stepIndex = STEPS.indexOf(step) + 1;
    router.replace(`/demo/walkthrough?step=${stepIndex}`, { scroll: false });
  }, [router]);

  const goNext = useCallback(() => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      updateStep(STEPS[currentIndex + 1]);
    }
  }, [currentStep, updateStep]);

  const goBack = useCallback(() => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      updateStep(STEPS[currentIndex - 1]);
    }
  }, [currentStep, updateStep]);

  const restart = useCallback(() => {
    updateStep('welcome');
  }, [updateStep]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (currentStep !== 'complete') {
          goNext();
        }
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        if (currentStep !== 'welcome') {
          goBack();
        }
      } else if (e.key === 'Escape') {
        router.push('/demo');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, goNext, goBack, router]);

  const renderStep = () => {
    switch (currentStep) {
      case 'welcome':
        return <WelcomeStep onNext={goNext} />;
      case 'create-request':
        return <CreateRequestStep onBack={goBack} onNext={goNext} />;
      case 'link-generated':
        return <LinkGeneratedStep onBack={goBack} onNext={goNext} />;
      case 'select-time':
        return <SelectTimeStep onBack={goBack} onNext={goNext} />;
      case 'booking-confirmed':
        return <BookingConfirmedStep onBack={goBack} onNext={goNext} />;
      case 'candidate-portal':
        return <CandidatePortalStep onBack={goBack} onNext={goNext} />;
      case 'coordinator-dashboard':
        return <CoordinatorDashboardStep onBack={goBack} onNext={goNext} />;
      case 'complete':
        return <CompleteStep onRestart={restart} />;
      default:
        return <WelcomeStep onNext={goNext} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white overflow-hidden relative">
      {/* Skip link */}
      <div className="absolute top-4 right-4 z-10">
        <Link
          href="/demo"
          className="text-sm text-gray-500 hover:text-gray-700 transition"
        >
          Skip tour
        </Link>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-12 relative z-0">
        {currentStep !== 'welcome' && currentStep !== 'complete' && (
          <ProgressBar currentStep={currentStep} />
        )}

        {renderStep()}

        {/* Keyboard hint */}
        <div className="mt-12 text-center text-sm text-gray-400">
          <span className="hidden sm:inline">
            Use <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs">←</kbd> <kbd className="px-2 py-0.5 bg-gray-100 rounded text-xs">→</kbd> arrow keys to navigate
          </span>
        </div>
      </div>
    </div>
  );
}

function WalkthroughLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center">
      <div className="animate-pulse text-gray-400">Loading...</div>
    </div>
  );
}

export default function WalkthroughPage() {
  return (
    <Suspense fallback={<WalkthroughLoading />}>
      <WalkthroughContent />
    </Suspense>
  );
}
