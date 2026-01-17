/**
 * Unit tests for GraphMetricsCollector
 *
 * Tests metrics collection for Graph API calls.
 */

import { GraphMetricsCollector } from '@/lib/graph/GraphMetricsCollector';

describe('GraphMetricsCollector', () => {
  beforeEach(() => {
    // Reset metrics before each test
    GraphMetricsCollector.reset();
  });

  describe('recordSuccess', () => {
    it('increments total and successful counts', () => {
      GraphMetricsCollector.recordSuccess('/users/{user}/calendar', 100);

      const metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.apiCalls.total).toBe(1);
      expect(metrics.apiCalls.successful).toBe(1);
      expect(metrics.apiCalls.failed).toBe(0);
    });

    it('tracks latency per endpoint', () => {
      GraphMetricsCollector.recordSuccess('/users/{user}/calendar', 100);
      GraphMetricsCollector.recordSuccess('/users/{user}/calendar', 200);

      const metrics = GraphMetricsCollector.getMetrics();
      const endpoint = metrics.apiCalls.byEndpoint['/users/{user}/calendar'];

      expect(endpoint.calls).toBe(2);
      expect(endpoint.totalLatencyMs).toBe(300);
      expect(endpoint.avgLatencyMs).toBe(150);
    });

    it('resets consecutive failures on success', () => {
      // Record some failures first
      GraphMetricsCollector.recordFailure('/test', 100, 500);
      GraphMetricsCollector.recordFailure('/test', 100, 500);

      let metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.connectionHealth.consecutiveFailures).toBe(2);

      // Record success
      GraphMetricsCollector.recordSuccess('/test', 100);

      metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.connectionHealth.consecutiveFailures).toBe(0);
    });

    it('updates lastSuccessfulCall timestamp', () => {
      const before = new Date();
      GraphMetricsCollector.recordSuccess('/test', 100);
      const after = new Date();

      const metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.connectionHealth.lastSuccessfulCall).not.toBeNull();

      const lastSuccess = metrics.connectionHealth.lastSuccessfulCall!;
      expect(lastSuccess.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastSuccess.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('recordFailure', () => {
    it('increments total and failed counts', () => {
      GraphMetricsCollector.recordFailure('/test', 100, 500);

      const metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.apiCalls.total).toBe(1);
      expect(metrics.apiCalls.successful).toBe(0);
      expect(metrics.apiCalls.failed).toBe(1);
    });

    it('tracks rate limits (429 errors)', () => {
      GraphMetricsCollector.recordFailure('/test', 100, 429);

      const metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.apiCalls.rateLimited).toBe(1);
    });

    it('does not track non-429 errors as rate limits', () => {
      GraphMetricsCollector.recordFailure('/test', 100, 500);
      GraphMetricsCollector.recordFailure('/test', 100, 403);

      const metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.apiCalls.rateLimited).toBe(0);
    });

    it('increments consecutive failures', () => {
      GraphMetricsCollector.recordFailure('/test', 100, 500);
      GraphMetricsCollector.recordFailure('/test', 100, 502);
      GraphMetricsCollector.recordFailure('/test', 100, 503);

      const metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.connectionHealth.consecutiveFailures).toBe(3);
    });

    it('updates lastFailedCall timestamp', () => {
      const before = new Date();
      GraphMetricsCollector.recordFailure('/test', 100, 500);
      const after = new Date();

      const metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.connectionHealth.lastFailedCall).not.toBeNull();

      const lastFailed = metrics.connectionHealth.lastFailedCall!;
      expect(lastFailed.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(lastFailed.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('tracks errors per endpoint', () => {
      GraphMetricsCollector.recordFailure('/test', 100, 500);
      GraphMetricsCollector.recordSuccess('/test', 100);
      GraphMetricsCollector.recordFailure('/test', 100, 502);

      const metrics = GraphMetricsCollector.getMetrics();
      const endpoint = metrics.apiCalls.byEndpoint['/test'];

      expect(endpoint.calls).toBe(3);
      expect(endpoint.successful).toBe(1);
      expect(endpoint.errors).toBe(2);
    });
  });

  describe('getMetrics', () => {
    it('returns a copy of metrics (not a reference)', () => {
      GraphMetricsCollector.recordSuccess('/test', 100);

      const metrics1 = GraphMetricsCollector.getMetrics();
      const metrics2 = GraphMetricsCollector.getMetrics();

      expect(metrics1).not.toBe(metrics2);
      expect(metrics1.apiCalls).not.toBe(metrics2.apiCalls);
    });

    it('returns initial state when no calls recorded', () => {
      const metrics = GraphMetricsCollector.getMetrics();

      expect(metrics.apiCalls.total).toBe(0);
      expect(metrics.apiCalls.successful).toBe(0);
      expect(metrics.apiCalls.failed).toBe(0);
      expect(metrics.apiCalls.rateLimited).toBe(0);
      expect(Object.keys(metrics.apiCalls.byEndpoint)).toHaveLength(0);
      expect(metrics.connectionHealth.lastSuccessfulCall).toBeNull();
      expect(metrics.connectionHealth.lastFailedCall).toBeNull();
      expect(metrics.connectionHealth.consecutiveFailures).toBe(0);
    });
  });

  describe('reset', () => {
    it('clears all metrics', () => {
      // Record some data
      GraphMetricsCollector.recordSuccess('/test', 100);
      GraphMetricsCollector.recordFailure('/test', 100, 429);

      // Reset
      GraphMetricsCollector.reset();

      const metrics = GraphMetricsCollector.getMetrics();
      expect(metrics.apiCalls.total).toBe(0);
      expect(metrics.apiCalls.successful).toBe(0);
      expect(metrics.apiCalls.failed).toBe(0);
      expect(metrics.apiCalls.rateLimited).toBe(0);
      expect(Object.keys(metrics.apiCalls.byEndpoint)).toHaveLength(0);
      expect(metrics.connectionHealth.consecutiveFailures).toBe(0);
    });
  });

  describe('multiple endpoints', () => {
    it('tracks metrics separately per endpoint', () => {
      GraphMetricsCollector.recordSuccess('/users/{user}/calendar', 100);
      GraphMetricsCollector.recordSuccess('/users/{user}/calendar', 150);
      GraphMetricsCollector.recordSuccess('/users/{user}/events', 200);
      GraphMetricsCollector.recordFailure('/users/{user}/events', 300, 500);

      const metrics = GraphMetricsCollector.getMetrics();

      expect(metrics.apiCalls.total).toBe(4);
      expect(metrics.apiCalls.successful).toBe(3);
      expect(metrics.apiCalls.failed).toBe(1);

      const calendarEndpoint = metrics.apiCalls.byEndpoint['/users/{user}/calendar'];
      expect(calendarEndpoint.calls).toBe(2);
      expect(calendarEndpoint.successful).toBe(2);
      expect(calendarEndpoint.errors).toBe(0);
      expect(calendarEndpoint.avgLatencyMs).toBe(125);

      const eventsEndpoint = metrics.apiCalls.byEndpoint['/users/{user}/events'];
      expect(eventsEndpoint.calls).toBe(2);
      expect(eventsEndpoint.successful).toBe(1);
      expect(eventsEndpoint.errors).toBe(1);
      expect(eventsEndpoint.avgLatencyMs).toBe(250);
    });
  });
});
