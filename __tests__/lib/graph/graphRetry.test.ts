/**
 * Unit tests for graphRetry module
 *
 * Tests retry logic, rate limiting, exponential backoff, and error handling.
 */

import {
  withGraphRetry,
  graphFetch,
  GraphApiError,
  parseRetryAfter,
  isTransientError,
  getGraphRetryMetrics,
  resetGraphRetryMetrics,
} from '@/lib/graph/graphRetry';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Speed up tests by reducing timeouts
jest.useFakeTimers();

describe('parseRetryAfter', () => {
  it('returns null for null input', () => {
    expect(parseRetryAfter(null)).toBeNull();
  });

  it('parses integer seconds', () => {
    expect(parseRetryAfter('30')).toBe(30000); // 30 seconds in ms
    expect(parseRetryAfter('120')).toBe(120000); // 120 seconds in ms
  });

  it('parses HTTP date format', () => {
    const futureDate = new Date(Date.now() + 60000); // 1 minute from now
    const httpDate = futureDate.toUTCString();

    const result = parseRetryAfter(httpDate);

    // Should be approximately 60000ms (within some tolerance for execution time)
    expect(result).toBeGreaterThan(55000);
    expect(result).toBeLessThanOrEqual(60000);
  });

  it('returns 0 for past HTTP date', () => {
    const pastDate = new Date(Date.now() - 60000); // 1 minute ago
    const httpDate = pastDate.toUTCString();

    expect(parseRetryAfter(httpDate)).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(parseRetryAfter('not-a-number-or-date')).toBeNull();
  });
});

describe('isTransientError', () => {
  it('returns true for 429', () => {
    expect(isTransientError(429)).toBe(true);
  });

  it('returns true for 5xx errors', () => {
    expect(isTransientError(500)).toBe(true);
    expect(isTransientError(502)).toBe(true);
    expect(isTransientError(503)).toBe(true);
    expect(isTransientError(504)).toBe(true);
  });

  it('returns false for 4xx errors (except 429)', () => {
    expect(isTransientError(400)).toBe(false);
    expect(isTransientError(401)).toBe(false);
    expect(isTransientError(403)).toBe(false);
    expect(isTransientError(404)).toBe(false);
  });

  it('returns false for 2xx status codes', () => {
    expect(isTransientError(200)).toBe(false);
    expect(isTransientError(201)).toBe(false);
    expect(isTransientError(204)).toBe(false);
  });
});

describe('GraphApiError', () => {
  it('sets isTransient true for 429', () => {
    const error = new GraphApiError('Rate limited', 429, '30');
    expect(error.isTransient).toBe(true);
    expect(error.status).toBe(429);
    expect(error.retryAfter).toBe('30');
  });

  it('sets isTransient true for 503', () => {
    const error = new GraphApiError('Service unavailable', 503);
    expect(error.isTransient).toBe(true);
  });

  it('sets isTransient false for 400', () => {
    const error = new GraphApiError('Bad request', 400);
    expect(error.isTransient).toBe(false);
  });

  it('has correct error name', () => {
    const error = new GraphApiError('Test', 500);
    expect(error.name).toBe('GraphApiError');
  });
});

describe('graphFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: 'test' }),
    });

    const result = await graphFetch<{ data: string }>('https://graph.microsoft.com/test', {
      method: 'GET',
    });

    expect(result).toEqual({ data: 'test' });
  });

  it('returns undefined for 204 No Content', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
    });

    const result = await graphFetch('https://graph.microsoft.com/test', {
      method: 'DELETE',
    });

    expect(result).toBeUndefined();
  });

  it('throws GraphApiError on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Invalid request' } }),
      headers: new Headers(),
    });

    await expect(
      graphFetch('https://graph.microsoft.com/test', { method: 'GET' })
    ).rejects.toThrow(GraphApiError);
  });

  it('includes Retry-After header in error for 429', async () => {
    const headers = new Headers();
    headers.set('Retry-After', '60');

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Too many requests' } }),
      headers,
    });

    try {
      await graphFetch('https://graph.microsoft.com/test', { method: 'GET' });
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(GraphApiError);
      expect((error as GraphApiError).retryAfter).toBe('60');
    }
  });

  it('handles non-JSON error response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('Not JSON');
      },
      text: async () => 'Internal Server Error',
      headers: new Headers(),
    });

    await expect(
      graphFetch('https://graph.microsoft.com/test', { method: 'GET' })
    ).rejects.toThrow('Internal Server Error');
  });
});

describe('withGraphRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetGraphRetryMetrics();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.useFakeTimers();
  });

  it('returns result on first success', async () => {
    const operation = jest.fn().mockResolvedValueOnce('success');

    const result = await withGraphRetry(operation, { operation: 'test' });

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on transient error and succeeds', async () => {
    jest.useRealTimers();

    const operation = jest
      .fn()
      .mockRejectedValueOnce(new GraphApiError('Service unavailable', 503))
      .mockResolvedValueOnce('success');

    const result = await withGraphRetry(
      operation,
      { operation: 'test' },
      { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 }
    );

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-transient errors', async () => {
    const operation = jest.fn().mockRejectedValueOnce(new GraphApiError('Bad request', 400));

    await expect(
      withGraphRetry(operation, { operation: 'test' })
    ).rejects.toThrow(GraphApiError);

    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('throws after max retries exhausted', async () => {
    jest.useRealTimers();

    const operation = jest.fn().mockRejectedValue(new GraphApiError('Service unavailable', 503));

    await expect(
      withGraphRetry(
        operation,
        { operation: 'test' },
        { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 50 }
      )
    ).rejects.toThrow(GraphApiError);

    // Initial attempt + 2 retries = 3 calls
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('tracks metrics for successful calls', async () => {
    const operation = jest.fn().mockResolvedValueOnce('success');

    await withGraphRetry(operation, { operation: 'test' });

    const metrics = getGraphRetryMetrics();
    expect(metrics.totalCalls).toBe(1);
    expect(metrics.successfulCalls).toBe(1);
    expect(metrics.lastSuccessfulCall).toBeInstanceOf(Date);
  });

  it('tracks metrics for rate limited calls', async () => {
    jest.useRealTimers();

    const operation = jest
      .fn()
      .mockRejectedValueOnce(new GraphApiError('Rate limited', 429, '1'))
      .mockResolvedValueOnce('success');

    await withGraphRetry(
      operation,
      { operation: 'test' },
      { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 }
    );

    const metrics = getGraphRetryMetrics();
    expect(metrics.rateLimited).toBe(1);
  });

  it('tracks metrics for transient errors', async () => {
    jest.useRealTimers();

    const operation = jest
      .fn()
      .mockRejectedValueOnce(new GraphApiError('Service unavailable', 503))
      .mockResolvedValueOnce('success');

    await withGraphRetry(
      operation,
      { operation: 'test' },
      { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 50 }
    );

    const metrics = getGraphRetryMetrics();
    expect(metrics.transientErrors).toBe(1);
  });
});

describe('getGraphRetryMetrics / resetGraphRetryMetrics', () => {
  it('resets all metrics', async () => {
    // Generate some metrics
    const operation = jest.fn().mockResolvedValueOnce('success');
    await withGraphRetry(operation, { operation: 'test' });

    // Verify metrics exist
    expect(getGraphRetryMetrics().totalCalls).toBeGreaterThan(0);

    // Reset
    resetGraphRetryMetrics();

    // Verify reset
    const metrics = getGraphRetryMetrics();
    expect(metrics.totalCalls).toBe(0);
    expect(metrics.successfulCalls).toBe(0);
    expect(metrics.rateLimited).toBe(0);
    expect(metrics.transientErrors).toBe(0);
    expect(metrics.lastSuccessfulCall).toBeNull();
    expect(metrics.lastError).toBeNull();
  });
});
