'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

// Types
interface AvailabilityRequest {
  id: string;
  applicationId?: string;
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
}

interface ApiResponse {
  requests: AvailabilityRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Status tabs configuration
const STATUS_TABS = [
  { id: 'all', label: 'All', statusFilter: null },
  { id: 'pending', label: 'Pending', statusFilter: 'pending' },
  { id: 'submitted', label: 'Submitted', statusFilter: 'submitted' },
  { id: 'booked', label: 'Booked', statusFilter: 'booked' },
  { id: 'expired', label: 'Expired', statusFilter: 'expired' },
];

// Wrapper component with Suspense
export default function CoordinatorAvailabilityPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <AvailabilityDashboard />
    </Suspense>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 mt-2">Loading...</p>
      </div>
    </div>
  );
}

function AvailabilityDashboard() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // State
  const [requests, setRequests] = useState<AvailabilityRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    if (sessionStatus !== 'authenticated') return;

    setLoading(true);
    setError(null);

    try {
      const statusFilter = STATUS_TABS.find((t) => t.id === activeTab)?.statusFilter;
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (statusFilter) params.set('status', statusFilter);

      const response = await fetch(`/api/availability-requests?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch requests');
      }

      const data: ApiResponse = await response.json();
      setRequests(data.requests);
      setTotalPages(data.pagination.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [sessionStatus, activeTab, page]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Redirect if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/');
    }
  }, [sessionStatus, router]);

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  // Get status badge color
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

  if (sessionStatus === 'loading') {
    return <LoadingFallback />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">
              Availability Requests
            </h1>
            <p className="text-sm text-slate-500">
              Candidate-provided availability mode
            </p>
          </div>
          <div className="flex gap-4">
            <Link
              href="/coordinator"
              className="px-4 py-2 text-slate-600 hover:text-slate-900"
            >
              Self-Schedule Mode
            </Link>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              New Request
            </button>
          </div>
        </div>
      </header>

      {/* Status tabs */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="flex gap-2 border-b">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setPage(1);
              }}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-indigo-600 border-b-2 border-indigo-600'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 text-red-700 p-4 rounded-lg">{error}</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            No availability requests found.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Candidate
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Position
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Expires
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">
                        {request.candidateName}
                      </div>
                      <div className="text-sm text-slate-500">
                        {request.candidateEmail}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-slate-900">{request.reqTitle}</div>
                      <div className="text-sm text-slate-500">
                        {request.interviewType} ({request.durationMinutes} min)
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(
                          request.status
                        )}`}
                      >
                        {request.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDate(request.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {formatDate(request.expiresAt)}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/coordinator/availability/${request.id}`}
                        className="text-indigo-600 hover:text-indigo-900 font-medium"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-6">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 border rounded-lg disabled:opacity-50"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 border rounded-lg disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateRequestModal onClose={() => setShowCreateModal(false)} onCreated={fetchRequests} />
      )}
    </div>
  );
}

// Create Request Modal
function CreateRequestModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ publicLink: string } | null>(null);

  const [formData, setFormData] = useState({
    candidateName: '',
    candidateEmail: '',
    reqTitle: '',
    interviewType: 'phone_screen',
    durationMinutes: 60,
    interviewerEmails: '',
    windowDays: 14,
    deadlineDays: 7,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/availability-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          interviewerEmails: formData.interviewerEmails
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create request');
      }

      setResult({ publicLink: data.publicLink });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold">
              {result ? 'Request Created' : 'New Availability Request'}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              &#10005;
            </button>
          </div>

          {result ? (
            <div>
              <p className="text-green-600 mb-4">Request created successfully!</p>
              <div className="bg-slate-100 p-4 rounded-lg mb-4">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Share this link with the candidate:
                </label>
                <input
                  type="text"
                  readOnly
                  value={result.publicLink}
                  className="w-full p-2 border rounded bg-white text-sm"
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(result.publicLink);
                }}
                className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                Copy Link
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Candidate Name
                </label>
                <input
                  type="text"
                  required
                  value={formData.candidateName}
                  onChange={(e) => setFormData({ ...formData, candidateName: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Candidate Email
                </label>
                <input
                  type="email"
                  required
                  value={formData.candidateEmail}
                  onChange={(e) => setFormData({ ...formData, candidateEmail: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Position Title
                </label>
                <input
                  type="text"
                  required
                  value={formData.reqTitle}
                  onChange={(e) => setFormData({ ...formData, reqTitle: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Interview Type
                  </label>
                  <select
                    value={formData.interviewType}
                    onChange={(e) => setFormData({ ...formData, interviewType: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  >
                    <option value="phone_screen">Phone Screen</option>
                    <option value="hm_screen">HM Screen</option>
                    <option value="onsite">Onsite</option>
                    <option value="final">Final</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Duration (min)
                  </label>
                  <input
                    type="number"
                    min={15}
                    step={15}
                    value={formData.durationMinutes}
                    onChange={(e) =>
                      setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })
                    }
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Interviewer Email(s)
                </label>
                <input
                  type="text"
                  required
                  placeholder="email1@company.com, email2@company.com"
                  value={formData.interviewerEmails}
                  onChange={(e) => setFormData({ ...formData, interviewerEmails: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
                <p className="text-xs text-slate-500 mt-1">Comma-separated for multiple</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Window (days)
                  </label>
                  <input
                    type="number"
                    min={7}
                    max={30}
                    value={formData.windowDays}
                    onChange={(e) =>
                      setFormData({ ...formData, windowDays: parseInt(e.target.value) })
                    }
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Deadline (days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={14}
                    value={formData.deadlineDays}
                    onChange={(e) =>
                      setFormData({ ...formData, deadlineDays: parseInt(e.target.value) })
                    }
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              {error && <div className="text-red-600 text-sm">{error}</div>}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400"
              >
                {loading ? 'Creating...' : 'Create Request'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
