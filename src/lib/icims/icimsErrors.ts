/**
 * iCIMS Error Types
 *
 * Typed errors for iCIMS API operations.
 * Supports classification for retry logic.
 */

/**
 * Base iCIMS error
 */
export class IcimsError extends Error {
  readonly statusCode?: number;
  readonly isRetryable: boolean;

  constructor(message: string, statusCode?: number, isRetryable = false) {
    super(message);
    this.name = 'IcimsError';
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
  }
}

/**
 * Rate limit error (429)
 */
export class IcimsRateLimitError extends IcimsError {
  readonly retryAfterMs: number;

  constructor(message: string, retryAfterMs: number = 60000) {
    super(message, 429, true);
    this.name = 'IcimsRateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Authentication error (401/403)
 */
export class IcimsAuthError extends IcimsError {
  constructor(message: string, statusCode: 401 | 403 = 401) {
    super(message, statusCode, false);
    this.name = 'IcimsAuthError';
  }
}

/**
 * Resource not found error (404)
 */
export class IcimsNotFoundError extends IcimsError {
  readonly resourceType: string;
  readonly resourceId: string;

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} not found: ${resourceId}`, 404, false);
    this.name = 'IcimsNotFoundError';
    this.resourceType = resourceType;
    this.resourceId = resourceId;
  }
}

/**
 * Bad request error (400)
 */
export class IcimsBadRequestError extends IcimsError {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 400, false);
    this.name = 'IcimsBadRequestError';
    this.details = details;
  }
}

/**
 * Server error (5xx) - retryable
 */
export class IcimsServerError extends IcimsError {
  constructor(message: string, statusCode: number = 500) {
    super(message, statusCode, true);
    this.name = 'IcimsServerError';
  }
}

/**
 * Network/connection error - retryable
 */
export class IcimsNetworkError extends IcimsError {
  constructor(message: string) {
    super(message, undefined, true);
    this.name = 'IcimsNetworkError';
  }
}

/**
 * Classify an error from HTTP response
 */
export function classifyIcimsError(
  statusCode: number,
  responseBody?: string,
  retryAfterHeader?: string
): IcimsError {
  // Parse error message from response body if available
  let message = `iCIMS API error: ${statusCode}`;
  let details: Record<string, unknown> | undefined;

  if (responseBody) {
    try {
      const parsed = JSON.parse(responseBody);
      if (parsed.message) message = parsed.message;
      if (parsed.error) message = parsed.error;
      details = parsed;
    } catch {
      // Use raw body as message if not JSON
      if (responseBody.length < 200) {
        message = responseBody;
      }
    }
  }

  switch (statusCode) {
    case 400:
      return new IcimsBadRequestError(message, details);

    case 401:
      return new IcimsAuthError('Unauthorized: Invalid or expired API key', 401);

    case 403:
      return new IcimsAuthError('Forbidden: Insufficient permissions', 403);

    case 404:
      return new IcimsNotFoundError('resource', 'unknown');

    case 429: {
      // Parse Retry-After header (seconds)
      let retryAfterMs = 60000; // Default 1 minute
      if (retryAfterHeader) {
        const seconds = parseInt(retryAfterHeader, 10);
        if (!isNaN(seconds) && seconds > 0) {
          retryAfterMs = seconds * 1000;
        }
      }
      return new IcimsRateLimitError(message, retryAfterMs);
    }

    case 500:
    case 502:
    case 503:
    case 504:
      return new IcimsServerError(message, statusCode);

    default:
      // Unknown status code
      if (statusCode >= 500) {
        return new IcimsServerError(message, statusCode);
      }
      return new IcimsError(message, statusCode, false);
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableIcimsError(error: unknown): boolean {
  if (error instanceof IcimsError) {
    return error.isRetryable;
  }
  // Network errors are generally retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('econnreset') ||
      message.includes('socket')
    );
  }
  return false;
}

/**
 * Check if error is an auth failure (should stop retries)
 */
export function isIcimsAuthFailure(error: unknown): boolean {
  return error instanceof IcimsAuthError;
}

/**
 * Extract retry-after milliseconds from error
 */
export function getRetryAfterMs(error: unknown): number | null {
  if (error instanceof IcimsRateLimitError) {
    return error.retryAfterMs;
  }
  return null;
}
