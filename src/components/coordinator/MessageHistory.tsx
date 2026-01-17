'use client';

import { useState, useEffect, useCallback } from 'react';

interface NotificationHistoryItem {
  id: string;
  type: string;
  typeLabel: string;
  toEmail: string;
  status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELED';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface MessageHistoryProps {
  requestId: string;
  candidateEmail: string;
  publicToken?: string;
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case 'SENT':
      return { label: 'Delivered', className: 'bg-emerald-100 text-emerald-800' };
    case 'PENDING':
      return { label: 'Pending', className: 'bg-amber-100 text-amber-800' };
    case 'SENDING':
      return { label: 'Sending', className: 'bg-blue-100 text-blue-800' };
    case 'FAILED':
      return { label: 'Failed', className: 'bg-red-100 text-red-800' };
    case 'CANCELED':
      return { label: 'Canceled', className: 'bg-slate-100 text-slate-600' };
    default:
      return { label: status, className: 'bg-slate-100 text-slate-600' };
  }
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function MessageHistory({ requestId, candidateEmail, publicToken }: MessageHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<NotificationHistoryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/notifications/history?requestId=${requestId}`);
      if (!res.ok) {
        throw new Error('Failed to load history');
      }
      const data = await res.json();
      setHistory(data.history);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    if (expanded) {
      fetchHistory();
    }
  }, [expanded, fetchHistory]);

  const handleResend = async (notificationType: string) => {
    try {
      setResending(notificationType);
      const res = await fetch('/api/notifications/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, notificationType }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resend');
      }

      // Refresh history
      await fetchHistory();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to resend notification');
    } finally {
      setResending(null);
    }
  };

  const handleCopyLink = () => {
    if (publicToken) {
      const link = `${window.location.origin}/book/${publicToken}`;
      navigator.clipboard.writeText(link);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <span className="font-medium text-slate-900">Communication History</span>
        </div>
        {history.length > 0 && !expanded && (
          <span className="text-sm text-slate-500">{history.length} messages</span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="p-4 border-t border-slate-200">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : error ? (
            <div className="text-center py-4 text-red-600">{error}</div>
          ) : history.length === 0 ? (
            <div className="text-center py-4 text-slate-500">No communications sent yet</div>
          ) : (
            <div className="space-y-3">
              {history.map((item) => {
                const statusBadge = getStatusBadge(item.status);
                return (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-4 p-3 bg-slate-50 rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-slate-900 truncate">
                          {item.typeLabel}
                        </span>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusBadge.className}`}
                        >
                          {statusBadge.label}
                        </span>
                      </div>
                      <div className="text-sm text-slate-500">
                        {formatDate(item.sentAt || item.createdAt)}
                        {item.status === 'FAILED' && item.lastError && (
                          <span className="ml-2 text-red-600" title={item.lastError}>
                            (Error)
                          </span>
                        )}
                      </div>
                    </div>
                    {item.status === 'FAILED' && (
                      <button
                        onClick={() => handleResend(item.type)}
                        disabled={resending === item.type}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {resending === item.type ? 'Resending...' : 'Retry'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap gap-2">
            <button
              onClick={() => handleResend('candidate_self_schedule_link')}
              disabled={resending !== null}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              {resending === 'candidate_self_schedule_link' ? 'Sending...' : 'Resend Booking Link'}
            </button>

            {publicToken && (
              <button
                onClick={handleCopyLink}
                className="px-3 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                {copySuccess ? 'Copied!' : 'Copy Booking Link'}
              </button>
            )}

            <button
              onClick={() => handleResend('nudge_reminder')}
              disabled={resending !== null}
              className="px-3 py-2 text-sm border border-amber-300 text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {resending === 'nudge_reminder' ? 'Sending...' : 'Send Nudge'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
