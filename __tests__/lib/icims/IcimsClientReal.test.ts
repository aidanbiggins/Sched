/**
 * Tests for IcimsClientReal
 *
 * Uses fetch mocking to simulate iCIMS API responses.
 */

import { IcimsClientReal } from '@/lib/icims/IcimsClientReal';
import {
  IcimsAuthError,
  IcimsNotFoundError,
  IcimsServerError,
  IcimsRateLimitError,
} from '@/lib/icims/icimsErrors';
import { resetIcimsMetrics } from '@/lib/icims/icimsMetrics';
import type { IcimsConfig } from '@/lib/icims/icimsConfig';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('IcimsClientReal', () => {
  const config: IcimsConfig = {
    mode: 'real',
    baseUrl: 'https://api.icims.com',
    apiKey: 'test-api-key',
  };

  let client: IcimsClientReal;

  beforeEach(() => {
    mockFetch.mockReset();
    resetIcimsMetrics();
    client = new IcimsClientReal(config);
  });

  describe('getApplication', () => {
    it('returns application details on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              id: 'APP-123',
              candidateName: 'John Doe',
              candidateEmail: 'john@example.com',
              requisitionId: 'REQ-456',
              requisitionTitle: 'Software Engineer',
              status: 'Interview',
            })
          ),
        headers: new Map(),
      });

      const result = await client.getApplication('APP-123');

      expect(result.id).toBe('APP-123');
      expect(result.candidateName).toBe('John Doe');
      expect(result.candidateEmail).toBe('john@example.com');
      expect(result.requisitionId).toBe('REQ-456');
    });

    it('handles nested response format', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              id: 'APP-123',
              candidate: {
                name: 'Jane Smith',
                email: 'jane@example.com',
              },
              requisition: {
                id: 'REQ-789',
                title: 'Product Manager',
              },
              status: 'Active',
            })
          ),
        headers: new Map(),
      });

      const result = await client.getApplication('APP-123');

      expect(result.candidateName).toBe('Jane Smith');
      expect(result.candidateEmail).toBe('jane@example.com');
      expect(result.requisitionId).toBe('REQ-789');
      expect(result.requisitionTitle).toBe('Product Manager');
    });

    it('throws IcimsNotFoundError for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
        headers: new Map(),
      });

      await expect(client.getApplication('APP-INVALID')).rejects.toThrow(
        IcimsNotFoundError
      );
    });

    it('throws IcimsAuthError for 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
        headers: new Map(),
      });

      await expect(client.getApplication('APP-123')).rejects.toThrow(
        IcimsAuthError
      );
    });

    it('throws IcimsAuthError for 403', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        text: () => Promise.resolve('Forbidden'),
        headers: new Map(),
      });

      await expect(client.getApplication('APP-123')).rejects.toThrow(
        IcimsAuthError
      );
    });
  });

  describe('addApplicationNote', () => {
    it('creates note successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              id: 'NOTE-123',
              content: 'Interview scheduled',
              createdAt: '2026-01-15T10:00:00Z',
            })
          ),
        headers: new Map(),
      });

      await expect(
        client.addApplicationNote('APP-123', 'Interview scheduled')
      ).resolves.not.toThrow();
    });

    it('includes idempotency key in request', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () => Promise.resolve('{}'),
        headers: new Map(),
      });

      await client.addApplicationNote('APP-123', 'Test note');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Idempotency-Key': expect.stringMatching(/^sched-APP-123-/),
          }),
        })
      );
    });

    it('includes API key in headers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () => Promise.resolve('{}'),
        headers: new Map(),
      });

      await client.addApplicationNote('APP-123', 'Test note');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        })
      );
    });

    it('sends correct request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () => Promise.resolve('{}'),
        headers: new Map(),
      });

      await client.addApplicationNote('APP-123', 'My note content');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('My note content'),
        })
      );
    });
  });

  describe('retry behavior', () => {
    it('retries on 500 error', async () => {
      // First call fails with 500
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
        headers: new Map(),
      });
      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              id: 'APP-123',
              candidateName: 'Test',
              candidateEmail: 'test@example.com',
              requisitionId: 'REQ-1',
              requisitionTitle: 'Role',
              status: 'Active',
            })
          ),
        headers: new Map(),
      });

      const result = await client.getApplication('APP-123');

      expect(result.id).toBe('APP-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries on 503 error', async () => {
      // First call fails with 503
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve('Service unavailable'),
        headers: new Map(),
      });
      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: () => Promise.resolve('{}'),
        headers: new Map(),
      });

      await client.addApplicationNote('APP-123', 'Test');

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry on 401 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
        headers: new Map(),
      });

      await expect(client.getApplication('APP-123')).rejects.toThrow(
        IcimsAuthError
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry on 404 error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not found'),
        headers: new Map(),
      });

      await expect(client.getApplication('APP-123')).rejects.toThrow(
        IcimsNotFoundError
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('respects max retries', async () => {
      // All calls fail with 500
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Server error'),
        headers: new Map(),
      });

      await expect(client.getApplication('APP-123')).rejects.toThrow(
        IcimsServerError
      );

      // Initial + 3 retries = 4 calls
      expect(mockFetch).toHaveBeenCalledTimes(4);
    }, 30000); // Increase timeout due to retry delays
  });

  describe('rate limiting', () => {
    it('handles 429 with Retry-After header', async () => {
      const headersMap = new Map([['retry-after', '1']]);
      // First call rate limited
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        text: () => Promise.resolve('Rate limited'),
        headers: {
          get: (key: string) => headersMap.get(key.toLowerCase()) ?? null,
          forEach: (cb: (value: string, key: string) => void) =>
            headersMap.forEach(cb),
        },
      });
      // Second call succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              id: 'APP-123',
              candidateName: 'Test',
              candidateEmail: 'test@example.com',
              requisitionId: 'REQ-1',
              requisitionTitle: 'Role',
              status: 'Active',
            })
          ),
        headers: new Map(),
      });

      const result = await client.getApplication('APP-123');

      expect(result.id).toBe('APP-123');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    }, 10000);
  });
});
