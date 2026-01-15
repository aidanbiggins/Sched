/**
 * Unit tests for GraphTokenManager
 *
 * Tests token acquisition, caching, single-flight locking, and metrics.
 */

import { GraphTokenManager, GraphTokenError } from '@/lib/graph/GraphTokenManager';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GraphTokenManager', () => {
  let tokenManager: GraphTokenManager;

  const testConfig = {
    tenantId: '00000000-0000-0000-0000-000000000001',
    clientId: '00000000-0000-0000-0000-000000000002',
    clientSecret: 'test-secret-12345',
    tokenEndpoint: 'https://test.example.com/oauth2/token',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tokenManager = new GraphTokenManager(testConfig);
  });

  describe('getToken', () => {
    it('fetches a new token when cache is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token-123',
          expires_in: 3600,
        }),
      });

      const token = await tokenManager.getToken();

      expect(token).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        testConfig.tokenEndpoint,
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
      );
    });

    it('returns cached token on subsequent calls', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token-123',
          expires_in: 3600,
        }),
      });

      // First call
      const token1 = await tokenManager.getToken();
      // Second call
      const token2 = await tokenManager.getToken();

      expect(token1).toBe('test-token-123');
      expect(token2).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch
    });

    it('refreshes token when within early refresh window', async () => {
      // First token with 4 minutes expiry (within 5 minute early refresh window)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token-1',
          expires_in: 240, // 4 minutes - less than 5 minute buffer
        }),
      });

      // Second token when refresh is triggered
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'token-2',
          expires_in: 3600,
        }),
      });

      const token1 = await tokenManager.getToken();
      expect(token1).toBe('token-1');

      // Should trigger refresh because 4 min < 5 min buffer
      const token2 = await tokenManager.getToken();
      expect(token2).toBe('token-2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('implements single-flight locking for concurrent requests', async () => {
      let resolveToken: (value: unknown) => void;
      const tokenPromise = new Promise((resolve) => {
        resolveToken = resolve;
      });

      mockFetch.mockImplementationOnce(async () => {
        await tokenPromise;
        return {
          ok: true,
          json: async () => ({
            access_token: 'shared-token',
            expires_in: 3600,
          }),
        };
      });

      // Start multiple concurrent requests
      const request1 = tokenManager.getToken();
      const request2 = tokenManager.getToken();
      const request3 = tokenManager.getToken();

      // Resolve the token fetch
      resolveToken!(null);

      const [token1, token2, token3] = await Promise.all([request1, request2, request3]);

      // All should get the same token
      expect(token1).toBe('shared-token');
      expect(token2).toBe('shared-token');
      expect(token3).toBe('shared-token');

      // Only one fetch should have been made
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('throws GraphTokenError on HTTP error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid client credentials',
      });

      try {
        await tokenManager.getToken();
        fail('Expected GraphTokenError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(GraphTokenError);
        expect((error as GraphTokenError).status).toBe(401);
      }
    });

    it('throws GraphTokenError on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

      await expect(tokenManager.getToken()).rejects.toThrow(GraphTokenError);
    });

    it('sends correct request body', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
        }),
      });

      await tokenManager.getToken();

      const [, options] = mockFetch.mock.calls[0];
      const body = new URLSearchParams(options.body);

      expect(body.get('grant_type')).toBe('client_credentials');
      expect(body.get('client_id')).toBe(testConfig.clientId);
      expect(body.get('client_secret')).toBe(testConfig.clientSecret);
      expect(body.get('scope')).toBe('https://graph.microsoft.com/.default');
    });
  });

  describe('clearToken', () => {
    it('clears cached token', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
        }),
      });

      // Get a token first
      await tokenManager.getToken();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Clear and get again
      tokenManager.clearToken();
      await tokenManager.getToken();

      // Should have fetched twice
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getTokenStatus', () => {
    it('returns invalid status when no token cached', () => {
      const status = tokenManager.getTokenStatus();

      expect(status.valid).toBe(false);
      expect(status.expiresAt).toBeNull();
      expect(status.expiresInSeconds).toBeNull();
    });

    it('returns valid status with expiry info when token cached', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
        }),
      });

      await tokenManager.getToken();
      const status = tokenManager.getTokenStatus();

      expect(status.valid).toBe(true);
      expect(status.expiresAt).toBeInstanceOf(Date);
      expect(status.expiresInSeconds).toBeGreaterThan(3500);
      expect(status.expiresInSeconds).toBeLessThanOrEqual(3600);
    });
  });

  describe('getMetrics', () => {
    it('tracks successful token refreshes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
        }),
      });

      tokenManager.resetMetrics();
      await tokenManager.getToken();
      const metrics = tokenManager.getMetrics();

      expect(metrics.tokenRefreshes).toBe(1);
      expect(metrics.tokenFailures).toBe(0);
      expect(metrics.lastRefreshAt).toBeInstanceOf(Date);
      expect(metrics.lastError).toBeNull();
    });

    it('tracks failed token refreshes', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid credentials',
      });

      tokenManager.resetMetrics();

      try {
        await tokenManager.getToken();
      } catch {
        // Expected to fail
      }

      const metrics = tokenManager.getMetrics();

      expect(metrics.tokenRefreshes).toBe(0);
      expect(metrics.tokenFailures).toBe(1);
      expect(metrics.lastFailureAt).toBeInstanceOf(Date);
      expect(metrics.lastError).toContain('Token refresh failed');
    });
  });

  describe('token endpoint', () => {
    it('uses default Azure AD endpoint when not overridden', async () => {
      const managerWithoutOverride = new GraphTokenManager({
        tenantId: '11111111-1111-1111-1111-111111111111',
        clientId: '22222222-2222-2222-2222-222222222222',
        clientSecret: 'secret',
        // No tokenEndpoint override
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'test-token',
          expires_in: 3600,
        }),
      });

      await managerWithoutOverride.getToken();

      expect(mockFetch).toHaveBeenCalledWith(
        'https://login.microsoftonline.com/11111111-1111-1111-1111-111111111111/oauth2/v2.0/token',
        expect.anything()
      );
    });
  });
});
