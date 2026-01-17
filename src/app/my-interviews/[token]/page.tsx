'use client';

import { useState, useEffect, use } from 'react';
import { DateTime } from 'luxon';
import {
  generateGoogleCalendarUrl,
  generateOutlookCalendarUrl,
  generateIcsContent,
  CalendarEventData,
} from '@/lib/notifications/icsGenerator';

const COMMON_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Phoenix', label: 'Arizona (MST)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii Time (HST)' },
  { value: 'Europe/London', label: 'London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Paris (CET/CEST)' },
  { value: 'Asia/Tokyo', label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai', label: 'Shanghai (CST)' },
  { value: 'Australia/Sydney', label: 'Sydney (AEST/AEDT)' },
];

interface Interview {
  id: string;
  requestId: string;
  candidateName: string;
  candidateEmail: string;
  reqTitle: string;
  interviewType: string;
  status: 'pending' | 'booked' | 'rescheduled' | 'cancelled' | 'expired' | 'completed';
  durationMinutes: number;
  scheduledStart?: string;
  scheduledEnd?: string;
  conferenceJoinUrl?: string | null;
  publicToken?: string;
  createdAt: string;
}

interface PortalResponse {
  candidateName: string;
  candidateEmail: string;
  interviews: Interview[];
}

function formatInterviewType(type: string): string {
  const typeMap: Record<string, string> = {
    phone_screen: 'Phone Screen',
    hm_screen: 'Hiring Manager Screen',
    onsite: 'Onsite Interview',
    final: 'Final Interview',
  };
  return typeMap[type] || type;
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return { label: 'Action Required', className: 'bg-amber-100 text-amber-800' };
    case 'booked':
      return { label: 'Scheduled', className: 'bg-emerald-100 text-emerald-800' };
    case 'rescheduled':
      return { label: 'Rescheduled', className: 'bg-blue-100 text-blue-800' };
    case 'cancelled':
      return { label: 'Cancelled', className: 'bg-red-100 text-red-800' };
    case 'expired':
      return { label: 'Expired', className: 'bg-slate-100 text-slate-600' };
    case 'completed':
      return { label: 'Completed', className: 'bg-slate-100 text-slate-600' };
    default:
      return { label: status, className: 'bg-slate-100 text-slate-600' };
  }
}

function formatDateTime(isoString: string, timezone: string): string {
  const dt = DateTime.fromISO(isoString, { zone: 'UTC' }).setZone(timezone);
  return dt.toFormat("EEEE, MMMM d, yyyy 'at' h:mm a ZZZZ");
}

function formatDateTimeShort(isoString: string, timezone: string): string {
  const dt = DateTime.fromISO(isoString, { zone: 'UTC' }).setZone(timezone);
  return dt.toFormat("MMM d 'at' h:mm a");
}

function isUpcoming(scheduledStart?: string): boolean {
  if (!scheduledStart) return false;
  return new Date(scheduledStart) > new Date();
}

// Helper to create calendar event data from interview
function createCalendarEvent(interview: Interview, timezone: string): CalendarEventData {
  const start = new Date(interview.scheduledStart!);
  const end = new Date(interview.scheduledEnd!);

  return {
    title: `${formatInterviewType(interview.interviewType)} - ${interview.reqTitle}`,
    description: `Interview for ${interview.reqTitle}\n\nCandidate: ${interview.candidateName}`,
    startTime: start,
    endTime: end,
    timezone: timezone,
    organizerEmail: 'noreply@sched.app',
    attendees: [{ email: interview.candidateEmail, name: interview.candidateName }],
    conferenceUrl: interview.conferenceJoinUrl,
  };
}

// Download ICS file
function downloadIcsFile(interview: Interview, timezone: string) {
  const event = createCalendarEvent(interview, timezone);
  const icsContent = generateIcsContent(event);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `interview-${interview.reqTitle.toLowerCase().replace(/\s+/g, '-')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Step Indicator Component
function StepIndicator({ interview }: { interview: Interview }) {
  const steps = [
    { id: 1, name: 'Invited', completed: true },
    { id: 2, name: 'Scheduled', completed: ['booked', 'rescheduled', 'completed'].includes(interview.status) },
    { id: 3, name: 'Completed', completed: interview.status === 'completed' },
  ];

  // Determine current step
  let currentStep = 1;
  if (interview.status === 'pending') currentStep = 1;
  else if (['booked', 'rescheduled'].includes(interview.status)) currentStep = 2;
  else if (interview.status === 'completed') currentStep = 3;

  if (interview.status === 'cancelled' || interview.status === 'expired') {
    return null; // Don't show for cancelled/expired
  }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
        {steps.map((step, stepIdx) => (
          <div key={step.id} className="flex items-center flex-1">
            <div className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step.completed
                    ? 'bg-emerald-500 text-white'
                    : step.id === currentStep
                    ? 'bg-blue-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step.completed ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step.id
                )}
              </div>
              <span
                className={`ml-2 text-sm font-medium ${
                  step.completed ? 'text-emerald-600' : step.id === currentStep ? 'text-blue-600' : 'text-slate-500'
                }`}
              >
                {step.name}
              </span>
            </div>
            {stepIdx < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 mx-4 ${
                  steps[stepIdx + 1].completed || steps[stepIdx].completed
                    ? 'bg-emerald-200'
                    : 'bg-slate-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CandidatePortalPage({
  params,
}: {
  params: { token: string } | Promise<{ token: string }>;
}) {
  const resolvedParams = params instanceof Promise ? use(params) : params;
  const { token } = resolvedParams;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PortalResponse | null>(null);
  const [timezone, setTimezone] = useState(() => {
    if (typeof window !== 'undefined') {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
    return 'America/New_York';
  });

  useEffect(() => {
    async function fetchInterviews() {
      try {
        setLoading(true);
        const res = await fetch(`/api/candidate-portal/${token}`);
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to load interviews');
        }
        const result = await res.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchInterviews();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-4 text-slate-600">Loading your interviews...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Unable to Load</h1>
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">No Data Found</h1>
          <p className="text-slate-600">Unable to load interview information.</p>
        </div>
      </div>
    );
  }

  const { candidateName, interviews } = data;

  // Separate interviews by status
  const upcomingInterviews = interviews.filter(
    (i) => (i.status === 'booked' || i.status === 'rescheduled') && isUpcoming(i.scheduledStart)
  );
  const pendingInterviews = interviews.filter((i) => i.status === 'pending');
  const pastInterviews = interviews.filter(
    (i) =>
      i.status === 'cancelled' ||
      i.status === 'expired' ||
      i.status === 'completed' ||
      ((i.status === 'booked' || i.status === 'rescheduled') && !isUpcoming(i.scheduledStart))
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6">
          <h1 className="text-2xl font-bold text-slate-900">My Interviews</h1>
          <p className="mt-1 text-slate-600">Welcome back, {candidateName}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 sm:px-6">
        {/* Timezone selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Your Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full sm:w-auto px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {COMMON_TIMEZONES.map((tz) => (
              <option key={tz.value} value={tz.value}>
                {tz.label}
              </option>
            ))}
          </select>
        </div>

        {/* Action Required Section */}
        {pendingInterviews.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
              Action Required
            </h2>
            <div className="space-y-4">
              {pendingInterviews.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  timezone={timezone}
                  showAction
                />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming Interviews Section */}
        {upcomingInterviews.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Upcoming Interviews</h2>
            <div className="space-y-4">
              {upcomingInterviews.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  timezone={timezone}
                />
              ))}
            </div>
          </section>
        )}

        {/* Past Interviews Section */}
        {pastInterviews.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Past Interviews</h2>
            <div className="space-y-4">
              {pastInterviews.map((interview) => (
                <InterviewCard
                  key={interview.id}
                  interview={interview}
                  timezone={timezone}
                  isPast
                />
              ))}
            </div>
          </section>
        )}

        {/* Empty State */}
        {interviews.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Interviews Yet</h3>
            <p className="text-slate-600">
              When you receive interview invitations, they will appear here.
            </p>
          </div>
        )}

        {/* Help Section */}
        <div className="mt-12 bg-slate-100 rounded-xl p-6">
          <h3 className="font-medium text-slate-900 mb-2">Need Help?</h3>
          <p className="text-slate-600 text-sm">
            If you have questions about your interviews or need to make changes, please contact
            your recruiter directly. They can help you reschedule or address any concerns.
          </p>
        </div>
      </main>
    </div>
  );
}

function InterviewCard({
  interview,
  timezone,
  showAction = false,
  isPast = false,
}: {
  interview: Interview;
  timezone: string;
  showAction?: boolean;
  isPast?: boolean;
}) {
  const status = getStatusBadge(interview.status);
  const [showCalendarMenu, setShowCalendarMenu] = useState(false);

  const hasScheduledTime = interview.scheduledStart && interview.scheduledEnd;
  const canShowCalendarOptions = hasScheduledTime && isUpcoming(interview.scheduledStart) && !isPast;

  const handleAddToCalendar = (provider: 'google' | 'outlook' | 'ics') => {
    if (!hasScheduledTime) return;

    const event = createCalendarEvent(interview, timezone);

    if (provider === 'google') {
      window.open(generateGoogleCalendarUrl(event), '_blank');
    } else if (provider === 'outlook') {
      window.open(generateOutlookCalendarUrl(event), '_blank');
    } else if (provider === 'ics') {
      downloadIcsFile(interview, timezone);
    }
    setShowCalendarMenu(false);
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border ${isPast ? 'border-slate-200 opacity-75' : 'border-slate-200'} overflow-hidden`}>
      <div className="p-6">
        {/* Step Indicator */}
        {!isPast && <StepIndicator interview={interview} />}

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}>
                {status.label}
              </span>
              <span className="text-xs text-slate-500">
                {formatInterviewType(interview.interviewType)}
              </span>
            </div>
            <h3 className="text-lg font-semibold text-slate-900 truncate">
              {interview.reqTitle}
            </h3>
            <p className="text-sm text-slate-600 mt-1">
              {interview.durationMinutes} minutes
            </p>
          </div>
        </div>

        {/* Scheduled Time */}
        {interview.scheduledStart && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="font-medium text-slate-900">
                    {formatDateTime(interview.scheduledStart, timezone)}
                  </p>
                  <p className="text-sm text-slate-500">
                    Duration: {interview.durationMinutes} minutes
                  </p>
                </div>
              </div>

              {/* Add to Calendar Button */}
              {canShowCalendarOptions && (
                <div className="relative">
                  <button
                    onClick={() => setShowCalendarMenu(!showCalendarMenu)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add to Calendar
                  </button>

                  {showCalendarMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setShowCalendarMenu(false)}
                      />
                      <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                        <button
                          onClick={() => handleAddToCalendar('google')}
                          className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                          </svg>
                          Google Calendar
                        </button>
                        <button
                          onClick={() => handleAddToCalendar('outlook')}
                          className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 23 23">
                            <path fill="#f35325" d="M1 1h10v10H1z"/>
                            <path fill="#81bc06" d="M12 1h10v10H12z"/>
                            <path fill="#05a6f0" d="M1 12h10v10H1z"/>
                            <path fill="#ffba08" d="M12 12h10v10H12z"/>
                          </svg>
                          Outlook
                        </button>
                        <hr className="my-1 border-slate-100" />
                        <button
                          onClick={() => handleAddToCalendar('ics')}
                          className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                        >
                          <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                          </svg>
                          Download .ics
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Meeting Link */}
        {interview.conferenceJoinUrl && isUpcoming(interview.scheduledStart) && (
          <div className="mt-4">
            <a
              href={interview.conferenceJoinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Join Video Call
            </a>
          </div>
        )}

        {/* Action Button for Pending */}
        {showAction && interview.publicToken && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <a
              href={`/book/${interview.publicToken}`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Schedule Interview
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
