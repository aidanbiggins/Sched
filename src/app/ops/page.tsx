'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

// Types
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'critical';
  timestamp: string;
  webhooks: {
    last24h: {
      received: number;
      processing: number;
      processed: number;
      failed: number;
    };
  };
  reconciliation: {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    requiresAttention: number;
  };
  requests: {
    byStatus: Record<string, number>;
    needsAttention: number;
  };
  notifications?: {
    pending: number;
    sending: number;
    sent: number;
    failed: number;
    canceled: number;
  };
}

interface WebhookEvent {
  id: string;
  eventType: string;
  eventId: string;
  status: string;
  verified: boolean;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  createdAt: string;
}

interface ReconciliationJob {
  id: string;
  jobType: string;
  entityType: string;
  entityId: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  detectionReason: string;
  createdAt: string;
}

interface AttentionRequest {
  id: string;
  candidateName: string;
  candidateEmail: string;
  reqTitle: string;
  status: string;
  needsAttentionReason: string | null;
  createdAt: string;
}

interface NotificationJob {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  toEmail: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAfter: string;
  sentAt: string | null;
  createdAt: string;
}

interface NotificationCounts {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  canceled: number;
}

type Tab = 'overview' | 'webhooks' | 'reconciliation' | 'attention' | 'notifications' | 'jobs' | 'analytics';

interface JobRun {
  id: string;
  jobName: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  status: 'running' | 'completed' | 'failed' | 'locked';
  processed: number;
  failed: number;
  skipped: number;
  queueDepthBefore: number | null;
  queueDepthAfter: number | null;
  triggeredBy: 'cron' | 'manual' | 'cli';
  instanceId: string;
  errorSummary: string | null;
}

interface JobStatus {
  jobName: string;
  lastRun: JobRun | null;
  queueDepth: number;
  failureRate24h: number;
  isHealthy: boolean;
  isLocked?: boolean;
}

interface JobsData {
  jobs: JobStatus[];
  recentRuns: JobRun[];
}

interface AnalyticsSummary {
  period: string;
  bookingMetrics: {
    total: number;
    bookingRate: number;
    byStatus: Record<string, number>;
  };
  timeToSchedule: {
    averageHours: number | null;
  };
  cancellationMetrics: {
    cancellationRate: number;
    rescheduleRate: number;
  };
}

// M15: Capacity recommendation interface
interface CapacityRecommendation {
  id: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  interviewerEmail: string | null;
  title: string;
  description: string;
  status: string;
}

export default function OpsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEvent[]>([]);
  const [reconciliationJobs, setReconciliationJobs] = useState<ReconciliationJob[]>([]);
  const [attentionRequests, setAttentionRequests] = useState<AttentionRequest[]>([]);
  const [notifications, setNotifications] = useState<NotificationJob[]>([]);
  const [notificationCounts, setNotificationCounts] = useState<NotificationCounts | null>(null);
  const [notificationStatusFilter, setNotificationStatusFilter] = useState<string>('');
  const [notificationTypeFilter, setNotificationTypeFilter] = useState<string>('');
  const [analyticsSummary, setAnalyticsSummary] = useState<AnalyticsSummary | null>(null);
  const [jobsData, setJobsData] = useState<JobsData | null>(null);
  const [capacityRecommendations, setCapacityRecommendations] = useState<CapacityRecommendation[]>([]);
  const [graphValidation, setGraphValidation] = useState<{
    configured: boolean;
    mode: string;
    lastValidation?: {
      id: string;
      runAt: string;
      overallStatus: string;
      tenantId: string;
      runBy: string;
      scopingProof: { organizerAccessAllowed: boolean; nonOrganizerAccessDenied: boolean | null };
      passedChecks: number;
      failedChecks: number;
      skippedChecks: number;
    };
  } | null>(null);
  const [icimsHealth, setIcimsHealth] = useState<{
    status: string;
    config: { mode: string; hasApiKey: boolean };
    syncJobs: { pending: number; completedLast24h: number; failedLast24h: number };
    metricsLast24h: { totalCalls: number; successfulCalls: number; failedCalls: number };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch health data
  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/health');
      if (!res.ok) throw new Error('Failed to fetch health');
      const data = await res.json();
      setHealth(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, []);

  // Fetch webhooks
  const fetchWebhooks = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/webhooks?limit=50');
      if (!res.ok) throw new Error('Failed to fetch webhooks');
      const data = await res.json();
      setWebhooks(data.events);
    } catch (err) {
      console.error('Error fetching webhooks:', err);
    }
  }, []);

  // Fetch reconciliation jobs
  const fetchReconciliation = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/reconciliation?limit=50');
      if (!res.ok) throw new Error('Failed to fetch reconciliation');
      const data = await res.json();
      setReconciliationJobs(data.jobs);
    } catch (err) {
      console.error('Error fetching reconciliation:', err);
    }
  }, []);

  // Fetch attention requests
  const fetchAttention = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/attention?limit=50');
      if (!res.ok) throw new Error('Failed to fetch attention');
      const data = await res.json();
      setAttentionRequests(data.requests);
    } catch (err) {
      console.error('Error fetching attention:', err);
    }
  }, []);

  // Fetch notifications
  const fetchNotifications = useCallback(async (statusFilter?: string, typeFilter?: string) => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('type', typeFilter);
      params.set('limit', '50');

      const res = await fetch(`/api/ops/notifications?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const data = await res.json();
      setNotifications(data.jobs);
      setNotificationCounts(data.counts);
    } catch (err) {
      console.error('Error fetching notifications:', err);
    }
  }, []);

  // Fetch analytics summary
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics?period=30d');
      if (!res.ok) throw new Error('Failed to fetch analytics');
      const data = await res.json();
      setAnalyticsSummary(data);
    } catch (err) {
      console.error('Error fetching analytics:', err);
    }
  }, []);

  // Fetch jobs data
  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/jobs');
      if (!res.ok) throw new Error('Failed to fetch jobs');
      const data = await res.json();
      setJobsData(data);
    } catch (err) {
      console.error('Error fetching jobs:', err);
    }
  }, []);

  // Fetch capacity recommendations (M15)
  const fetchCapacity = useCallback(async () => {
    try {
      const res = await fetch('/api/capacity/recommendations?status=active');
      if (!res.ok) return;
      const data = await res.json();
      setCapacityRecommendations(data.recommendations || []);
    } catch (err) {
      console.error('Error fetching capacity:', err);
    }
  }, []);

  // Fetch Graph validation status (M17)
  const fetchGraphValidation = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/graph-validator');
      if (!res.ok) return;
      const data = await res.json();
      setGraphValidation(data);
    } catch (err) {
      console.error('Error fetching graph validation:', err);
    }
  }, []);

  // Fetch iCIMS health (M17)
  const fetchIcimsHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/icims');
      if (!res.ok) return;
      const data = await res.json();
      setIcimsHealth(data);
    } catch (err) {
      console.error('Error fetching icims health:', err);
    }
  }, []);

  // Trigger manual job run
  const triggerJob = async (jobName: string) => {
    try {
      const res = await fetch('/api/ops/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobName }),
      });
      if (!res.ok) throw new Error('Failed to trigger job');
      // Refresh jobs data
      await fetchJobs();
    } catch (err) {
      console.error('Error triggering job:', err);
    }
  };

  // Retry notification job
  const retryNotification = async (id: string) => {
    try {
      const res = await fetch(`/api/ops/notifications/${id}/retry`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to retry notification');
      fetchNotifications(notificationStatusFilter, notificationTypeFilter);
      fetchHealth();
    } catch (err) {
      console.error('Error retrying notification:', err);
    }
  };

  // Dismiss attention
  const dismissAttention = async (id: string, reason?: string) => {
    try {
      const res = await fetch(`/api/ops/attention/${id}/dismiss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('Failed to dismiss');
      fetchAttention();
      fetchHealth();
    } catch (err) {
      console.error('Error dismissing attention:', err);
    }
  };

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([
        fetchHealth(),
        fetchWebhooks(),
        fetchReconciliation(),
        fetchAttention(),
        fetchNotifications(),
        fetchAnalytics(),
        fetchJobs(),
        fetchCapacity(),
        fetchGraphValidation(),
        fetchIcimsHealth(),
      ]);
      setLoading(false);
    };
    load();
  }, [fetchHealth, fetchWebhooks, fetchReconciliation, fetchAttention, fetchNotifications, fetchAnalytics, fetchJobs, fetchCapacity, fetchGraphValidation, fetchIcimsHealth]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchHealth();
      fetchCapacity(); // Always refresh capacity for alerts
      if (activeTab === 'webhooks') fetchWebhooks();
      if (activeTab === 'reconciliation') fetchReconciliation();
      if (activeTab === 'attention') fetchAttention();
      if (activeTab === 'notifications') fetchNotifications(notificationStatusFilter, notificationTypeFilter);
      if (activeTab === 'jobs') fetchJobs();
      if (activeTab === 'analytics') fetchAnalytics();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, activeTab, fetchHealth, fetchWebhooks, fetchReconciliation, fetchAttention, fetchNotifications, fetchJobs, fetchAnalytics, fetchCapacity, notificationStatusFilter, notificationTypeFilter]);

  // Refetch notifications when filters change
  useEffect(() => {
    if (activeTab === 'notifications') {
      fetchNotifications(notificationStatusFilter, notificationTypeFilter);
    }
  }, [activeTab, notificationStatusFilter, notificationTypeFilter, fetchNotifications]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 mt-2">Loading operator dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/coordinator" className="text-slate-400 hover:text-slate-200">
              &larr; Coordinator
            </Link>
            <h1 className="text-xl font-semibold">Operator Health Dashboard</h1>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/ops/audit"
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              Audit Log
            </Link>
            <Link
              href="/ops/graph-validator"
              className="px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
            >
              Graph Validator
            </Link>
            <label className="flex items-center gap-2 text-sm text-slate-400">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded bg-slate-700 border-slate-600"
              />
              Auto-refresh
            </label>
            <span className="text-sm text-slate-500">
              Last updated: {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '--'}
            </span>
          </div>
        </div>
      </header>

      {/* Status Banner */}
      {health && (
        <div
          className={`px-4 py-2 text-center text-sm font-medium ${
            health.status === 'healthy'
              ? 'bg-emerald-900/50 text-emerald-300'
              : health.status === 'degraded'
              ? 'bg-amber-900/50 text-amber-300'
              : 'bg-red-900/50 text-red-300'
          }`}
        >
          System Status: {health.status.toUpperCase()}
          {health.status !== 'healthy' && (
            <span className="ml-2">
              ({health.requests.needsAttention} requests need attention,{' '}
              {health.webhooks.last24h.failed} webhook failures,{' '}
              {health.reconciliation.failed} reconciliation failures)
            </span>
          )}
        </div>
      )}

      {/* Critical Alerts Panel */}
      {health && (health.status !== 'healthy' || capacityRecommendations.some(r => r.priority === 'critical' || r.priority === 'high')) && (
        <CriticalAlertsPanel health={health} capacityRecommendations={capacityRecommendations} onTabChange={setActiveTab} />
      )}

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            {(['overview', 'webhooks', 'reconciliation', 'attention', 'notifications', 'jobs', 'analytics'] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab
                    ? 'border-cyan-500 text-cyan-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                {tab === 'attention' && health && health.requests.needsAttention > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500/30 text-red-300 rounded">
                    {health.requests.needsAttention}
                  </span>
                )}
                {tab === 'notifications' && health?.notifications && health.notifications.failed > 0 && (
                  <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500/30 text-red-300 rounded">
                    {health.notifications.failed}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 p-4 bg-red-900/30 border border-red-700 rounded text-red-300">
            {error}
          </div>
        )}

        {activeTab === 'overview' && health && (
          <OverviewTab
            health={health}
            graphValidation={graphValidation}
            icimsHealth={icimsHealth}
          />
        )}
        {activeTab === 'webhooks' && <WebhooksTab webhooks={webhooks} />}
        {activeTab === 'reconciliation' && <ReconciliationTab jobs={reconciliationJobs} />}
        {activeTab === 'attention' && (
          <AttentionTab requests={attentionRequests} onDismiss={dismissAttention} />
        )}
        {activeTab === 'notifications' && (
          <NotificationsTab
            notifications={notifications}
            counts={notificationCounts}
            statusFilter={notificationStatusFilter}
            typeFilter={notificationTypeFilter}
            onStatusFilterChange={setNotificationStatusFilter}
            onTypeFilterChange={setNotificationTypeFilter}
            onRetry={retryNotification}
          />
        )}
        {activeTab === 'jobs' && (
          <JobsTab jobsData={jobsData} onTrigger={triggerJob} />
        )}
        {activeTab === 'analytics' && (
          <AnalyticsTab analytics={analyticsSummary} />
        )}
      </main>
    </div>
  );
}

// Overview Tab
function OverviewTab({
  health,
  graphValidation,
  icimsHealth,
}: {
  health: HealthStatus;
  graphValidation: {
    configured: boolean;
    mode: string;
    lastValidation?: {
      id: string;
      runAt: string;
      overallStatus: string;
      tenantId: string;
      runBy: string;
      scopingProof: { organizerAccessAllowed: boolean; nonOrganizerAccessDenied: boolean | null };
      passedChecks: number;
      failedChecks: number;
      skippedChecks: number;
    };
  } | null;
  icimsHealth: {
    status: string;
    config: { mode: string; hasApiKey: boolean };
    syncJobs: { pending: number; completedLast24h: number; failedLast24h: number };
    metricsLast24h: { totalCalls: number; successfulCalls: number; failedCalls: number };
  } | null;
}) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title="Webhooks (24h)"
          value={health.webhooks.last24h.received}
          subtitle={`${health.webhooks.last24h.processed} processed, ${health.webhooks.last24h.failed} failed`}
          status={health.webhooks.last24h.failed > 0 ? 'warning' : 'ok'}
        />
        <SummaryCard
          title="Reconciliation"
          value={health.reconciliation.pending}
          subtitle={`${health.reconciliation.completed} completed, ${health.reconciliation.failed} failed`}
          status={health.reconciliation.failed > 0 ? 'warning' : 'ok'}
        />
        <SummaryCard
          title="Needs Attention"
          value={health.requests.needsAttention}
          subtitle="Requests requiring operator action"
          status={health.requests.needsAttention > 0 ? 'critical' : 'ok'}
        />
        <SummaryCard
          title="Request Status"
          value={Object.values(health.requests.byStatus).reduce((a, b) => a + b, 0)}
          subtitle={`${health.requests.byStatus.pending || 0} pending, ${health.requests.byStatus.booked || 0} booked`}
          status="ok"
        />
        {health.notifications && (
          <SummaryCard
            title="Notifications"
            value={health.notifications.pending + health.notifications.sending}
            subtitle={`${health.notifications.sent} sent, ${health.notifications.failed} failed`}
            status={health.notifications.failed > 0 ? 'warning' : 'ok'}
          />
        )}
      </div>

      {/* Integration Status Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Graph API Status */}
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Microsoft Graph API</h3>
            {graphValidation && (
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                graphValidation.mode === 'mock'
                  ? 'bg-slate-600 text-slate-300'
                  : graphValidation.configured
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : 'bg-amber-500/20 text-amber-300'
              }`}>
                {graphValidation.mode === 'mock' ? 'Mock Mode' : graphValidation.configured ? 'Configured' : 'Not Configured'}
              </span>
            )}
          </div>
          {graphValidation?.lastValidation ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Last Validation:</span>
                <span className={graphValidation.lastValidation.overallStatus === 'ready' ? 'text-emerald-400' : 'text-red-400'}>
                  {graphValidation.lastValidation.overallStatus.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Tenant:</span>
                <span className="font-mono text-xs">{graphValidation.lastValidation.tenantId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Scoping Proof:</span>
                <span>
                  {graphValidation.lastValidation.scopingProof.organizerAccessAllowed ? '✓ Organizer' : '✗ Organizer'}
                  {graphValidation.lastValidation.scopingProof.nonOrganizerAccessDenied !== null && (
                    graphValidation.lastValidation.scopingProof.nonOrganizerAccessDenied ? ' ✓ Scoped' : ' ✗ Scoped'
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Checks:</span>
                <span>
                  <span className="text-emerald-400">{graphValidation.lastValidation.passedChecks} passed</span>
                  {graphValidation.lastValidation.failedChecks > 0 && (
                    <span className="text-red-400 ml-2">{graphValidation.lastValidation.failedChecks} failed</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Run at:</span>
                <span className="text-slate-300">{new Date(graphValidation.lastValidation.runAt).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Run by:</span>
                <span className="text-slate-300">{graphValidation.lastValidation.runBy}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              {graphValidation?.mode === 'mock'
                ? 'Running in mock mode - no real Graph API calls'
                : 'No validation run yet. Run the Graph Validator to generate evidence.'}
            </p>
          )}
          <Link
            href="/ops/graph-validator"
            className="mt-4 inline-block px-3 py-1.5 text-sm bg-slate-700 hover:bg-slate-600 rounded transition-colors"
          >
            Run Validator
          </Link>
        </div>

        {/* iCIMS Status */}
        <div className="bg-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">iCIMS Integration</h3>
            {icimsHealth && (
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                icimsHealth.config.mode === 'mock'
                  ? 'bg-slate-600 text-slate-300'
                  : icimsHealth.status === 'healthy'
                  ? 'bg-emerald-500/20 text-emerald-300'
                  : icimsHealth.status === 'degraded'
                  ? 'bg-amber-500/20 text-amber-300'
                  : 'bg-red-500/20 text-red-300'
              }`}>
                {icimsHealth.config.mode === 'mock' ? 'Mock Mode' : icimsHealth.status.toUpperCase()}
              </span>
            )}
          </div>
          {icimsHealth ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">API Calls (24h):</span>
                <span className="text-slate-300">{icimsHealth.metricsLast24h.totalCalls}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Successful:</span>
                <span className="text-emerald-400">{icimsHealth.metricsLast24h.successfulCalls}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Failed:</span>
                <span className={icimsHealth.metricsLast24h.failedCalls > 0 ? 'text-red-400' : 'text-slate-300'}>
                  {icimsHealth.metricsLast24h.failedCalls}
                </span>
              </div>
              <hr className="border-slate-700 my-2" />
              <div className="flex justify-between">
                <span className="text-slate-400">Sync Jobs Pending:</span>
                <span className="text-amber-400">{icimsHealth.syncJobs.pending}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Completed (24h):</span>
                <span className="text-emerald-400">{icimsHealth.syncJobs.completedLast24h}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Failed (24h):</span>
                <span className={icimsHealth.syncJobs.failedLast24h > 0 ? 'text-red-400' : 'text-slate-300'}>
                  {icimsHealth.syncJobs.failedLast24h}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Loading iCIMS status...</p>
          )}
        </div>
      </div>

      {/* Webhook Stats */}
      <div className="bg-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4">Webhook Events (Last 24h)</h3>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-slate-100">{health.webhooks.last24h.received}</div>
            <div className="text-sm text-slate-400">Received</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{health.webhooks.last24h.processing}</div>
            <div className="text-sm text-slate-400">Processing</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">{health.webhooks.last24h.processed}</div>
            <div className="text-sm text-slate-400">Processed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{health.webhooks.last24h.failed}</div>
            <div className="text-sm text-slate-400">Failed</div>
          </div>
        </div>
      </div>

      {/* Reconciliation Stats */}
      <div className="bg-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4">Reconciliation Jobs</h3>
        <div className="grid grid-cols-5 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">{health.reconciliation.pending}</div>
            <div className="text-sm text-slate-400">Pending</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-400">{health.reconciliation.processing}</div>
            <div className="text-sm text-slate-400">Processing</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">{health.reconciliation.completed}</div>
            <div className="text-sm text-slate-400">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-400">{health.reconciliation.failed}</div>
            <div className="text-sm text-slate-400">Failed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-400">{health.reconciliation.requiresAttention}</div>
            <div className="text-sm text-slate-400">Needs Attention</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Summary Card Component
function SummaryCard({
  title,
  value,
  subtitle,
  status,
}: {
  title: string;
  value: number;
  subtitle: string;
  status: 'ok' | 'warning' | 'critical';
}) {
  const borderColor = {
    ok: 'border-slate-700',
    warning: 'border-amber-700',
    critical: 'border-red-700',
  }[status];

  return (
    <div className={`bg-slate-800 rounded-lg p-4 border-l-4 ${borderColor}`}>
      <h4 className="text-sm font-medium text-slate-400">{title}</h4>
      <div className="text-3xl font-bold mt-1">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
    </div>
  );
}

// Webhooks Tab
function WebhooksTab({ webhooks }: { webhooks: WebhookEvent[] }) {
  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="font-medium">Recent Webhook Events</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-700/50 text-left text-sm">
            <tr>
              <th className="px-4 py-2">Event Type</th>
              <th className="px-4 py-2">Event ID</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Verified</th>
              <th className="px-4 py-2">Attempts</th>
              <th className="px-4 py-2">Error</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {webhooks.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No webhook events
                </td>
              </tr>
            ) : (
              webhooks.map((event) => (
                <tr key={event.id} className="hover:bg-slate-700/30">
                  <td className="px-4 py-2 font-mono text-sm">{event.eventType}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{event.eventId}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={event.status} />
                  </td>
                  <td className="px-4 py-2">
                    {event.verified ? (
                      <span className="text-emerald-400">✓</span>
                    ) : (
                      <span className="text-red-400">✗</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {event.attempts}/{event.maxAttempts}
                  </td>
                  <td className="px-4 py-2 text-xs text-red-400 max-w-xs truncate">
                    {event.lastError || '-'}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-400">
                    {new Date(event.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Reconciliation Tab
function ReconciliationTab({ jobs }: { jobs: ReconciliationJob[] }) {
  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="font-medium">Reconciliation Jobs</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-700/50 text-left text-sm">
            <tr>
              <th className="px-4 py-2">Job Type</th>
              <th className="px-4 py-2">Entity</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Attempts</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Error</th>
              <th className="px-4 py-2">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No reconciliation jobs
                </td>
              </tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="hover:bg-slate-700/30">
                  <td className="px-4 py-2">
                    <span className="font-mono text-sm">{job.jobType}</span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <span className="text-slate-400">{job.entityType}</span>
                    <br />
                    <span className="font-mono text-slate-500">{job.entityId.slice(0, 8)}...</span>
                  </td>
                  <td className="px-4 py-2">
                    <StatusBadge status={job.status} />
                  </td>
                  <td className="px-4 py-2 text-sm">
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="px-4 py-2 text-xs max-w-xs truncate text-slate-400">
                    {job.detectionReason}
                  </td>
                  <td className="px-4 py-2 text-xs text-red-400 max-w-xs truncate">
                    {job.lastError || '-'}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-400">
                    {new Date(job.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Attention Tab
function AttentionTab({
  requests,
  onDismiss,
}: {
  requests: AttentionRequest[];
  onDismiss: (id: string, reason?: string) => void;
}) {
  return (
    <div className="bg-slate-800 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="font-medium">Requests Needing Attention</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-700/50 text-left text-sm">
            <tr>
              <th className="px-4 py-2">Candidate</th>
              <th className="px-4 py-2">Position</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Reason</th>
              <th className="px-4 py-2">Created</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {requests.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No requests need attention
                </td>
              </tr>
            ) : (
              requests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-700/30">
                  <td className="px-4 py-2">
                    <div className="font-medium">{req.candidateName}</div>
                    <div className="text-xs text-slate-400">{req.candidateEmail}</div>
                  </td>
                  <td className="px-4 py-2">{req.reqTitle}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={req.status} />
                  </td>
                  <td className="px-4 py-2 text-sm text-amber-400 max-w-xs">
                    {req.needsAttentionReason}
                  </td>
                  <td className="px-4 py-2 text-sm text-slate-400">
                    {new Date(req.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <Link
                        href={`/coordinator/${req.id}`}
                        className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => onDismiss(req.id, 'Resolved by operator')}
                        className="px-2 py-1 text-xs bg-amber-700/50 hover:bg-amber-700 text-amber-200 rounded"
                      >
                        Dismiss
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Notifications Tab
function NotificationsTab({
  notifications,
  counts,
  statusFilter,
  typeFilter,
  onStatusFilterChange,
  onTypeFilterChange,
  onRetry,
}: {
  notifications: NotificationJob[];
  counts: NotificationCounts | null;
  statusFilter: string;
  typeFilter: string;
  onStatusFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onRetry: (id: string) => void;
}) {
  const [expandedJob, setExpandedJob] = useState<string | null>(null);

  const notificationTypes = [
    'candidate_availability_request',
    'candidate_self_schedule_link',
    'booking_confirmation',
    'reschedule_confirmation',
    'cancel_notice',
    'reminder_24h',
    'reminder_2h',
  ];

  return (
    <div className="space-y-6">
      {/* Queue Depth Stats */}
      {counts && (
        <div className="bg-slate-800 rounded-lg p-6">
          <h3 className="text-lg font-medium mb-4">Notification Queue</h3>
          <div className="grid grid-cols-5 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{counts.pending}</div>
              <div className="text-sm text-slate-400">Pending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{counts.sending}</div>
              <div className="text-sm text-slate-400">Sending</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{counts.sent}</div>
              <div className="text-sm text-slate-400">Sent</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{counts.failed}</div>
              <div className="text-sm text-slate-400">Failed</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-400">{counts.canceled}</div>
              <div className="text-sm text-slate-400">Canceled</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="SENDING">Sending</option>
            <option value="SENT">Sent</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELED">Canceled</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-slate-400">Type:</label>
          <select
            value={typeFilter}
            onChange={(e) => onTypeFilterChange(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All</option>
            {notificationTypes.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Jobs Table */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h3 className="font-medium">Notification Jobs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50 text-left text-sm">
              <tr>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">To</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Attempts</th>
                <th className="px-4 py-2">Scheduled</th>
                <th className="px-4 py-2">Error</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {notifications.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    No notification jobs
                  </td>
                </tr>
              ) : (
                notifications.map((job) => (
                  <>
                    <tr key={job.id} className="hover:bg-slate-700/30">
                      <td className="px-4 py-2">
                        <span className="font-mono text-sm">{job.type.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-300">{job.toEmail}</td>
                      <td className="px-4 py-2">
                        <StatusBadge status={job.status} />
                      </td>
                      <td className="px-4 py-2 text-sm">
                        {job.attempts}/{job.maxAttempts}
                      </td>
                      <td className="px-4 py-2 text-sm text-slate-400">
                        {new Date(job.runAfter).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-xs text-red-400 max-w-xs truncate">
                        {job.lastError || '-'}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => setExpandedJob(expandedJob === job.id ? null : job.id)}
                            className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded"
                          >
                            {expandedJob === job.id ? 'Hide' : 'Details'}
                          </button>
                          {job.status === 'FAILED' && (
                            <button
                              onClick={() => onRetry(job.id)}
                              className="px-2 py-1 text-xs bg-cyan-700/50 hover:bg-cyan-700 text-cyan-200 rounded"
                            >
                              Retry
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedJob === job.id && (
                      <tr key={`${job.id}-details`} className="bg-slate-900/50">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <span className="text-slate-400">Job ID:</span>{' '}
                              <span className="font-mono text-xs">{job.id}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Entity:</span>{' '}
                              <span className="font-mono text-xs">{job.entityType}:{job.entityId}</span>
                            </div>
                            <div>
                              <span className="text-slate-400">Created:</span>{' '}
                              {new Date(job.createdAt).toLocaleString()}
                            </div>
                            <div>
                              <span className="text-slate-400">Sent at:</span>{' '}
                              {job.sentAt ? new Date(job.sentAt).toLocaleString() : '-'}
                            </div>
                            {job.lastError && (
                              <div className="col-span-2">
                                <span className="text-slate-400">Full Error:</span>
                                <pre className="mt-1 p-2 bg-slate-800 rounded text-xs text-red-400 whitespace-pre-wrap">
                                  {job.lastError}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Analytics Tab
function AnalyticsTab({ analytics }: { analytics: AnalyticsSummary | null }) {
  const formatPercentage = (value: number) => `${(value * 100).toFixed(1)}%`;
  const formatHours = (hours: number | null) => {
    if (hours === null) return 'N/A';
    if (hours < 1) return `${Math.round(hours * 60)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  if (!analytics) {
    return (
      <div className="text-center py-12 text-slate-500">
        Loading analytics...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800 rounded-lg p-4 border-l-4 border-blue-500">
          <h4 className="text-sm font-medium text-slate-400">Total Requests (30d)</h4>
          <div className="text-3xl font-bold mt-1">{analytics.bookingMetrics.total}</div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4 border-l-4 border-emerald-500">
          <h4 className="text-sm font-medium text-slate-400">Booking Rate</h4>
          <div className="text-3xl font-bold mt-1 text-emerald-400">
            {formatPercentage(analytics.bookingMetrics.bookingRate)}
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4 border-l-4 border-amber-500">
          <h4 className="text-sm font-medium text-slate-400">Avg Time-to-Schedule</h4>
          <div className="text-3xl font-bold mt-1 text-amber-400">
            {formatHours(analytics.timeToSchedule.averageHours)}
          </div>
        </div>
        <div className="bg-slate-800 rounded-lg p-4 border-l-4 border-red-500">
          <h4 className="text-sm font-medium text-slate-400">Cancellation Rate</h4>
          <div className="text-3xl font-bold mt-1 text-red-400">
            {formatPercentage(analytics.cancellationMetrics.cancellationRate)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Reschedule: {formatPercentage(analytics.cancellationMetrics.rescheduleRate)}
          </div>
        </div>
      </div>

      {/* Request Status Breakdown */}
      <div className="bg-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-medium mb-4">Request Status (30 days)</h3>
        <div className="grid grid-cols-5 gap-4">
          {(['pending', 'booked', 'rescheduled', 'cancelled', 'expired'] as const).map((status) => (
            <div key={status} className="text-center">
              <div className="text-2xl font-bold text-slate-100">
                {analytics.bookingMetrics.byStatus[status] || 0}
              </div>
              <div className="text-sm text-slate-400 capitalize">{status}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Link to Full Analytics */}
      <div className="text-center">
        <Link
          href="/analytics"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-sm font-medium transition-colors"
        >
          View Full Analytics Dashboard
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// Jobs Tab
function JobsTab({
  jobsData,
  onTrigger,
}: {
  jobsData: JobsData | null;
  onTrigger: (jobName: string) => void;
}) {
  const [triggering, setTriggering] = useState<string | null>(null);

  const handleTrigger = async (jobName: string) => {
    setTriggering(jobName);
    try {
      await onTrigger(jobName);
    } finally {
      setTriggering(null);
    }
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatTimeAgo = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (!jobsData) {
    return (
      <div className="text-center py-12 text-slate-500">
        Loading jobs data...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Job Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {jobsData.jobs.map((job) => (
          <div
            key={job.jobName}
            className={`bg-slate-800 rounded-lg p-4 border-l-4 ${
              job.isLocked
                ? 'border-yellow-500'
                : job.isHealthy
                ? 'border-emerald-500'
                : 'border-red-500'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium text-slate-400 capitalize">{job.jobName}</h4>
              {job.isLocked && (
                <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-300 rounded">
                  Locked
                </span>
              )}
            </div>
            <div className="text-2xl font-bold mt-1">{job.queueDepth}</div>
            <div className="text-xs text-slate-500 mt-1">Queue depth</div>
            <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-400">
              <div className="flex justify-between">
                <span>Last run:</span>
                <span>{formatTimeAgo(job.lastRun?.finishedAt ?? null)}</span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span>{formatDuration(job.lastRun?.durationMs ?? null)}</span>
              </div>
              <div className="flex justify-between">
                <span>Failure rate (24h):</span>
                <span className={job.failureRate24h > 0.5 ? 'text-red-400' : ''}>
                  {(job.failureRate24h * 100).toFixed(0)}%
                </span>
              </div>
            </div>
            <button
              onClick={() => handleTrigger(job.jobName)}
              disabled={triggering === job.jobName || job.isLocked}
              className={`mt-3 w-full px-3 py-1.5 text-sm rounded transition-colors ${
                triggering === job.jobName || job.isLocked
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-cyan-700/50 hover:bg-cyan-700 text-cyan-200'
              }`}
            >
              {triggering === job.jobName ? 'Running...' : 'Run Now'}
            </button>
          </div>
        ))}
      </div>

      {/* Recent Runs Table */}
      <div className="bg-slate-800 rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-700">
          <h3 className="font-medium">Recent Job Runs</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-700/50 text-left text-sm">
              <tr>
                <th className="px-4 py-2">Job</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Trigger</th>
                <th className="px-4 py-2">Processed</th>
                <th className="px-4 py-2">Failed</th>
                <th className="px-4 py-2">Queue</th>
                <th className="px-4 py-2">Duration</th>
                <th className="px-4 py-2">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {jobsData.recentRuns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No job runs yet
                  </td>
                </tr>
              ) : (
                jobsData.recentRuns.map((run) => (
                  <tr key={run.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-2 font-medium capitalize">{run.jobName}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-4 py-2 text-sm text-slate-400">{run.triggeredBy}</td>
                    <td className="px-4 py-2 text-sm text-emerald-400">{run.processed}</td>
                    <td className="px-4 py-2 text-sm text-red-400">{run.failed}</td>
                    <td className="px-4 py-2 text-sm text-slate-400">
                      {run.queueDepthBefore} → {run.queueDepthAfter}
                    </td>
                    <td className="px-4 py-2 text-sm">{formatDuration(run.durationMs)}</td>
                    <td className="px-4 py-2 text-sm text-slate-400">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    received: 'bg-blue-500/20 text-blue-300',
    processing: 'bg-yellow-500/20 text-yellow-300',
    processed: 'bg-emerald-500/20 text-emerald-300',
    completed: 'bg-emerald-500/20 text-emerald-300',
    failed: 'bg-red-500/20 text-red-300',
    pending: 'bg-slate-500/20 text-slate-300',
    requires_attention: 'bg-orange-500/20 text-orange-300',
    booked: 'bg-emerald-500/20 text-emerald-300',
    cancelled: 'bg-slate-500/20 text-slate-300',
    expired: 'bg-slate-500/20 text-slate-300',
    // Job run statuses
    running: 'bg-blue-500/20 text-blue-300',
    locked: 'bg-yellow-500/20 text-yellow-300',
    // Notification statuses
    PENDING: 'bg-amber-500/20 text-amber-300',
    SENDING: 'bg-blue-500/20 text-blue-300',
    SENT: 'bg-emerald-500/20 text-emerald-300',
    FAILED: 'bg-red-500/20 text-red-300',
    CANCELED: 'bg-slate-500/20 text-slate-300',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[status] || 'bg-slate-600 text-slate-300'}`}>
      {status}
    </span>
  );
}

// Critical Alerts Panel - shows when system has failures
function CriticalAlertsPanel({
  health,
  capacityRecommendations,
  onTabChange,
}: {
  health: HealthStatus;
  capacityRecommendations: CapacityRecommendation[];
  onTabChange: (tab: Tab) => void;
}) {
  const alerts: Array<{
    severity: 'critical' | 'warning';
    message: string;
    count: number;
    tab: Tab;
    detail?: string;
  }> = [];

  // Check for critical failures
  if (health.requests.needsAttention > 0) {
    alerts.push({
      severity: 'critical',
      message: 'Requests need operator attention',
      count: health.requests.needsAttention,
      tab: 'attention',
    });
  }

  if (health.webhooks.last24h.failed > 0) {
    alerts.push({
      severity: health.webhooks.last24h.failed > 5 ? 'critical' : 'warning',
      message: 'Webhook processing failures (24h)',
      count: health.webhooks.last24h.failed,
      tab: 'webhooks',
    });
  }

  if (health.reconciliation.failed > 0) {
    alerts.push({
      severity: health.reconciliation.failed > 3 ? 'critical' : 'warning',
      message: 'Reconciliation job failures',
      count: health.reconciliation.failed,
      tab: 'reconciliation',
    });
  }

  if (health.reconciliation.requiresAttention > 0) {
    alerts.push({
      severity: 'warning',
      message: 'Reconciliation jobs need attention',
      count: health.reconciliation.requiresAttention,
      tab: 'reconciliation',
    });
  }

  if (health.notifications?.failed && health.notifications.failed > 0) {
    alerts.push({
      severity: health.notifications.failed > 5 ? 'critical' : 'warning',
      message: 'Notification delivery failures',
      count: health.notifications.failed,
      tab: 'notifications',
    });
  }

  // M15: Add capacity alerts
  const criticalCapacity = capacityRecommendations.filter(r => r.priority === 'critical');
  const highCapacity = capacityRecommendations.filter(r => r.priority === 'high');

  if (criticalCapacity.length > 0) {
    alerts.push({
      severity: 'critical',
      message: 'Interviewers over capacity',
      count: criticalCapacity.length,
      tab: 'jobs', // Links to jobs tab where capacity worker runs
      detail: criticalCapacity.map(r => r.interviewerEmail || 'Unknown').join(', '),
    });
  }

  if (highCapacity.length > 0) {
    alerts.push({
      severity: 'warning',
      message: 'Interviewers at/near capacity',
      count: highCapacity.length,
      tab: 'jobs',
      detail: highCapacity.map(r => r.interviewerEmail || 'Unknown').join(', '),
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-4">
      <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
        <div className="px-4 py-3 bg-slate-700/50 border-b border-slate-700 flex items-center gap-2">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="font-medium text-slate-100">Active Alerts</span>
          <span className="ml-auto text-sm text-slate-400">
            {alerts.filter(a => a.severity === 'critical').length} critical, {alerts.filter(a => a.severity === 'warning').length} warnings
          </span>
        </div>
        <div className="divide-y divide-slate-700">
          {alerts.map((alert, idx) => (
            <div
              key={idx}
              className="px-4 py-3 flex items-center gap-4 hover:bg-slate-700/30 transition-colors"
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  alert.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                }`}
              />
              <div className="flex-1">
                <span className="text-sm text-slate-200">{alert.message}</span>
                {alert.detail && (
                  <span className="ml-2 text-xs text-slate-400">({alert.detail})</span>
                )}
              </div>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${
                  alert.severity === 'critical'
                    ? 'bg-red-500/20 text-red-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}
              >
                {alert.count}
              </span>
              <button
                onClick={() => onTabChange(alert.tab)}
                className="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded transition-colors"
              >
                View
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
