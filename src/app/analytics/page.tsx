'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MetricCard,
  HorizontalBar,
  DistributionChart,
  PeriodSelector,
} from '@/components/analytics';
import { AnalyticsPeriod, AnalyticsResponse } from '@/lib/analytics/types';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<AnalyticsPeriod>('30d');
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?period=${period}`);
      if (!res.ok) {
        throw new Error('Failed to fetch analytics');
      }
      const data = await res.json();
      setAnalytics(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleExport = () => {
    window.open(`/api/analytics/export?period=${period}`, '_blank');
  };

  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;

  const formatHours = (hours: number | null) => {
    if (hours === null) return 'N/A';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold">Analytics</h1>
            <p className="text-slate-400 mt-1">
              Scheduling metrics and insights
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PeriodSelector value={period} onChange={setPeriod} />
            <button
              onClick={handleExport}
              disabled={loading || !analytics}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
            >
              Export CSV
            </button>
          </div>
        </div>

        {/* Back link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-slate-400 hover:text-white mb-6"
        >
          <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
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

        {/* Analytics content */}
        {!loading && !error && analytics && (
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Total Requests"
                value={analytics.bookingMetrics.total}
                color="blue"
              />
              <MetricCard
                label="Booking Rate"
                value={formatPercentage(analytics.bookingMetrics.bookingRate)}
                subtitle={`${analytics.bookingMetrics.byStatus.booked + analytics.bookingMetrics.byStatus.rescheduled} booked`}
                color="emerald"
              />
              <MetricCard
                label="Avg Time-to-Schedule"
                value={formatHours(analytics.timeToSchedule.averageHours)}
                subtitle={
                  analytics.timeToSchedule.medianHours !== null
                    ? `Median: ${formatHours(analytics.timeToSchedule.medianHours)}`
                    : undefined
                }
                color="amber"
              />
              <MetricCard
                label="Cancellation Rate"
                value={formatPercentage(analytics.cancellationMetrics.cancellationRate)}
                subtitle={`Reschedule: ${formatPercentage(analytics.cancellationMetrics.rescheduleRate)}`}
                color="red"
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Request Status */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
                <HorizontalBar
                  title="Request Status"
                  items={[
                    {
                      label: 'Booked',
                      value: analytics.bookingMetrics.byStatus.booked,
                      color: 'emerald',
                    },
                    {
                      label: 'Rescheduled',
                      value: analytics.bookingMetrics.byStatus.rescheduled,
                      color: 'blue',
                    },
                    {
                      label: 'Pending',
                      value: analytics.bookingMetrics.byStatus.pending,
                      color: 'amber',
                    },
                    {
                      label: 'Cancelled',
                      value: analytics.bookingMetrics.byStatus.cancelled,
                      color: 'red',
                    },
                    {
                      label: 'Expired',
                      value: analytics.bookingMetrics.byStatus.expired,
                      color: 'slate',
                    },
                  ]}
                />
              </div>

              {/* Interview Types */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
                <HorizontalBar
                  title="Interview Types"
                  items={[
                    {
                      label: 'Phone Screen',
                      value: analytics.bookingMetrics.byInterviewType.phone_screen,
                      color: 'blue',
                    },
                    {
                      label: 'HM Screen',
                      value: analytics.bookingMetrics.byInterviewType.hm_screen,
                      color: 'purple',
                    },
                    {
                      label: 'Onsite',
                      value: analytics.bookingMetrics.byInterviewType.onsite,
                      color: 'emerald',
                    },
                    {
                      label: 'Final',
                      value: analytics.bookingMetrics.byInterviewType.final,
                      color: 'amber',
                    },
                  ]}
                />
              </div>
            </div>

            {/* Time-to-Schedule Distribution */}
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
              <DistributionChart
                title="Time-to-Schedule Distribution"
                distribution={analytics.timeToSchedule.distribution}
              />
            </div>

            {/* Engagement & Cancellation Details */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Engagement */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
                <h3 className="text-sm font-medium text-slate-300 mb-4">
                  Link Engagement
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Links Created</span>
                    <span className="text-sm text-white font-medium">
                      {analytics.engagement.linksCreated}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-slate-400">Slots Viewed</span>
                    <span className="text-sm text-white font-medium">
                      {analytics.engagement.slotsViewed}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                    <span className="text-sm text-slate-400">
                      Click-Through Rate
                    </span>
                    <span className="text-sm text-emerald-400 font-medium">
                      {formatPercentage(analytics.engagement.linkClickRate)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cancellation Reasons */}
              <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-5">
                <h3 className="text-sm font-medium text-slate-300 mb-4">
                  Cancellation Reasons
                </h3>
                {Object.keys(analytics.cancellationMetrics.cancellationReasons)
                  .length === 0 ? (
                  <p className="text-sm text-slate-500">No cancellations</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(
                      analytics.cancellationMetrics.cancellationReasons
                    )
                      .sort(([, a], [, b]) => b - a)
                      .map(([reason, count]) => (
                        <div
                          key={reason}
                          className="flex justify-between items-center"
                        >
                          <span className="text-sm text-slate-400 truncate max-w-[200px]">
                            {reason}
                          </span>
                          <span className="text-sm text-white font-medium">
                            {count}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Period Info */}
            <div className="text-xs text-slate-500 text-center pt-4">
              Data from {new Date(analytics.periodStart).toLocaleDateString()} to{' '}
              {new Date(analytics.periodEnd).toLocaleDateString()}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && analytics && analytics.bookingMetrics.total === 0 && (
          <div className="text-center py-16">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-800 mb-4">
              <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-slate-300">No data yet</h3>
            <p className="text-slate-500 mt-1">
              Start scheduling interviews to see your analytics
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
