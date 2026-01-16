'use client';

import { useState, useEffect, use, useCallback, useMemo } from 'react';
import { ProfessionalCalendar, TIMEZONE_OPTIONS } from '@/components/scheduling';
import {
  AvailabilityBlock,
  fromApiFormat,
  toApiFormat,
  formatInTimezone,
} from '@/lib/scheduling/availabilityBlocks';

interface ApiBlock {
  id?: string;
  startAt: string;
  endAt: string;
}

interface AvailabilityRequest {
  id: string;
  status: string;
  candidateName: string;
  reqTitle: string;
  interviewType: string;
  durationMinutes: number;
  windowStart: string;
  windowEnd: string;
  expiresAt: string;
  candidateTimezone: string | null;
  minTotalMinutes: number;
  minBlocks: number;
  existingBlocks: ApiBlock[];
}

type Step = 'input' | 'review' | 'submitted';

export default function CandidateAvailabilityPage({
  params,
}: {
  params: { token: string } | Promise<{ token: string }>;
}) {
  const resolvedParams = params instanceof Promise ? use(params) : params;
  const { token } = resolvedParams;

  const [step, setStep] = useState<Step>('input');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<AvailabilityRequest | null>(null);
  const [timezone, setTimezone] = useState('America/New_York');
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);

  // Load request details
  useEffect(() => {
    async function loadRequest() {
      try {
        const response = await fetch(`/api/public/availability/${token}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to load availability request');
        }
        const data = await response.json();
        setRequest(data);

        if (data.candidateTimezone) {
          setTimezone(data.candidateTimezone);
        }

        if (data.existingBlocks && data.existingBlocks.length > 0) {
          // Convert API format to internal format
          setBlocks(data.existingBlocks.map((b: ApiBlock, i: number) => fromApiFormat({
            id: b.id,
            startAt: b.startAt,
            endAt: b.endAt,
          }, i)));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    loadRequest();
  }, [token]);

  // Calculate total availability
  const totalMinutes = useMemo(() => {
    return blocks.reduce((sum, block) => {
      const start = new Date(block.startUtcIso);
      const end = new Date(block.endUtcIso);
      return sum + (end.getTime() - start.getTime()) / (1000 * 60);
    }, 0);
  }, [blocks]);

  // Handle blocks change from calendar
  const handleBlocksChange = useCallback((newBlocks: AvailabilityBlock[]) => {
    setBlocks(newBlocks);
  }, []);

  // Submit availability
  const submitAvailability = useCallback(async () => {
    if (!request) return;

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`/api/public/availability/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidateTimezone: timezone,
          blocks: blocks.map(b => toApiFormat(b)),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details && Array.isArray(data.details)) {
          throw new Error(data.details.join('\n'));
        }
        throw new Error(data.error || 'Failed to submit availability');
      }

      setStep('submitted');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }, [request, token, timezone, blocks]);

  // Format block for display in review
  const formatBlock = useCallback((block: AvailabilityBlock): string => {
    const start = new Date(block.startUtcIso);
    const end = new Date(block.endUtcIso);

    const dateStr = formatInTimezone(start, timezone, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });

    const startStr = formatInTimezone(start, timezone, {
      hour: 'numeric',
      minute: '2-digit',
    });

    const endStr = formatInTimezone(end, timezone, {
      hour: 'numeric',
      minute: '2-digit',
    });

    return `${dateStr}: ${startStr} - ${endStr}`;
  }, [timezone]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !request) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <div className="text-red-500 text-6xl mb-4">!</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">Unable to Load</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!request) return null;

  // Submitted confirmation
  if (step === 'submitted') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <div className="text-green-500 text-6xl mb-4">&#10003;</div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Availability Submitted
          </h1>
          <p className="text-gray-600 mb-4">
            Thank you! Your availability has been submitted for the{' '}
            <strong>{request.reqTitle}</strong> interview.
          </p>
          <p className="text-gray-500 text-sm">
            The coordinator will review your availability and schedule the interview.
            You will receive a calendar invitation once a time is selected.
          </p>
        </div>
      </div>
    );
  }

  // Review step
  if (step === 'review') {
    const meetsMinBlocks = blocks.length >= request.minBlocks;
    const meetsMinMinutes = totalMinutes >= request.minTotalMinutes;

    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Review Your Availability
            </h1>
            <p className="text-gray-600 mb-6">
              Please confirm your availability for the <strong>{request.reqTitle}</strong> interview.
            </p>

            {/* Requirements status */}
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-medium text-gray-900 mb-2">Requirements</h3>
              <div className="space-y-2 text-sm">
                <div className={`flex items-center ${meetsMinBlocks ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="mr-2">{meetsMinBlocks ? '✓' : '✗'}</span>
                  At least {request.minBlocks} time blocks ({blocks.length} provided)
                </div>
                <div className={`flex items-center ${meetsMinMinutes ? 'text-green-600' : 'text-red-600'}`}>
                  <span className="mr-2">{meetsMinMinutes ? '✓' : '✗'}</span>
                  At least {request.minTotalMinutes} minutes total ({Math.round(totalMinutes)} provided)
                </div>
              </div>
            </div>

            {/* Blocks list */}
            <div className="mb-6">
              <h3 className="font-medium text-gray-900 mb-3">Your Availability Blocks</h3>
              <div className="space-y-2">
                {blocks.map((block, index) => (
                  <div
                    key={block.id || index}
                    className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                  >
                    <span className="text-gray-900">{formatBlock(block)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timezone */}
            <div className="mb-6 text-sm text-gray-600">
              All times shown in: {TIMEZONE_OPTIONS.find(t => t.value === timezone)?.label || timezone}
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg whitespace-pre-line">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-4">
              <button
                onClick={() => setStep('input')}
                className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Edit Availability
              </button>
              <button
                onClick={submitAvailability}
                disabled={submitting || !meetsMinBlocks || !meetsMinMinutes}
                className={`flex-1 py-3 px-4 rounded-lg text-white font-medium ${
                  submitting || !meetsMinBlocks || !meetsMinMinutes
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {submitting ? 'Submitting...' : 'Submit Availability'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main calendar view using the professional calendar
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                Select Your Availability
              </h1>
              <p className="text-sm text-gray-500">
                {request.reqTitle} • {request.durationMinutes} min interview
              </p>
            </div>
            <button
              onClick={() => setStep('review')}
              disabled={blocks.length === 0}
              className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
                blocks.length === 0
                  ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg'
              }`}
            >
              Review ({blocks.length})
            </button>
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <ProfessionalCalendar
          blocks={blocks}
          onChange={handleBlocksChange}
          timezone={timezone}
          onTimezoneChange={setTimezone}
          initialDate={new Date(request.windowStart)}
          validRange={{
            start: new Date(request.windowStart),
            end: new Date(request.windowEnd),
          }}
          dayStart="07:00"
          dayEnd="21:00"
          slotDuration={15}
        />

        {/* Requirements hint */}
        <div className="mt-4 p-4 bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-600">
              <span className="font-medium">Requirements:</span> At least {request.minBlocks} block{request.minBlocks !== 1 ? 's' : ''} totaling {Math.round(request.minTotalMinutes / 60)}+ hours
            </div>
            <div className="text-gray-500">
              Click and drag on the calendar to add your available times
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
