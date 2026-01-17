/**
 * GraphMetricsCollector
 *
 * Singleton for collecting API call metrics for the Graph API.
 * Used by graphRetry wrapper to track calls, latency, errors, and rate limits.
 */

export interface EndpointMetrics {
  calls: number;
  successful: number;
  errors: number;
  totalLatencyMs: number;
  avgLatencyMs: number;
}

export interface ConnectionHealth {
  lastSuccessfulCall: Date | null;
  lastFailedCall: Date | null;
  consecutiveFailures: number;
}

export interface ApiCallMetrics {
  total: number;
  successful: number;
  failed: number;
  rateLimited: number;
  byEndpoint: Record<string, EndpointMetrics>;
}

export interface GraphCollectedMetrics {
  apiCalls: ApiCallMetrics;
  connectionHealth: ConnectionHealth;
}

class GraphMetricsCollectorClass {
  private apiCalls: ApiCallMetrics = {
    total: 0,
    successful: 0,
    failed: 0,
    rateLimited: 0,
    byEndpoint: {},
  };

  private connectionHealth: ConnectionHealth = {
    lastSuccessfulCall: null,
    lastFailedCall: null,
    consecutiveFailures: 0,
  };

  /**
   * Record a successful API call
   */
  recordSuccess(endpoint: string, latencyMs: number): void {
    this.apiCalls.total++;
    this.apiCalls.successful++;

    this.ensureEndpoint(endpoint);
    this.apiCalls.byEndpoint[endpoint].calls++;
    this.apiCalls.byEndpoint[endpoint].successful++;
    this.apiCalls.byEndpoint[endpoint].totalLatencyMs += latencyMs;
    this.updateAvgLatency(endpoint);

    this.connectionHealth.lastSuccessfulCall = new Date();
    this.connectionHealth.consecutiveFailures = 0;
  }

  /**
   * Record a failed API call
   */
  recordFailure(endpoint: string, latencyMs: number, statusCode: number): void {
    this.apiCalls.total++;
    this.apiCalls.failed++;

    if (statusCode === 429) {
      this.apiCalls.rateLimited++;
    }

    this.ensureEndpoint(endpoint);
    this.apiCalls.byEndpoint[endpoint].calls++;
    this.apiCalls.byEndpoint[endpoint].errors++;
    this.apiCalls.byEndpoint[endpoint].totalLatencyMs += latencyMs;
    this.updateAvgLatency(endpoint);

    this.connectionHealth.lastFailedCall = new Date();
    this.connectionHealth.consecutiveFailures++;
  }

  /**
   * Get current metrics
   */
  getMetrics(): GraphCollectedMetrics {
    return {
      apiCalls: { ...this.apiCalls, byEndpoint: { ...this.apiCalls.byEndpoint } },
      connectionHealth: { ...this.connectionHealth },
    };
  }

  /**
   * Reset all metrics (for testing)
   */
  reset(): void {
    this.apiCalls = {
      total: 0,
      successful: 0,
      failed: 0,
      rateLimited: 0,
      byEndpoint: {},
    };
    this.connectionHealth = {
      lastSuccessfulCall: null,
      lastFailedCall: null,
      consecutiveFailures: 0,
    };
  }

  private ensureEndpoint(endpoint: string): void {
    if (!this.apiCalls.byEndpoint[endpoint]) {
      this.apiCalls.byEndpoint[endpoint] = {
        calls: 0,
        successful: 0,
        errors: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0,
      };
    }
  }

  private updateAvgLatency(endpoint: string): void {
    const metrics = this.apiCalls.byEndpoint[endpoint];
    metrics.avgLatencyMs = Math.round(metrics.totalLatencyMs / metrics.calls);
  }
}

// Singleton export
export const GraphMetricsCollector = new GraphMetricsCollectorClass();
