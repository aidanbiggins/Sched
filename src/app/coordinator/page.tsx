'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { CandidateLinkCard } from '@/components/sharing';

// Types
interface SchedulingRequest {
  requestId: string;
  applicationId?: string;
  candidateName: string;
  candidateEmail: string;
  reqTitle: string;
  interviewType: string;
  interviewerEmails: string[];
  status: string;
  createdAt: string;
  ageDays: number;
  booking: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    status: string;
  } | null;
  syncStatus: {
    status: string;
    lastError?: string;
    attempts: number;
    maxAttempts: number;
  } | null;
}

interface ApiResponse {
  requests: SchedulingRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  counts: Record<string, number>;
}

// Status tabs configuration
const STATUS_TABS = [
  { id: 'all', label: 'All', statusFilter: null },
  { id: 'pending', label: 'Pending', statusFilter: 'pending' },
  { id: 'booked', label: 'Booked', statusFilter: 'booked' },
  { id: 'cancelled', label: 'Cancelled', statusFilter: 'cancelled' },
];

// Age range options
const AGE_RANGES = [
  { value: '', label: 'Any age' },
  { value: '0-2d', label: '0-2 days' },
  { value: '3-7d', label: '3-7 days' },
  { value: '8-14d', label: '8-14 days' },
  { value: '15+d', label: '15+ days' },
];

// Wrapper component with Suspense for useSearchParams
export default function CoordinatorPage() {
  return (
    <Suspense fallback={<CoordinatorLoadingFallback />}>
      <CoordinatorDashboard />
    </Suspense>
  );
}

function CoordinatorLoadingFallback() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 mt-2">Loading dashboard...</p>
      </div>
    </div>
  );
}

function CoordinatorDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus } = useSession();

  // Redirect to signin if not authenticated
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/signin');
    }
  }, [sessionStatus, router]);

  // State from URL params
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'all');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [ageRange, setAgeRange] = useState(searchParams.get('ageRange') || '');
  const [needsSync, setNeedsSync] = useState(searchParams.get('needsSync') === 'true');
  const [interviewerEmail, setInterviewerEmail] = useState(searchParams.get('interviewer') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));

  // Local state
  const [requests, setRequests] = useState<SchedulingRequest[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCancelling, setBulkCancelling] = useState(false);
  const [searchInput, setSearchInput] = useState(search);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Build query string from filters
  const buildQueryString = useCallback(() => {
    const params = new URLSearchParams();

    const tab = STATUS_TABS.find((t) => t.id === activeTab);
    if (tab?.statusFilter) {
      params.set('status', tab.statusFilter);
    }
    if (search) params.set('search', search);
    if (ageRange) params.set('ageRange', ageRange);
    if (needsSync) params.set('needsSync', 'true');
    if (interviewerEmail) params.set('interviewerEmail', interviewerEmail);
    params.set('page', String(page));
    params.set('limit', '20');
    params.set('sortBy', 'status');
    params.set('sortOrder', 'asc');

    return params.toString();
  }, [activeTab, search, ageRange, needsSync, interviewerEmail, page]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (activeTab !== 'all') params.set('tab', activeTab);
    if (search) params.set('search', search);
    if (ageRange) params.set('ageRange', ageRange);
    if (needsSync) params.set('needsSync', 'true');
    if (interviewerEmail) params.set('interviewer', interviewerEmail);
    if (page > 1) params.set('page', String(page));

    const queryString = params.toString();
    const newUrl = queryString ? `/coordinator?${queryString}` : '/coordinator';
    router.replace(newUrl, { scroll: false });
  }, [activeTab, search, ageRange, needsSync, interviewerEmail, page, router]);

  // Fetch requests
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/scheduling-requests?${buildQueryString()}`);
      if (!res.ok) throw new Error('Failed to fetch requests');

      const data: ApiResponse = await res.json();
      setRequests(data.requests);
      setCounts(data.counts);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }, [buildQueryString]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedIds.size === requests.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(requests.map((r) => r.requestId)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Bulk cancel
  const handleBulkCancel = async () => {
    if (selectedIds.size === 0) return;

    const reason = prompt('Enter cancellation reason:');
    if (!reason) return;

    setBulkCancelling(true);
    try {
      const res = await fetch('/api/scheduling-requests/bulk-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestIds: Array.from(selectedIds),
          reason,
        }),
      });

      const data = await res.json();
      alert(data.message);
      setSelectedIds(new Set());
      fetchRequests();
    } catch {
      alert('Failed to cancel requests');
    } finally {
      setBulkCancelling(false);
    }
  };

  // Clear filters
  const clearFilters = () => {
    setActiveTab('all');
    setSearchInput('');
    setSearch('');
    setAgeRange('');
    setNeedsSync(false);
    setInterviewerEmail('');
    setPage(1);
  };

  // Helper functions
  function getStatusBadge(status: string) {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800 border-amber-200',
      booked: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      rescheduled: 'bg-sky-100 text-sky-800 border-sky-200',
      cancelled: 'bg-red-100 text-red-800 border-red-200',
      expired: 'bg-slate-100 text-slate-600 border-slate-200',
    };
    return colors[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  }

  function getSyncStatusBadge(syncStatus: SchedulingRequest['syncStatus']) {
    if (!syncStatus) return null;

    if (syncStatus.status === 'completed') {
      return <span className="text-emerald-600 text-xs">✓ Synced</span>;
    }
    if (syncStatus.status === 'failed') {
      return (
        <span className="text-red-600 text-xs" title={syncStatus.lastError}>
          ⚠ Failed ({syncStatus.attempts}/{syncStatus.maxAttempts})
        </span>
      );
    }
    if (syncStatus.status === 'pending' || syncStatus.status === 'processing') {
      return <span className="text-amber-600 text-xs">⏳ Pending</span>;
    }
    return null;
  }

  function formatAge(ageDays: number) {
    if (ageDays === 0) return 'Today';
    if (ageDays === 1) return '1 day';
    return `${ageDays} days`;
  }

  function formatScheduledTime(booking: SchedulingRequest['booking']) {
    if (!booking) return '—';
    const date = new Date(booking.scheduledStart);
    return date.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  const hasActiveFilters = search || ageRange || needsSync || interviewerEmail;

  // Show loading while checking authentication
  if (sessionStatus === 'loading') {
    return <CoordinatorLoadingFallback />;
  }

  // Don't render if not authenticated (redirect happens in useEffect)
  if (!session) {
    return <CoordinatorLoadingFallback />;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h1 className="text-lg sm:text-xl font-semibold text-slate-900">
                Coordinator Dashboard
              </h1>
              <p className="text-sm text-slate-500 mt-0.5 hidden sm:block">
                Manage interview scheduling requests
              </p>
            </div>
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                onClick={() => setShowForm(true)}
                className="bg-indigo-600 text-white px-3 sm:px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap"
              >
                + New Request
              </button>
              <div className="flex items-center gap-2 sm:gap-3 pl-3 sm:pl-4 border-l border-slate-200">
                <Link
                  href="/settings"
                  className="text-sm text-slate-600 hover:text-slate-900 transition-colors hidden sm:inline"
                >
                  Settings
                </Link>
                {session.user?.image && (
                  <img
                    src={session.user.image}
                    alt=""
                    className="w-8 h-8 rounded-full"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {/* Create Form Modal */}
        {showForm && (
          <CreateRequestForm
            onClose={() => setShowForm(false)}
            onCreated={() => {
              setShowForm(false);
              fetchRequests();
            }}
          />
        )}

        {/* Status Tabs */}
        <div className="flex items-center gap-1 mb-4 sm:mb-6 border-b border-slate-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          {STATUS_TABS.map((tab) => {
            const count = tab.id === 'all' ? counts.all : counts[tab.statusFilter || ''];
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setPage(1);
                }}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? 'border-indigo-600 text-indigo-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
                {count !== undefined && (
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Filters Row */}
        <div className="bg-white rounded-lg border border-slate-200 p-3 sm:p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex lg:flex-wrap gap-3 sm:gap-4 items-end">
            {/* Search */}
            <div className="sm:col-span-2 lg:flex-1 lg:min-w-[200px] lg:max-w-md">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Search
              </label>
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Email, Application ID, or Request ID"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Age Range */}
            <div className="lg:w-36">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Age
              </label>
              <select
                value={ageRange}
                onChange={(e) => {
                  setAgeRange(e.target.value);
                  setPage(1);
                }}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {AGE_RANGES.map((range) => (
                  <option key={range.value} value={range.value}>
                    {range.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Interviewer Email */}
            <div className="lg:w-48">
              <label className="block text-xs font-medium text-slate-500 mb-1.5">
                Interviewer
              </label>
              <input
                type="email"
                value={interviewerEmail}
                onChange={(e) => {
                  setInterviewerEmail(e.target.value);
                  setPage(1);
                }}
                placeholder="interviewer@email.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Needs Sync + Clear */}
            <div className="flex items-center justify-between sm:justify-start gap-4 sm:col-span-2 lg:col-span-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={needsSync}
                  onChange={(e) => {
                    setNeedsSync(e.target.checked);
                    setPage(1);
                  }}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-slate-600">Sync issues</span>
              </label>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-sm text-slate-500 hover:text-slate-700 underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 flex items-center justify-between">
            <span className="text-sm text-indigo-700">
              {selectedIds.size} request(s) selected
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-slate-600 hover:text-slate-800 px-3 py-1"
              >
                Clear selection
              </button>
              <button
                onClick={handleBulkCancel}
                disabled={bulkCancelling}
                className="text-sm bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-50"
              >
                {bulkCancelling ? 'Cancelling...' : 'Cancel Selected'}
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-4">
            {error}
            <button
              onClick={fetchRequests}
              className="ml-4 underline hover:no-underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <div className="inline-block w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-500 mt-2">Loading requests...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && requests.length === 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
            <div className="text-4xl mb-4">📋</div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">
              {hasActiveFilters ? 'No matching requests' : 'No scheduling requests yet'}
            </h3>
            <p className="text-slate-500 mb-4">
              {hasActiveFilters
                ? 'Try adjusting your filters or search terms'
                : 'Create your first scheduling request to get started'}
            </p>
            {hasActiveFilters ? (
              <button
                onClick={clearFilters}
                className="text-indigo-600 hover:text-indigo-800 font-medium"
              >
                Clear all filters
              </button>
            ) : (
              <button
                onClick={() => setShowForm(true)}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700"
              >
                Create Request
              </button>
            )}
          </div>
        )}

        {/* Table */}
        {!loading && requests.length > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === requests.length && requests.length > 0}
                        onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Age
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Candidate
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Application ID
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Interviewer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Scheduled
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Sync
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {requests.map((request) => (
                    <tr
                      key={request.requestId}
                      className={`hover:bg-slate-50 transition-colors ${
                        selectedIds.has(request.requestId) ? 'bg-indigo-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(request.requestId)}
                          onChange={() => toggleSelect(request.requestId)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full border ${getStatusBadge(
                            request.status
                          )}`}
                        >
                          {request.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {new Date(request.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {formatAge(request.ageDays)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">
                          {request.candidateName}
                        </div>
                        <div className="text-xs text-slate-500">{request.candidateEmail}</div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 font-mono">
                        {request.applicationId || '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {request.interviewerEmails[0]}
                        {request.interviewerEmails.length > 1 && (
                          <span className="text-slate-400">
                            {' '}
                            +{request.interviewerEmails.length - 1}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">
                        {formatScheduledTime(request.booking)}
                      </td>
                      <td className="px-4 py-3">
                        {getSyncStatusBadge(request.syncStatus)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/coordinator/${request.requestId}`}
                          className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
                <div className="text-sm text-slate-500">
                  Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                  {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                  {pagination.total} results
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (pagination.totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= pagination.totalPages - 2) {
                      pageNum = pagination.totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => setPage(pageNum)}
                        className={`px-3 py-1 text-sm border rounded ${
                          pageNum === page
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === pagination.totalPages}
                    className="px-3 py-1 text-sm border border-slate-200 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

// Create Request Form Component
interface CreateRequestFormProps {
  onClose: () => void;
  onCreated: () => void;
}

interface CreatedRequestInfo {
  id: string;
  publicLink: string;
  candidateName: string;
  candidateEmail: string;
  reqTitle: string;
  expiresAt: string;
}

function CreateRequestForm({ onClose, onCreated }: CreateRequestFormProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdRequest, setCreatedRequest] = useState<CreatedRequestInfo | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const formData = new FormData(e.currentTarget);

    // Calculate window dates (next 2 weeks)
    const windowStart = new Date();
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setDate(windowEnd.getDate() + 14);

    const candidateName = formData.get('candidateName') as string;
    const candidateEmail = formData.get('candidateEmail') as string;
    const reqTitle = formData.get('reqTitle') as string;

    const data = {
      candidateName,
      candidateEmail,
      reqTitle,
      interviewType: formData.get('interviewType'),
      durationMinutes: parseInt(formData.get('durationMinutes') as string, 10),
      interviewerEmails: (formData.get('interviewerEmails') as string)
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      candidateTimezone:
        formData.get('candidateTimezone') ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    };

    try {
      const res = await fetch('/api/scheduling/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create request');
      }

      const result = await res.json();

      // Show success view with link card
      setCreatedRequest({
        id: result.id,
        publicLink: result.publicLink,
        candidateName,
        candidateEmail,
        reqTitle,
        expiresAt: windowEnd.toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create request');
    } finally {
      setSubmitting(false);
    }
  }

  // Success View
  if (createdRequest) {
    return (
      <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
          <div className="p-6">
            <CandidateLinkCard
              link={createdRequest.publicLink}
              candidateName={createdRequest.candidateName}
              candidateEmail={createdRequest.candidateEmail}
              positionTitle={createdRequest.reqTitle}
              expiresAt={createdRequest.expiresAt}
              variant="success"
            />

            <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => {
                  onCreated();
                }}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
              >
                Close
              </button>
              <Link
                href={`/coordinator/${createdRequest.id}`}
                className="px-4 py-2 text-sm text-[#1a5f5f] border border-[#1a5f5f]/30 rounded-lg hover:bg-[#1a5f5f]/5"
              >
                View Details
              </Link>
              <button
                onClick={() => {
                  setCreatedRequest(null);
                  setError(null);
                }}
                className="px-4 py-2 bg-[#1a5f5f] text-white text-sm font-medium rounded-lg hover:bg-[#164d4d]"
              >
                Create Another
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden">
        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Create Scheduling Request</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Candidate Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="candidateName"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Candidate Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="candidateEmail"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="john@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Position Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="reqTitle"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Senior Software Engineer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Interview Type <span className="text-red-500">*</span>
                </label>
                <select
                  name="interviewType"
                  required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="phone_screen">Phone Screen</option>
                  <option value="hm_screen">HM Screen</option>
                  <option value="onsite">Onsite</option>
                  <option value="final">Final</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Duration <span className="text-red-500">*</span>
                </label>
                <select
                  name="durationMinutes"
                  required
                  defaultValue="60"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                  <option value="90">90 minutes</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Interviewer Email(s) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="interviewerEmails"
                required
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="interviewer@company.com"
              />
              <p className="text-xs text-slate-500 mt-1">
                Separate multiple emails with commas
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Candidate Timezone
              </label>
              <input
                type="text"
                name="candidateTimezone"
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder={Intl.DateTimeFormat().resolvedOptions().timeZone}
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
                disabled={submitting}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Request'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
