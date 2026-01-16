/**
 * SchedulingModeSelector - Mode choice cards
 *
 * Clear visual choice between scheduling modes:
 * 1. Candidate picks slot - Send link with available times
 * 2. Candidate provides availability - Collect availability first
 */

'use client';

export type SchedulingMode = 'pick-slot' | 'provide-availability';

export interface SchedulingModeSelectorProps {
  selectedMode: SchedulingMode | null;
  onSelect: (mode: SchedulingMode) => void;
  className?: string;
}

export function SchedulingModeSelector({
  selectedMode,
  onSelect,
  className = '',
}: SchedulingModeSelectorProps) {
  const modes = [
    {
      id: 'pick-slot' as SchedulingMode,
      title: 'Candidate Picks a Slot',
      description: 'Send the candidate a link with available interview times. They select one and the meeting is scheduled immediately.',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
          />
        </svg>
      ),
      bestFor: 'Quick scheduling when you control the available times',
      steps: ['You set available slots', 'Candidate picks one', 'Meeting created'],
    },
    {
      id: 'provide-availability' as SchedulingMode,
      title: 'Candidate Provides Availability',
      description: 'Ask the candidate to submit when they\'re available. You then choose the best time that works for everyone.',
      icon: (
        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      ),
      bestFor: 'Flexible scheduling when coordinating multiple people',
      steps: ['Candidate submits availability', 'You review options', 'You schedule the meeting'],
    },
  ];

  return (
    <div className={`space-y-4 ${className}`}>
      <div>
        <h3 className="text-sm font-medium text-gray-900 mb-1">Scheduling Mode</h3>
        <p className="text-sm text-gray-500">How do you want to schedule this interview?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modes.map((mode) => {
          const isSelected = selectedMode === mode.id;

          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSelect(mode.id)}
              className={`
                text-left p-5 rounded-xl border-2 transition-all
                ${isSelected
                  ? 'border-[#1a5f5f] bg-[#1a5f5f]/5 ring-2 ring-[#1a5f5f]/20'
                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                }
              `}
            >
              {/* Header */}
              <div className="flex items-start gap-3 mb-3">
                <div
                  className={`
                    w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
                    ${isSelected
                      ? 'bg-[#1a5f5f] text-white'
                      : 'bg-gray-100 text-gray-600'
                    }
                  `}
                >
                  {mode.icon}
                </div>
                <div className="flex-1">
                  <h4 className={`font-medium ${isSelected ? 'text-[#1a5f5f]' : 'text-gray-900'}`}>
                    {mode.title}
                  </h4>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 bg-[#1a5f5f] rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Description */}
              <p className="text-sm text-gray-600 mb-3">{mode.description}</p>

              {/* Flow steps */}
              <div className="flex items-center gap-1 text-xs text-gray-500">
                {mode.steps.map((step, index) => (
                  <span key={index} className="flex items-center">
                    <span className={`px-2 py-0.5 rounded ${isSelected ? 'bg-[#1a5f5f]/10' : 'bg-gray-100'}`}>
                      {step}
                    </span>
                    {index < mode.steps.length - 1 && (
                      <svg className="w-3 h-3 mx-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </span>
                ))}
              </div>

              {/* Best for */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Best for:</span> {mode.bestFor}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default SchedulingModeSelector;
