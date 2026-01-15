'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface DemoRequest {
  requestId: string;
  publicLink?: string;
  candidateName: string;
  reqTitle: string;
  status: string;
}

export default function DemoPage() {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creatingRequest, setCreatingRequest] = useState(false);

  // Load existing requests on mount
  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    try {
      const res = await fetch('/api/scheduling-requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data.requests || []);
      }
    } catch {
      // Ignore errors on initial load
    }
  };

  const createDemoRequest = async () => {
    setCreatingRequest(true);
    setError(null);

    const candidates = [
      { name: 'Sarah Chen', email: 'sarah.chen@example.com', role: 'Senior Software Engineer' },
      { name: 'Marcus Johnson', email: 'marcus.j@example.com', role: 'Product Manager' },
      { name: 'Emily Rodriguez', email: 'emily.r@example.com', role: 'UX Designer' },
      { name: 'James Kim', email: 'james.kim@example.com', role: 'Data Scientist' },
    ];

    const candidate = candidates[Math.floor(Math.random() * candidates.length)];
    const now = new Date();
    const windowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
    const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks out

    try {
      const res = await fetch('/api/scheduling/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId: `APP-${Math.floor(Math.random() * 9000) + 1000}`,
          candidateName: candidate.name,
          candidateEmail: candidate.email,
          reqTitle: candidate.role,
          interviewType: 'phone_screen',
          durationMinutes: 45,
          interviewerEmails: ['interviewer@company.com'],
          windowStart: windowStart.toISOString(),
          windowEnd: windowEnd.toISOString(),
          candidateTimezone: 'America/New_York',
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to create request');
      }

      const data = await res.json();

      setRequests(prev => [...prev, {
        requestId: data.requestId,
        publicLink: data.publicLink,
        candidateName: candidate.name,
        reqTitle: candidate.role,
        status: 'pending',
      }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setCreatingRequest(false);
    }
  };

  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      booked: 'bg-green-100 text-green-800',
      confirmed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      expired: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Demo Mode Banner */}
      <div className="bg-blue-600 text-white text-center py-2 text-sm font-medium">
        Demo Mode - Interview Scheduling Tool
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Interview Scheduler Demo
          </h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Create scheduling requests, view the candidate booking experience, and manage interviews
          </p>
        </div>

        {/* Demo Flow Steps */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {/* Step 1 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4">
              1
            </div>
            <h3 className="text-gray-900 font-semibold text-lg mb-2">
              Create Request
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Coordinator creates a scheduling request with candidate info and availability window
            </p>
          </div>

          {/* Step 2 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4">
              2
            </div>
            <h3 className="text-gray-900 font-semibold text-lg mb-2">
              Candidate Books
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              Candidate receives a secure link and selects their preferred interview slot
            </p>
          </div>

          {/* Step 3 */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4">
              3
            </div>
            <h3 className="text-gray-900 font-semibold text-lg mb-2">
              Manage & Track
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              View bookings, reschedule if needed, and track iCIMS sync status
            </p>
          </div>
        </div>

        {/* Action Panel */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              Demo Scheduling Requests
            </h2>
            <button
              onClick={createDemoRequest}
              disabled={creatingRequest}
              className="bg-green-600 text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {creatingRequest ? 'Creating...' : '+ Create Demo Request'}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-4">
              {error}
            </div>
          )}

          {requests.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No requests yet. Click &quot;Create Demo Request&quot; to get started!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {requests.map((req, idx) => (
                <div
                  key={req.requestId || idx}
                  className="bg-gray-50 border border-gray-200 rounded-lg p-5 flex items-center justify-between"
                >
                  <div>
                    <h4 className="text-gray-900 font-semibold mb-1">
                      {req.candidateName}
                    </h4>
                    <p className="text-gray-600 text-sm">
                      {req.reqTitle}
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getStatusBadge(req.status)}`}>
                        {req.status}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-3">
                    {req.publicLink && (
                      <a
                        href={req.publicLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                      >
                        Open Booking Page
                      </a>
                    )}
                    <Link
                      href={`/coordinator/${req.requestId}`}
                      className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300 transition"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <Link
            href="/coordinator"
            className="bg-white rounded-lg shadow p-5 flex items-center gap-4 hover:shadow-md transition"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-2xl">
              📊
            </div>
            <div>
              <h3 className="text-gray-900 font-semibold mb-1">
                Coordinator Dashboard
              </h3>
              <p className="text-gray-600 text-sm">
                View all requests and manage bookings
              </p>
            </div>
          </Link>

          <Link
            href="/book/demo"
            className="bg-white rounded-lg shadow p-5 flex items-center gap-4 hover:shadow-md transition"
          >
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-2xl">
              📅
            </div>
            <div>
              <h3 className="text-gray-900 font-semibold mb-1">
                Booking UI Preview
              </h3>
              <p className="text-gray-600 text-sm">
                See the candidate experience with mock data
              </p>
            </div>
          </Link>
        </div>

        {/* Feature Highlights */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-gray-900 font-semibold text-lg mb-5">
            Features Demonstrated
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <h4 className="text-green-600 font-semibold text-sm mb-3">
                Booking Flow
              </h4>
              <ul className="text-gray-600 text-sm space-y-2">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Secure token-based public links
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Real-time slot availability
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Timezone-aware scheduling
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Double-booking prevention
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-blue-600 font-semibold text-sm mb-3">
                Calendar Integration
              </h4>
              <ul className="text-gray-600 text-sm space-y-2">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Microsoft Graph API
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  FreeBusy queries
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Teams meeting links
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Reschedule & cancel
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-purple-600 font-semibold text-sm mb-3">
                iCIMS Integration
              </h4>
              <ul className="text-gray-600 text-sm space-y-2">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Automatic note writeback
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Retry with backoff
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Sync status tracking
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Full audit logging
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
