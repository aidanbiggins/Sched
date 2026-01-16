'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';

// Types
interface AvailableSlot {
  slotId: string;
  start: string;
  end: string;
  displayStart: string;
  displayEnd: string;
}

interface TimelineEvent {
  id: string;
  action: string;
  actorId?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

interface SyncJob {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  runAfter: string;
  createdAt: string;
  updatedAt?: string;
}

interface AttendeeResponse {
  email: string;
  displayName?: string;
  responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  isOrganizer: boolean;
}

interface RequestDetail {
  request: {
    id: string;
    applicationId?: string;
    candidateName: string;
    candidateEmail: string;
    reqTitle: string;
    interviewType: string;
    durationMinutes: number;
    interviewerEmails: string[];
    organizerEmail: string;
    status: string;
    publicToken: string;
    expiresAt: string;
    createdAt: string;
    updatedAt?: string;
    ageDays: number;
  };
  booking: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    calendarEventId: string | null;
    calendarIcalUid: string | null;
    conferenceJoinUrl: string | null;
    status: string;
    bookedAt: string;
    updatedAt?: string;
  } | null;
  timeline: TimelineEvent[];
  syncStatus: {
    hasPendingSync: boolean;
    hasFailedSync: boolean;
    pendingCount: number;
    failedCount: number;
    jobs: SyncJob[];
  };
}

export default function RequestDetailPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const resolvedParams = params instanceof Promise ? use(params) : params;
  const [data, setData] = useState<RequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReschedule, setShowReschedule] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [retryingSync, setRetryingSync] = useState(false);
  const [attendeeResponses, setAttendeeResponses] = useState<AttendeeResponse[]>([]);
  const [loadingAttendees, setLoadingAttendees] = useState(false);

  useEffect(() => {
    fetchDetail();
  }, [resolvedParams.id]);

  // Fetch attendee responses when we have a booking with a calendar event
  useEffect(() => {
    if (data?.booking?.calendarEventId) {
      fetchAttendeeResponses();
    }
  }, [data?.booking?.calendarEventId]);

  async function fetchAttendeeResponses() {
    if (!data?.booking?.calendarEventId) return;

    setLoadingAttendees(true);
    try {
      const res = await fetch(`/api/scheduling-requests/${resolvedParams.id}/attendees`);
      if (res.ok) {
        const responseData = await res.json();
        setAttendeeResponses(responseData.attendees || []);
      }
    } catch (err) {
      console.error('Failed to fetch attendee responses:', err);
    } finally {
      setLoadingAttendees(false);
    }
  }

  async function fetchDetail() {
    try {
      const res = await fetch(`/api/scheduling-requests/${resolvedParams.id}`);
      if (!res.ok) throw new Error('Failed to fetch request');
      const responseData = await res.json();
      setData(responseData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load request');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(reason: string) {
    try {
      const res = await fetch(`/api/scheduling-requests/${resolvedParams.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notifyParticipants: true }),
      });
      if (!res.ok) {
        const responseData = await res.json();
        throw new Error(responseData.error || 'Failed to cancel');
      }
      setShowCancel(false);
      fetchDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to cancel');
    }
  }

  async function handleReschedule(newSlotStartAtUtc: string, reason: string) {
    try {
      const res = await fetch(`/api/scheduling-requests/${resolvedParams.id}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSlotStartAtUtc, reason }),
      });
      if (!res.ok) {
        const responseData = await res.json();
        throw new Error(responseData.error || 'Failed to reschedule');
      }
      setShowReschedule(false);
      fetchDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to reschedule');
    }
  }

  async function handleRetrySync(jobId?: string) {
    setRetryingSync(true);
    try {
      const res = await fetch(`/api/scheduling-requests/${resolvedParams.id}/sync/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jobId ? { jobId } : {}),
      });
      if (!res.ok) {
        const responseData = await res.json();
        throw new Error(responseData.error || 'Failed to retry sync');
      }
      const result = await res.json();
      alert(result.message);
      fetchDetail();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to retry sync');
    } finally {
      setRetryingSync(false);
    }
  }

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800 border-amber-200',
      booked: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      confirmed: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      rescheduled: 'bg-sky-100 text-sky-800 border-sky-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
      expired: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    return colors[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  }

  function getSyncStatusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      processing: 'bg-sky-100 text-sky-700',
      completed: 'bg-emerald-100 text-emerald-700',
      failed: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-600';
  }

  function getTimelineIcon(action: string) {
    const icons: Record<string, string> = {
      created: '📝',
      booked: '✅',
      rescheduled: '🔄',
      cancelled: '❌',
      sync_started: '🔄',
      sync_completed: '✓',
      sync_failed: '⚠️',
      email_sent: '📧',
    };
    return icons[action] || '•';
  }

  function formatTimelineAction(action: string) {
    const labels: Record<string, string> = {
      created: 'Request created',
      booked: 'Interview booked',
      rescheduled: 'Interview rescheduled',
      cancelled: 'Interview cancelled',
      sync_started: 'Sync started',
      sync_completed: 'Sync completed',
      sync_failed: 'Sync failed',
      email_sent: 'Email sent',
    };
    return labels[action] || action;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
            {error || 'Request not found'}
          </div>
          <Link href="/coordinator" className="text-indigo-600 hover:text-indigo-800 mt-4 block">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const { request, booking, timeline, syncStatus } = data;
  const publicLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/book/${request.publicToken}`;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/coordinator"
                className="text-slate-500 hover:text-slate-700 text-sm"
              >
                ← Back to Dashboard
              </Link>
              <div className="h-4 w-px bg-slate-200" />
              <h1 className="text-lg font-semibold text-slate-900">
                Request Details
              </h1>
            </div>
            <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusBadge(request.status)}`}>
              {request.status}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-6">
          {/* Main Content - 2 columns */}
          <div className="col-span-2 space-y-6">
            {/* Request Info */}
            <div className="bg-white border border-slate-200 rounded-lg">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-base font-semibold text-slate-900">Request Information</h2>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Candidate
                    </label>
                    <p className="mt-1 font-medium text-slate-900">{request.candidateName}</p>
                    <p className="text-sm text-slate-600">{request.candidateEmail}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Position
                    </label>
                    <p className="mt-1 font-medium text-slate-900">{request.reqTitle}</p>
                  </div>
                  {request.applicationId && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Application ID
                      </label>
                      <p className="mt-1 font-mono text-sm text-slate-900">{request.applicationId}</p>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Interview Type
                    </label>
                    <p className="mt-1 text-slate-900">{request.interviewType.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Duration
                    </label>
                    <p className="mt-1 text-slate-900">{request.durationMinutes} minutes</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Interviewer(s)
                    </label>
                    <p className="mt-1 text-slate-900">{request.interviewerEmails.join(', ')}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Organizer
                    </label>
                    <p className="mt-1 text-slate-900">{request.organizerEmail}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Created
                    </label>
                    <p className="mt-1 text-slate-900">
                      {new Date(request.createdAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-slate-500">
                      {request.ageDays === 0 ? 'Today' : `${request.ageDays} days ago`}
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Expires
                    </label>
                    <p className="mt-1 text-slate-900">
                      {new Date(request.expiresAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Public Link - show for all active statuses */}
                {['pending', 'booked', 'rescheduled'].includes(request.status) && (
                  <div className="mt-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                    <label className="text-xs font-medium text-indigo-700 uppercase tracking-wider">
                      {request.status === 'pending' ? 'Candidate Booking Link' : 'Candidate Reschedule Link'}
                    </label>
                    <p className="text-xs text-indigo-600 mt-1 mb-2">
                      {request.status === 'pending'
                        ? 'Send this link to the candidate to book their interview slot'
                        : 'The candidate can use this link to reschedule if needed'}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={publicLink}
                        className="flex-1 px-3 py-2 border border-slate-200 rounded text-sm bg-white font-mono text-xs"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(publicLink);
                          alert('Link copied to clipboard!');
                        }}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 whitespace-nowrap"
                      >
                        Copy Link
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Booking Info */}
            {booking && (
              <div className="bg-white border border-slate-200 rounded-lg">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900">Booking Details</h2>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getStatusBadge(booking.status)}`}>
                    {booking.status}
                  </span>
                </div>
                <div className="p-6">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Scheduled Time
                      </label>
                      <p className="mt-1 font-medium text-slate-900">
                        {new Date(booking.scheduledStart).toLocaleString()}
                      </p>
                      <p className="text-sm text-slate-600">
                        to {new Date(booking.scheduledEnd).toLocaleTimeString()}
                      </p>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                        Booked At
                      </label>
                      <p className="mt-1 text-slate-900">
                        {new Date(booking.bookedAt).toLocaleString()}
                      </p>
                    </div>
                    {booking.calendarEventId && (
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Calendar Event ID
                        </label>
                        <p className="mt-1 font-mono text-xs text-slate-600 break-all">
                          {booking.calendarEventId}
                        </p>
                      </div>
                    )}
                    {booking.conferenceJoinUrl && (
                      <div>
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Meeting Link
                        </label>
                        <a
                          href={booking.conferenceJoinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 text-indigo-600 hover:text-indigo-800 text-sm break-all block"
                        >
                          Join Meeting →
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Attendee Responses */}
                  {booking.calendarEventId && (
                    <div className="mt-6 pt-4 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-3">
                        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                          Attendee Responses
                        </label>
                        <button
                          onClick={() => fetchAttendeeResponses()}
                          disabled={loadingAttendees}
                          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                        >
                          {loadingAttendees ? 'Refreshing...' : 'Refresh'}
                        </button>
                      </div>
                      {loadingAttendees && attendeeResponses.length === 0 ? (
                        <p className="text-sm text-slate-500">Loading responses...</p>
                      ) : attendeeResponses.length > 0 ? (
                        <div className="space-y-2">
                          {attendeeResponses
                            .filter((a) => !a.isOrganizer) // Hide organizer - they don't have meaningful response status
                            .map((attendee) => {
                              // Determine role: candidate or interviewer
                              const isCandidate = attendee.email.toLowerCase() === data?.request?.candidateEmail?.toLowerCase();
                              const role = isCandidate ? 'Candidate' : 'Interviewer';

                              return (
                                <div
                                  key={attendee.email}
                                  className="flex items-center justify-between py-1"
                                >
                                  <span className="text-sm text-slate-700">
                                    {attendee.displayName || attendee.email}
                                    <span className="ml-1 text-xs text-slate-400">({role})</span>
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                      attendee.responseStatus === 'accepted'
                                        ? 'bg-green-100 text-green-800'
                                        : attendee.responseStatus === 'declined'
                                        ? 'bg-red-100 text-red-800'
                                        : attendee.responseStatus === 'tentative'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : 'bg-slate-100 text-slate-600'
                                    }`}
                                  >
                                    {attendee.responseStatus === 'needsAction'
                                      ? 'No response'
                                      : attendee.responseStatus}
                                  </span>
                                </div>
                              );
                            })}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">No attendee data available</p>
                      )}
                    </div>
                  )}

                  {booking.status !== 'cancelled' && (
                    <div className="mt-6 pt-4 border-t border-slate-100 flex gap-3">
                      <button
                        onClick={() => setShowReschedule(true)}
                        className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => setShowCancel(true)}
                        className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Actions for pending requests */}
            {request.status === 'pending' && !booking && (
              <div className="bg-white border border-slate-200 rounded-lg p-6">
                <button
                  onClick={() => setShowCancel(true)}
                  className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700"
                >
                  Cancel Request
                </button>
              </div>
            )}
          </div>

          {/* Sidebar - 1 column */}
          <div className="space-y-6">
            {/* Sync Status Panel */}
            <div className="bg-white border border-slate-200 rounded-lg">
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Sync Status</h3>
                {syncStatus.hasFailedSync && (
                  <button
                    onClick={() => handleRetrySync()}
                    disabled={retryingSync}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
                  >
                    {retryingSync ? 'Retrying...' : 'Retry All'}
                  </button>
                )}
              </div>
              <div className="p-4">
                {syncStatus.jobs.length === 0 ? (
                  <p className="text-sm text-slate-500">No sync jobs</p>
                ) : (
                  <div className="space-y-3">
                    {/* Summary */}
                    <div className="flex gap-4 text-xs">
                      {syncStatus.pendingCount > 0 && (
                        <span className="text-amber-600">
                          {syncStatus.pendingCount} pending
                        </span>
                      )}
                      {syncStatus.failedCount > 0 && (
                        <span className="text-red-600">
                          {syncStatus.failedCount} failed
                        </span>
                      )}
                      {syncStatus.pendingCount === 0 && syncStatus.failedCount === 0 && (
                        <span className="text-emerald-600">All synced</span>
                      )}
                    </div>

                    {/* Job List */}
                    <div className="space-y-2">
                      {syncStatus.jobs.map((job) => (
                        <div
                          key={job.id}
                          className="p-3 bg-slate-50 rounded-lg text-xs"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-slate-700">
                              {job.type.replace(/_/g, ' ')}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded ${getSyncStatusBadge(job.status)}`}>
                              {job.status}
                            </span>
                          </div>
                          <div className="text-slate-500">
                            Attempts: {job.attempts}/{job.maxAttempts}
                          </div>
                          {job.lastError && (
                            <div className="mt-1 text-red-600 break-words">
                              Error: {job.lastError}
                            </div>
                          )}
                          {job.status === 'failed' && (
                            <button
                              onClick={() => handleRetrySync(job.id)}
                              disabled={retryingSync}
                              className="mt-2 text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white border border-slate-200 rounded-lg">
              <div className="px-4 py-3 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-900">Activity Timeline</h3>
              </div>
              <div className="p-4">
                {timeline.length === 0 ? (
                  <p className="text-sm text-slate-500">No activity yet</p>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-3 top-2 bottom-2 w-px bg-slate-200" />

                    {/* Timeline events */}
                    <div className="space-y-4">
                      {timeline.map((event, index) => (
                        <div key={event.id} className="relative flex gap-3">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-sm z-10">
                            {getTimelineIcon(event.action)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900">
                              {formatTimelineAction(event.action)}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(event.createdAt).toLocaleString()}
                            </p>
                            {event.actorId && (
                              <p className="text-xs text-slate-400">
                                by {event.actorId}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Modals */}
      {showReschedule && (
        <RescheduleModal
          requestId={request.id}
          currentStart={booking?.scheduledStart || ''}
          onClose={() => setShowReschedule(false)}
          onSubmit={handleReschedule}
        />
      )}

      {showCancel && (
        <CancelModal
          onClose={() => setShowCancel(false)}
          onSubmit={handleCancel}
        />
      )}
    </div>
  );
}

// Reschedule Modal Component
function RescheduleModal({
  requestId,
  currentStart,
  onClose,
  onSubmit,
}: {
  requestId: string;
  currentStart: string;
  onClose: () => void;
  onSubmit: (newSlotStartAtUtc: string, reason: string) => void;
}) {
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSlots();
  }, [requestId]);

  async function fetchSlots() {
    try {
      setLoading(true);
      const res = await fetch(`/api/scheduling-requests/${requestId}/reschedule`);
      if (!res.ok) {
        const responseData = await res.json();
        throw new Error(responseData.error || 'Failed to fetch available slots');
      }
      const responseData = await res.json();
      setSlots(responseData.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load slots');
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    setSubmitting(true);
    onSubmit(selectedSlot.start, reason);
  }

  // Group slots by date
  const slotsByDate = slots.reduce((acc, slot) => {
    const date = new Date(slot.start).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
    if (!acc[date]) acc[date] = [];
    acc[date].push(slot);
    return acc;
  }, {} as Record<string, AvailableSlot[]>);

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Reschedule Interview</h3>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 mt-2">Loading available slots...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-red-600">{error}</div>
          ) : slots.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No available time slots</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select a new time slot
                </label>
                <div className="space-y-4 max-h-64 overflow-y-auto border border-slate-200 rounded-lg p-3">
                  {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                    <div key={date}>
                      <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        {date}
                      </h4>
                      <div className="grid grid-cols-4 gap-2">
                        {dateSlots.map((slot) => {
                          const time = new Date(slot.start).toLocaleTimeString('en-US', {
                            hour: 'numeric',
                            minute: '2-digit',
                          });
                          const isSelected = selectedSlot?.slotId === slot.slotId;
                          const isCurrent = slot.start === currentStart;

                          return (
                            <button
                              key={slot.slotId}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`px-3 py-2 text-sm rounded border transition-colors ${
                                isSelected
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : isCurrent
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                                  : 'bg-white hover:bg-indigo-50 border-slate-200 hover:border-indigo-300'
                              }`}
                              disabled={isCurrent}
                            >
                              {time}
                              {isCurrent && <span className="block text-xs">(current)</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {selectedSlot && (
                <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-lg">
                  <p className="text-sm">
                    <span className="font-medium text-indigo-900">New time:</span>{' '}
                    <span className="text-indigo-700">
                      {new Date(selectedSlot.start).toLocaleString()}
                    </span>
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Reason (optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  rows={2}
                  placeholder="Reason for rescheduling"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!selectedSlot || submitting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Rescheduling...' : 'Reschedule'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Cancel Modal Component
function CancelModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(reason);
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-slate-200">
          <h3 className="text-lg font-semibold text-slate-900">Cancel Interview</h3>
        </div>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                rows={3}
                placeholder="Please provide a reason for cancellation"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Back
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
              >
                Cancel Interview
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
