/**
 * iCIMS Metrics
 *
 * Tracks API call metrics for observability and ops dashboard.
 * Uses in-memory counters with periodic aggregation.
 */

export interface IcimsApiMetrics {
  requestCount: number;
  successCount: number;
  failureCount: number;
  rateLimitCount: number;
  serverErrorCount: number;
  authFailureCount: number;
  totalLatencyMs: number;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  lastError: string | null;
}

export interface IcimsHealthStatus {
  status: 'healthy' | 'degraded' | 'down';
  lastSuccessfulCall: string | null;
  lastFailedCall: string | null;
  lastError: string | null;
  metricsLast24h: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    avgResponseTimeMs: number;
    rateLimitHits: number;
  };
  config: {
    mode: string;
    baseUrl: string;
    hasApiKey: boolean;
  };
}

// In-memory metrics storage
let metrics: IcimsApiMetrics = createEmptyMetrics();

// Metrics from last 24 hours (sliding window)
const recentMetrics: Array<{
  timestamp: Date;
  success: boolean;
  latencyMs: number;
  statusCode?: number;
}> = [];

const METRICS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function createEmptyMetrics(): IcimsApiMetrics {
  return {
    requestCount: 0,
    successCount: 0,
    failureCount: 0,
    rateLimitCount: 0,
    serverErrorCount: 0,
    authFailureCount: 0,
    totalLatencyMs: 0,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
  };
}

/**
 * Record a successful API call
 */
export function recordIcimsSuccess(latencyMs: number): void {
  const now = new Date();
  metrics.requestCount++;
  metrics.successCount++;
  metrics.totalLatencyMs += latencyMs;
  metrics.lastSuccessAt = now;

  recentMetrics.push({
    timestamp: now,
    success: true,
    latencyMs,
  });

  pruneOldMetrics();
}

/**
 * Record a failed API call
 */
export function recordIcimsFailure(
  latencyMs: number,
  statusCode: number | undefined,
  errorMessage: string
): void {
  const now = new Date();
  metrics.requestCount++;
  metrics.failureCount++;
  metrics.totalLatencyMs += latencyMs;
  metrics.lastFailureAt = now;
  metrics.lastError = errorMessage;

  // Track specific failure types
  if (statusCode === 429) {
    metrics.rateLimitCount++;
  } else if (statusCode && statusCode >= 500) {
    metrics.serverErrorCount++;
  } else if (statusCode === 401 || statusCode === 403) {
    metrics.authFailureCount++;
  }

  recentMetrics.push({
    timestamp: now,
    success: false,
    latencyMs,
    statusCode,
  });

  pruneOldMetrics();
}

/**
 * Remove metrics older than 24 hours
 */
function pruneOldMetrics(): void {
  const cutoff = new Date(Date.now() - METRICS_WINDOW_MS);
  while (recentMetrics.length > 0 && recentMetrics[0].timestamp < cutoff) {
    recentMetrics.shift();
  }
}

/**
 * Get current metrics
 */
export function getIcimsMetrics(): IcimsApiMetrics {
  return { ...metrics };
}

/**
 * Get metrics for last 24 hours
 */
export function getIcimsMetrics24h(): {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  avgResponseTimeMs: number;
  rateLimitHits: number;
} {
  pruneOldMetrics();

  const totalCalls = recentMetrics.length;
  const successfulCalls = recentMetrics.filter((m) => m.success).length;
  const failedCalls = totalCalls - successfulCalls;
  const totalLatency = recentMetrics.reduce((sum, m) => sum + m.latencyMs, 0);
  const avgResponseTimeMs = totalCalls > 0 ? Math.round(totalLatency / totalCalls) : 0;
  const rateLimitHits = recentMetrics.filter((m) => m.statusCode === 429).length;

  return {
    totalCalls,
    successfulCalls,
    failedCalls,
    avgResponseTimeMs,
    rateLimitHits,
  };
}

/**
 * Determine health status based on metrics
 */
export function getIcimsHealthStatus(): 'healthy' | 'degraded' | 'down' {
  const metrics24h = getIcimsMetrics24h();

  // No calls = healthy (nothing to measure)
  if (metrics24h.totalCalls === 0) {
    return 'healthy';
  }

  const successRate = metrics24h.successfulCalls / metrics24h.totalCalls;

  // Check for auth failures (critical)
  if (metrics.authFailureCount > 0 && metrics.lastFailureAt) {
    const lastFailure = metrics.lastFailureAt.getTime();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    if (lastFailure > fiveMinutesAgo) {
      return 'down';
    }
  }

  // Success rate thresholds
  if (successRate < 0.8) {
    return 'down';
  }
  if (successRate < 0.95) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Get full health status object for ops endpoint
 */
export function getIcimsFullHealthStatus(
  config: { mode: string; baseUrl: string; hasApiKey: boolean },
  syncJobs: { pending: number; processing: number; completedLast24h: number; failedLast24h: number }
): IcimsHealthStatus {
  const metrics24h = getIcimsMetrics24h();
  const status = getIcimsHealthStatus();

  return {
    status,
    lastSuccessfulCall: metrics.lastSuccessAt?.toISOString() ?? null,
    lastFailedCall: metrics.lastFailureAt?.toISOString() ?? null,
    lastError: metrics.lastError,
    metricsLast24h: metrics24h,
    config,
  };
}

/**
 * Reset metrics (for testing)
 */
export function resetIcimsMetrics(): void {
  metrics = createEmptyMetrics();
  recentMetrics.length = 0;
}
