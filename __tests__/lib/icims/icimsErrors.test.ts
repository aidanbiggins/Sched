/**
 * Tests for iCIMS Error Types
 */

import {
  IcimsError,
  IcimsRateLimitError,
  IcimsAuthError,
  IcimsNotFoundError,
  IcimsBadRequestError,
  IcimsServerError,
  IcimsNetworkError,
  classifyIcimsError,
  isRetryableIcimsError,
  isIcimsAuthFailure,
  getRetryAfterMs,
} from '@/lib/icims/icimsErrors';

describe('iCIMS Errors', () => {
  describe('Error classes', () => {
    it('IcimsError has correct properties', () => {
      const error = new IcimsError('Test error', 500, true);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(500);
      expect(error.isRetryable).toBe(true);
      expect(error.name).toBe('IcimsError');
    });

    it('IcimsRateLimitError is retryable', () => {
      const error = new IcimsRateLimitError('Rate limited', 30000);

      expect(error.statusCode).toBe(429);
      expect(error.isRetryable).toBe(true);
      expect(error.retryAfterMs).toBe(30000);
      expect(error.name).toBe('IcimsRateLimitError');
    });

    it('IcimsAuthError is not retryable', () => {
      const error = new IcimsAuthError('Unauthorized', 401);

      expect(error.statusCode).toBe(401);
      expect(error.isRetryable).toBe(false);
      expect(error.name).toBe('IcimsAuthError');
    });

    it('IcimsNotFoundError has resource info', () => {
      const error = new IcimsNotFoundError('application', 'APP-123');

      expect(error.statusCode).toBe(404);
      expect(error.isRetryable).toBe(false);
      expect(error.resourceType).toBe('application');
      expect(error.resourceId).toBe('APP-123');
    });

    it('IcimsServerError is retryable', () => {
      const error = new IcimsServerError('Server error', 503);

      expect(error.statusCode).toBe(503);
      expect(error.isRetryable).toBe(true);
    });

    it('IcimsNetworkError is retryable', () => {
      const error = new IcimsNetworkError('Connection refused');

      expect(error.statusCode).toBeUndefined();
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('classifyIcimsError', () => {
    it('classifies 400 as bad request', () => {
      const error = classifyIcimsError(400, '{"message": "Invalid data"}');

      expect(error).toBeInstanceOf(IcimsBadRequestError);
      expect(error.message).toBe('Invalid data');
      expect(error.isRetryable).toBe(false);
    });

    it('classifies 401 as auth error', () => {
      const error = classifyIcimsError(401);

      expect(error).toBeInstanceOf(IcimsAuthError);
      expect(error.statusCode).toBe(401);
      expect(error.isRetryable).toBe(false);
    });

    it('classifies 403 as auth error', () => {
      const error = classifyIcimsError(403);

      expect(error).toBeInstanceOf(IcimsAuthError);
      expect(error.statusCode).toBe(403);
    });

    it('classifies 404 as not found', () => {
      const error = classifyIcimsError(404);

      expect(error).toBeInstanceOf(IcimsNotFoundError);
      expect(error.isRetryable).toBe(false);
    });

    it('classifies 429 as rate limit error', () => {
      const error = classifyIcimsError(429, '', '60');

      expect(error).toBeInstanceOf(IcimsRateLimitError);
      expect((error as IcimsRateLimitError).retryAfterMs).toBe(60000);
    });

    it('uses default retry time if Retry-After header missing', () => {
      const error = classifyIcimsError(429);

      expect(error).toBeInstanceOf(IcimsRateLimitError);
      expect((error as IcimsRateLimitError).retryAfterMs).toBe(60000);
    });

    it('classifies 500 as server error', () => {
      const error = classifyIcimsError(500);

      expect(error).toBeInstanceOf(IcimsServerError);
      expect(error.isRetryable).toBe(true);
    });

    it('classifies 502 as server error', () => {
      const error = classifyIcimsError(502);

      expect(error).toBeInstanceOf(IcimsServerError);
      expect(error.statusCode).toBe(502);
    });

    it('classifies 503 as server error', () => {
      const error = classifyIcimsError(503);

      expect(error).toBeInstanceOf(IcimsServerError);
      expect(error.statusCode).toBe(503);
    });

    it('classifies 504 as server error', () => {
      const error = classifyIcimsError(504);

      expect(error).toBeInstanceOf(IcimsServerError);
      expect(error.statusCode).toBe(504);
    });

    it('parses error message from JSON response', () => {
      const error = classifyIcimsError(
        400,
        '{"error": "Application ID is required"}'
      );

      expect(error.message).toBe('Application ID is required');
    });

    it('uses raw body if not valid JSON', () => {
      const error = classifyIcimsError(400, 'Plain text error');

      expect(error.message).toBe('Plain text error');
    });
  });

  describe('isRetryableIcimsError', () => {
    it('returns true for IcimsServerError', () => {
      expect(isRetryableIcimsError(new IcimsServerError('error'))).toBe(true);
    });

    it('returns true for IcimsRateLimitError', () => {
      expect(isRetryableIcimsError(new IcimsRateLimitError('error'))).toBe(true);
    });

    it('returns true for IcimsNetworkError', () => {
      expect(isRetryableIcimsError(new IcimsNetworkError('error'))).toBe(true);
    });

    it('returns false for IcimsAuthError', () => {
      expect(isRetryableIcimsError(new IcimsAuthError('error'))).toBe(false);
    });

    it('returns false for IcimsNotFoundError', () => {
      expect(isRetryableIcimsError(new IcimsNotFoundError('app', 'id'))).toBe(
        false
      );
    });

    it('returns true for network-related generic errors', () => {
      expect(isRetryableIcimsError(new Error('Network timeout'))).toBe(true);
      expect(isRetryableIcimsError(new Error('ECONNREFUSED'))).toBe(true);
      expect(isRetryableIcimsError(new Error('socket hang up'))).toBe(true);
    });

    it('returns false for non-network generic errors', () => {
      expect(isRetryableIcimsError(new Error('Something failed'))).toBe(false);
    });
  });

  describe('isIcimsAuthFailure', () => {
    it('returns true for IcimsAuthError', () => {
      expect(isIcimsAuthFailure(new IcimsAuthError('error'))).toBe(true);
    });

    it('returns false for other error types', () => {
      expect(isIcimsAuthFailure(new IcimsServerError('error'))).toBe(false);
      expect(isIcimsAuthFailure(new Error('error'))).toBe(false);
    });
  });

  describe('getRetryAfterMs', () => {
    it('returns retry time from IcimsRateLimitError', () => {
      const error = new IcimsRateLimitError('error', 45000);

      expect(getRetryAfterMs(error)).toBe(45000);
    });

    it('returns null for other error types', () => {
      expect(getRetryAfterMs(new IcimsServerError('error'))).toBeNull();
      expect(getRetryAfterMs(new Error('error'))).toBeNull();
    });
  });
});
