'use client';

import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface Suggestion {
  startAt: string;
  endAt: string;
  interviewerEmails: string[];
  score: number;
  rationale: string;
  enhancedScore?: {
    availabilityScore: number;
    timelinessScore: number;
    timeOfDayScore: number;
    loadBalanceScore: number;
    capacityHeadroomScore: number;
    preferenceMatchScore: number;
    totalScore: number;
    rationale: string[];
  };
}

interface SuggestionsResponse {
  requestId: string;
  candidateName: string;
  candidateTimezone: string;
  durationMinutes: number;
  suggestions: Suggestion[];
}

interface Recommendation {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  interviewerEmail: string | null;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  status: string;
}

export default function AvailabilityDetailPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const resolvedParams = params instanceof Promise ? use(params) : params;
  const { id } = resolvedParams;
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState<{
    id: string;
    candidateName: string;
    candidateEmail: string;
    reqTitle: string;
    interviewType: string;
    durationMinutes: number;
    interviewerEmails: string[];
    status: string;
    candidateTimezone: string | null;
    windowStart: string;
    windowEnd: string;
    expiresAt: string;
    createdAt: string;
  } | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookingResult, setBookingResult] = useState<{
    bookingId: string;
    scheduledStart: string;
    scheduledEnd: string;
    conferenceJoinUrl: string | null;
  } | null>(null);

  const [showResendModal, setShowResendModal] = useState(false);
  const [resendResult, setResendResult] = useState<{ publicLink: string } | null>(null);

  // Recommendations state (M15 capacity planning)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [useCapacityScoring, setUseCapacityScoring] = useState(false);

  // Fetch request details
  useEffect(() => {
    async function fetchRequest() {
      if (sessionStatus !== 'authenticated') return;

      try {
        const response = await fetch(`/api/availability-requests?status=pending,submitted,booked,expired,cancelled`);
        if (!response.ok) throw new Error('Failed to fetch requests');

        const data = await response.json();
        const found = data.requests.find((r: { id: string }) => r.id === id);

        if (!found) {
          throw new Error('Request not found');
        }

        setRequest(found);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchRequest();
  }, [id, sessionStatus]);

  // Fetch suggestions when request is submitted
  const fetchSuggestions = useCallback(async () => {
    if (!request || request.status !== 'submitted') return;

    setSuggestionsLoading(true);

    try {
      const url = new URL(`/api/availability-requests/${id}/suggestions`, window.location.origin);
      if (useCapacityScoring) {
        url.searchParams.set('useCapacityScoring', 'true');
      }
      const response = await fetch(url.toString());
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch suggestions');
      }

      const data: SuggestionsResponse = await response.json();
      setSuggestions(data.suggestions);
    } catch (err) {
      console.error('Error fetching suggestions:', err);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [id, request, useCapacityScoring]);

  useEffect(() => {
    if (request?.status === 'submitted') {
      fetchSuggestions();
    }
  }, [request?.status, fetchSuggestions]);

  // Fetch recommendations for interviewers (M15)
  useEffect(() => {
    async function fetchRecommendations() {
      if (!request || request.interviewerEmails.length === 0) return;

      try {
        const response = await fetch('/api/capacity/recommendations?status=active');
        if (!response.ok) return;

        const data = await response.json();
        // Filter to recommendations that mention our interviewers
        const relevantRecs = (data.recommendations || []).filter(
          (rec: Recommendation) =>
            rec.interviewerEmail &&
            request.interviewerEmails.includes(rec.interviewerEmail)
        );
        setRecommendations(relevantRecs);

        // Enable capacity scoring if there are any recommendations
        if (relevantRecs.length > 0) {
          setUseCapacityScoring(true);
        }
      } catch (err) {
        console.error('Failed to fetch recommendations:', err);
      }
    }

    fetchRecommendations();
  }, [request?.interviewerEmails, request]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [sessionStatus, router]);

  // Book a suggestion
  const bookSuggestion = async (suggestion: Suggestion) => {
    if (!request) return;

    setBooking(true);
    setError(null);

    try {
      const response = await fetch(`/api/availability-requests/${id}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startAt: suggestion.startAt,
          candidateTimezone: request.candidateTimezone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to book');
      }

      setBookingResult({
        bookingId: data.bookingId,
        scheduledStart: data.scheduledStart,
        scheduledEnd: data.scheduledEnd,
        conferenceJoinUrl: data.conferenceJoinUrl,
      });

      // Update request status
      setRequest((prev) => (prev ? { ...prev, status: 'booked' } : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setBooking(false);
    }
  };

  // Resend link
  const resendLink = async (regenerateToken: boolean) => {
    try {
      const response = await fetch(`/api/availability-requests/${id}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerateToken }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend');
      }

      setResendResult({ publicLink: data.publicLink });

      // Update status if it was expired
      if (request?.status === 'expired') {
        setRequest((prev) => (prev ? { ...prev, status: 'pending' } : null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resend failed');
    }
  };

  // Format date/time
  const formatDateTime = (dateString: string, timezone?: string) => {
    const tz = timezone || 'America/New_York';
    return new Date(dateString).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: tz,
    });
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'submitted':
        return 'bg-blue-100 text-blue-800';
      case 'booked':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-gray-100 text-gray-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error && !request) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg text-center">
          <h1 className="text-xl font-semibold text-red-600 mb-4">Error</h1>
          <p className="text-slate-600 mb-4">{error}</p>
          <Link href="/coordinator/availability" className="text-indigo-600 hover:underline">
            Back to list
          </Link>
        </div>
      </div>
    );
  }

  if (!request) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <Link
            href="/coordinator/availability"
            className="text-indigo-600 hover:underline text-sm mb-2 inline-block"
          >
            &larr; Back to list
          </Link>
          <h1 className="text-xl font-semibold text-slate-900">
            Availability Request: {request.candidateName}
          </h1>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Request Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Request Details</h2>
            <span
              className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full ${getStatusColor(
                request.status
              )}`}
            >
              {request.status}
            </span>
          </div>

          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-slate-500">Candidate</dt>
              <dd className="font-medium text-slate-900">{request.candidateName}</dd>
              <dd className="text-slate-600">{request.candidateEmail}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Position</dt>
              <dd className="font-medium text-slate-900">{request.reqTitle}</dd>
              <dd className="text-slate-600">
                {request.interviewType} ({request.durationMinutes} min)
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Interviewers</dt>
              <dd className="text-slate-900">
                {request.interviewerEmails.join(', ')}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Candidate Timezone</dt>
              <dd className="text-slate-900">
                {request.candidateTimezone || 'Not set yet'}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Window</dt>
              <dd className="text-slate-900">
                {new Date(request.windowStart).toLocaleDateString()} -{' '}
                {new Date(request.windowEnd).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Expires</dt>
              <dd className="text-slate-900">
                {new Date(request.expiresAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>

          {/* Actions */}
          <div className="mt-6 flex gap-4">
            {(request.status === 'pending' || request.status === 'expired') && (
              <button
                onClick={() => setShowResendModal(true)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                {request.status === 'expired' ? 'Regenerate Link' : 'Resend Link'}
              </button>
            )}
          </div>
        </div>

        {/* Booking Result */}
        {bookingResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-green-800 mb-4">
              Interview Booked!
            </h3>
            <dl className="text-sm space-y-2">
              <div>
                <dt className="text-green-700">Scheduled Time</dt>
                <dd className="font-medium text-green-900">
                  {formatDateTime(bookingResult.scheduledStart, request.candidateTimezone || undefined)}
                </dd>
              </div>
              {bookingResult.conferenceJoinUrl && (
                <div>
                  <dt className="text-green-700">Meeting Link</dt>
                  <dd>
                    <a
                      href={bookingResult.conferenceJoinUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-green-600 hover:underline"
                    >
                      Join Meeting
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}

        {/* Capacity Recommendations (M15) */}
        {recommendations.length > 0 && request.status === 'submitted' && !bookingResult && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-amber-800 mb-3">
              Capacity Alerts
            </h3>
            <div className="space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className={`p-3 rounded-lg border ${
                    rec.priority === 'critical'
                      ? 'bg-red-50 border-red-200'
                      : rec.priority === 'high'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full mr-2 ${
                          rec.priority === 'critical'
                            ? 'bg-red-100 text-red-800'
                            : rec.priority === 'high'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {rec.priority}
                      </span>
                      <span className="font-medium text-slate-900">{rec.title}</span>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{rec.description}</p>
                  {rec.interviewerEmail && (
                    <p className="text-xs text-slate-500 mt-1">
                      Interviewer: {rec.interviewerEmail}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-sm text-amber-700 mt-3">
              Suggestions are scored to account for interviewer capacity.
            </p>
          </div>
        )}

        {/* Suggestions */}
        {request.status === 'submitted' && !bookingResult && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Suggested Times
              </h2>
              <div className="flex items-center gap-4">
                {recommendations.length > 0 && (
                  <label className="flex items-center text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={useCapacityScoring}
                      onChange={(e) => setUseCapacityScoring(e.target.checked)}
                      className="mr-2"
                    />
                    Capacity-aware ranking
                  </label>
                )}
                <button
                  onClick={fetchSuggestions}
                  disabled={suggestionsLoading}
                  className="text-indigo-600 hover:text-indigo-800 text-sm"
                >
                  {suggestionsLoading ? 'Loading...' : 'Refresh'}
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
                {error}
              </div>
            )}

            {suggestionsLoading ? (
              <div className="text-center py-8">
                <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-slate-500 mt-2">Finding matching times...</p>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No matching times found. The candidate&apos;s availability doesn&apos;t overlap
                with interviewer availability.
              </div>
            ) : (
              <div className="space-y-3">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-slate-900">
                        {formatDateTime(suggestion.startAt, request.candidateTimezone || undefined)}
                      </div>
                      <div className="text-sm text-slate-500">
                        {suggestion.rationale}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Available: {suggestion.interviewerEmails.join(', ')}
                      </div>
                      {/* Enhanced score breakdown (M15) */}
                      {suggestion.enhancedScore && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {suggestion.enhancedScore.loadBalanceScore < 10 && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-700">
                              High load
                            </span>
                          )}
                          {suggestion.enhancedScore.capacityHeadroomScore < 8 && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-700">
                              Near capacity
                            </span>
                          )}
                          {suggestion.enhancedScore.preferenceMatchScore >= 8 && (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                              Preference match
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2 ml-4">
                      <button
                        onClick={() => bookSuggestion(suggestion)}
                        disabled={booking}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-green-400"
                      >
                        {booking ? 'Booking...' : 'Book'}
                      </button>
                      {suggestion.enhancedScore && (
                        <span className="text-xs text-slate-400">
                          Score: {suggestion.enhancedScore.totalScore.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Pending status message */}
        {request.status === 'pending' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">
              Waiting for Candidate
            </h3>
            <p className="text-yellow-700">
              The candidate has not yet submitted their availability. The link expires on{' '}
              {new Date(request.expiresAt).toLocaleDateString()}.
            </p>
          </div>
        )}
      </div>

      {/* Resend Modal */}
      {showResendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-xl font-semibold mb-4">
              {resendResult ? 'Link Ready' : 'Resend Link'}
            </h2>

            {resendResult ? (
              <div>
                <p className="text-green-600 mb-4">Link is ready to share!</p>
                <div className="bg-slate-100 p-4 rounded-lg mb-4">
                  <input
                    type="text"
                    readOnly
                    value={resendResult.publicLink}
                    className="w-full p-2 border rounded bg-white text-sm"
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <div className="flex gap-4">
                  <button
                    onClick={() => navigator.clipboard.writeText(resendResult.publicLink)}
                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() => {
                      setShowResendModal(false);
                      setResendResult(null);
                    }}
                    className="flex-1 py-2 border rounded-lg hover:bg-slate-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-slate-600 mb-4">
                  {request.status === 'expired'
                    ? 'This link has expired. Generate a new link for the candidate.'
                    : 'Share the link with the candidate again.'}
                </p>
                <div className="flex gap-4">
                  <button
                    onClick={() => resendLink(request.status === 'expired')}
                    className="flex-1 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                  >
                    {request.status === 'expired' ? 'Generate New Link' : 'Get Link'}
                  </button>
                  <button
                    onClick={() => setShowResendModal(false)}
                    className="flex-1 py-2 border rounded-lg hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
