'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface AuditLogEntry {
  id: string;
  action: string;
  actorType: string;
  actorId: string | null;
  requestId: string | null;
  bookingId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

interface AuditResponse {
  logs: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
  actions: string[];
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [selectedAction, setSelectedAction] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      if (selectedAction) {
        params.set('action', selectedAction);
      }

      const res = await fetch(`/api/ops/audit?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch audit logs');
      }
      const data: AuditResponse = await res.json();
      setLogs(data.logs);
      setActions(data.actions);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [selectedAction, offset]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleActionChange = (action: string) => {
    setSelectedAction(action);
    setOffset(0);
  };

  const formatTimestamp = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleString();
  };

  const getActionColor = (action: string) => {
    if (action.includes('failed') || action.includes('error')) return 'text-red-400';
    if (action.includes('success') || action === 'booked') return 'text-emerald-400';
    if (action.includes('warning') || action === 'cancelled') return 'text-amber-400';
    return 'text-slate-300';
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Audit Log</h1>
            <p className="text-slate-400 mt-1">
              System activity and user actions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedAction}
              onChange={(e) => handleActionChange(e.target.value)}
              className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm"
            >
              <option value="">All Actions</option>
              {actions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <button
              onClick={() => fetchLogs()}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-medium transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Back link */}
        <Link
          href="/ops"
          className="inline-flex items-center text-sm text-slate-400 hover:text-white mb-6"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Ops Dashboard
        </Link>

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
            {error}
          </div>
        )}

        {/* Audit log table */}
        {!loading && !error && (
          <>
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Action
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Actor
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Entity
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/50">
                      <td className="px-4 py-3">
                        <span className={`text-sm font-mono ${getActionColor(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        <span className="text-slate-500">{log.actorType}:</span>{' '}
                        {log.actorId || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {log.requestId && (
                          <Link
                            href={`/coordinator/${log.requestId}`}
                            className="text-blue-400 hover:underline font-mono text-xs"
                          >
                            {log.requestId.slice(0, 8)}...
                          </Link>
                        )}
                        {!log.requestId && log.bookingId && (
                          <span className="font-mono text-xs">
                            booking:{log.bookingId.slice(0, 8)}...
                          </span>
                        )}
                        {!log.requestId && !log.bookingId && '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {formatTimestamp(log.createdAt)}
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                        No audit logs found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-4 text-sm text-slate-400">
              <span>
                Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setOffset(Math.max(0, offset - limit))}
                  disabled={offset === 0}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                >
                  Previous
                </button>
                <button
                  onClick={() => setOffset(offset + limit)}
                  disabled={offset + limit >= total}
                  className="px-3 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed rounded"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
