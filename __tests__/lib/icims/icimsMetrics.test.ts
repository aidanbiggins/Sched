/**
 * Tests for iCIMS Metrics
 */

import {
  recordIcimsSuccess,
  recordIcimsFailure,
  getIcimsMetrics,
  getIcimsMetrics24h,
  getIcimsHealthStatus,
  getIcimsFullHealthStatus,
  resetIcimsMetrics,
} from '@/lib/icims/icimsMetrics';

describe('iCIMS Metrics', () => {
  beforeEach(() => {
    resetIcimsMetrics();
  });

  describe('recordIcimsSuccess', () => {
    it('increments success count', () => {
      recordIcimsSuccess(100);
      recordIcimsSuccess(200);

      const metrics = getIcimsMetrics();

      expect(metrics.requestCount).toBe(2);
      expect(metrics.successCount).toBe(2);
      expect(metrics.failureCount).toBe(0);
    });

    it('tracks total latency', () => {
      recordIcimsSuccess(100);
      recordIcimsSuccess(200);

      const metrics = getIcimsMetrics();

      expect(metrics.totalLatencyMs).toBe(300);
    });

    it('updates lastSuccessAt', () => {
      const before = new Date();
      recordIcimsSuccess(100);
      const after = new Date();

      const metrics = getIcimsMetrics();

      expect(metrics.lastSuccessAt).not.toBeNull();
      expect(metrics.lastSuccessAt!.getTime()).toBeGreaterThanOrEqual(
        before.getTime()
      );
      expect(metrics.lastSuccessAt!.getTime()).toBeLessThanOrEqual(
        after.getTime()
      );
    });
  });

  describe('recordIcimsFailure', () => {
    it('increments failure count', () => {
      recordIcimsFailure(100, 500, 'Server error');

      const metrics = getIcimsMetrics();

      expect(metrics.requestCount).toBe(1);
      expect(metrics.successCount).toBe(0);
      expect(metrics.failureCount).toBe(1);
    });

    it('tracks rate limit hits', () => {
      recordIcimsFailure(100, 429, 'Rate limited');
      recordIcimsFailure(100, 429, 'Rate limited');

      const metrics = getIcimsMetrics();

      expect(metrics.rateLimitCount).toBe(2);
    });

    it('tracks server errors', () => {
      recordIcimsFailure(100, 500, 'Internal error');
      recordIcimsFailure(100, 503, 'Service unavailable');

      const metrics = getIcimsMetrics();

      expect(metrics.serverErrorCount).toBe(2);
    });

    it('tracks auth failures', () => {
      recordIcimsFailure(100, 401, 'Unauthorized');
      recordIcimsFailure(100, 403, 'Forbidden');

      const metrics = getIcimsMetrics();

      expect(metrics.authFailureCount).toBe(2);
    });

    it('stores last error message', () => {
      recordIcimsFailure(100, 500, 'First error');
      recordIcimsFailure(100, 503, 'Second error');

      const metrics = getIcimsMetrics();

      expect(metrics.lastError).toBe('Second error');
    });
  });

  describe('getIcimsMetrics24h', () => {
    it('returns metrics for last 24 hours', () => {
      recordIcimsSuccess(100);
      recordIcimsSuccess(200);
      recordIcimsFailure(100, 500, 'Error');

      const metrics = getIcimsMetrics24h();

      expect(metrics.totalCalls).toBe(3);
      expect(metrics.successfulCalls).toBe(2);
      expect(metrics.failedCalls).toBe(1);
    });

    it('calculates average response time', () => {
      recordIcimsSuccess(100);
      recordIcimsSuccess(300);

      const metrics = getIcimsMetrics24h();

      expect(metrics.avgResponseTimeMs).toBe(200);
    });

    it('counts rate limit hits', () => {
      recordIcimsFailure(100, 429, 'Rate limited');

      const metrics = getIcimsMetrics24h();

      expect(metrics.rateLimitHits).toBe(1);
    });

    it('returns zero averages when no calls', () => {
      const metrics = getIcimsMetrics24h();

      expect(metrics.totalCalls).toBe(0);
      expect(metrics.avgResponseTimeMs).toBe(0);
    });
  });

  describe('getIcimsHealthStatus', () => {
    it('returns healthy with no calls', () => {
      expect(getIcimsHealthStatus()).toBe('healthy');
    });

    it('returns healthy with high success rate', () => {
      for (let i = 0; i < 100; i++) {
        recordIcimsSuccess(100);
      }

      expect(getIcimsHealthStatus()).toBe('healthy');
    });

    it('returns degraded with moderate success rate', () => {
      // 90% success rate
      for (let i = 0; i < 90; i++) {
        recordIcimsSuccess(100);
      }
      for (let i = 0; i < 10; i++) {
        recordIcimsFailure(100, 500, 'Error');
      }

      expect(getIcimsHealthStatus()).toBe('degraded');
    });

    it('returns down with low success rate', () => {
      // 70% success rate
      for (let i = 0; i < 70; i++) {
        recordIcimsSuccess(100);
      }
      for (let i = 0; i < 30; i++) {
        recordIcimsFailure(100, 500, 'Error');
      }

      expect(getIcimsHealthStatus()).toBe('down');
    });

    it('returns down with recent auth failures', () => {
      recordIcimsFailure(100, 401, 'Unauthorized');

      expect(getIcimsHealthStatus()).toBe('down');
    });
  });

  describe('getIcimsFullHealthStatus', () => {
    it('returns full health status object', () => {
      recordIcimsSuccess(100);

      const status = getIcimsFullHealthStatus(
        { mode: 'real', baseUrl: 'https://api.icims.com', hasApiKey: true },
        { pending: 5, processing: 1, completedLast24h: 100, failedLast24h: 2 }
      );

      expect(status.status).toBe('healthy');
      expect(status.config.mode).toBe('real');
      expect(status.config.baseUrl).toBe('https://api.icims.com');
      expect(status.config.hasApiKey).toBe(true);
      expect(status.metricsLast24h.totalCalls).toBe(1);
      expect(status.lastSuccessfulCall).not.toBeNull();
    });

    it('includes last error details', () => {
      recordIcimsFailure(100, 500, 'Test error');

      const status = getIcimsFullHealthStatus(
        { mode: 'mock', baseUrl: '', hasApiKey: false },
        { pending: 0, processing: 0, completedLast24h: 0, failedLast24h: 1 }
      );

      expect(status.lastError).toBe('Test error');
      expect(status.lastFailedCall).not.toBeNull();
    });
  });
});
