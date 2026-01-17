/**
 * Graph API Retry Logic
 *
 * Handles transient errors and rate limiting for Microsoft Graph API calls.
 *
 * Features:
 * - 429 rate limiting with Retry-After header parsing
 * - Exponential backoff with jitter for 5xx errors
 * - Configurable retry limits
 * - Metrics tracking for ops dashboard
 */

import { GraphMetricsCollector } from './GraphMetricsCollector';

export interface GraphRetryConfig {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface GraphRetryMetrics {
  totalCalls: number;
  successfulCalls: number;
  rateLimited: number;
  transientErrors: number;
  lastSuccessfulCall: Date | null;
  lastError: { message: string; status: number; timestamp: Date } | null;
}

export interface GraphRetryContext {
  operation: string;
  entityId?: string;
}

// Default configuration
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30000;

// Singleton metrics tracker
const metrics: GraphRetryMetrics = {
  totalCalls: 0,
  successfulCalls: 0,
  rateLimited: 0,
  transientErrors: 0,
  lastSuccessfulCall: null,
  lastError: null,
};

/**
 * Get current retry metrics for ops dashboard
 */
export function getGraphRetryMetrics(): GraphRetryMetrics {
  return { ...metrics };
}

/**
 * Reset metrics (for testing)
 */
export function resetGraphRetryMetrics(): void {
  metrics.totalCalls = 0;
  metrics.successfulCalls = 0;
  metrics.rateLimited = 0;
  metrics.transientErrors = 0;
  metrics.lastSuccessfulCall = null;
  metrics.lastError = null;
}

/**
 * Parse Retry-After header value
 * Supports both seconds (integer) and HTTP date formats
 */
export function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  // Try parsing as seconds
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;

  // Try parsing as HTTP date
  const date = Date.parse(header);
  if (!isNaN(date)) return Math.max(0, date - Date.now());

  return null;
}

/**
 * Calculate delay for retry attempt
 */
function calculateDelay(
  attempt: number,
  retryAfterMs: number | null,
  baseDelayMs: number,
  maxDelayMs: number
): number {
  if (retryAfterMs !== null) {
    // Use server-specified delay with small jitter (0-500ms)
    return retryAfterMs + Math.random() * 500;
  }

  // Exponential backoff with jitter
  const exponentialDelay = Math.min(
    baseDelayMs * Math.pow(2, attempt - 1),
    maxDelayMs
  );
  // Apply jitter: 50-100% of calculated delay
  const jitter = exponentialDelay * (0.5 + Math.random() * 0.5);
  return Math.floor(jitter);
}

/**
 * Check if HTTP status code indicates a transient error
 */
export function isTransientError(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Graph API error with status and transient flag
 */
export class GraphApiError extends Error {
  public readonly isTransient: boolean;

  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfter?: string
  ) {
    super(message);
    this.name = 'GraphApiError';
    this.isTransient = isTransientError(status);
  }
}

/**
 * Execute a Graph API operation with retry logic
 *
 * @param operation - Async function that makes the Graph API call
 * @param context - Context for logging (operation name, entity ID)
 * @param config - Retry configuration overrides
 */
export async function withGraphRetry<T>(
  operation: () => Promise<T>,
  context: GraphRetryContext,
  config?: GraphRetryConfig
): Promise<T> {
  const maxRetries = config?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = config?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = config?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  metrics.totalCalls++;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = await operation();
      metrics.successfulCalls++;
      metrics.lastSuccessfulCall = new Date();
      return result;
    } catch (error) {
      const graphError = error as GraphApiError;
      const status = graphError.status ?? 0;

      // Track metrics
      if (status === 429) {
        metrics.rateLimited++;
      } else if (isTransientError(status)) {
        metrics.transientErrors++;
      }

      // Record error
      metrics.lastError = {
        message: graphError.message,
        status,
        timestamp: new Date(),
      };

      // Log the error
      const contextStr = context.entityId
        ? `${context.operation}(${context.entityId})`
        : context.operation;
      console.error(`[Graph] ${contextStr} failed (attempt ${attempt}/${maxRetries + 1}): ${graphError.message}`);

      // Don't retry non-transient errors or if max retries exceeded
      if (!graphError.isTransient || attempt > maxRetries) {
        throw error;
      }

      // Calculate delay
      const retryAfterMs = status === 429 ? parseRetryAfter(graphError.retryAfter ?? null) : null;
      const delay = calculateDelay(attempt, retryAfterMs, baseDelayMs, maxDelayMs);

      console.log(`[Graph] Retrying ${contextStr} in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw new Error('Unexpected: retry loop completed without return or throw');
}

/**
 * Extract endpoint name from URL for metrics
 */
function extractEndpoint(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove query params and normalize path
    // e.g., /v1.0/users/user@example.com/calendar -> /users/{user}/calendar
    const path = urlObj.pathname
      .replace(/\/v1\.0|\/beta/, '') // Remove API version
      .replace(/\/[a-f0-9-]{36}/gi, '/{id}') // Replace UUIDs
      .replace(/\/[^/]+@[^/]+/g, '/{user}'); // Replace emails
    return path || '/';
  } catch {
    return url.slice(0, 50);
  }
}

/**
 * Make a Graph API request and handle errors
 *
 * @param url - Graph API URL
 * @param options - Fetch options
 * @returns Response data
 * @throws GraphApiError on HTTP errors
 */
export async function graphFetch<T>(
  url: string,
  options: RequestInit
): Promise<T> {
  const endpoint = extractEndpoint(url);
  const startTime = Date.now();

  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    GraphMetricsCollector.recordFailure(endpoint, latencyMs, 0);
    throw error;
  }

  const latencyMs = Date.now() - startTime;

  if (!response.ok) {
    GraphMetricsCollector.recordFailure(endpoint, latencyMs, response.status);

    let errorMessage: string;
    try {
      const errorBody = await response.json();
      errorMessage = errorBody.error?.message || JSON.stringify(errorBody);
    } catch {
      errorMessage = await response.text() || response.statusText;
    }

    throw new GraphApiError(
      `Graph API error: ${response.status} ${errorMessage}`,
      response.status,
      response.headers.get('Retry-After') ?? undefined
    );
  }

  GraphMetricsCollector.recordSuccess(endpoint, latencyMs);

  // Handle 202 Accepted and 204 No Content (no response body)
  if (response.status === 202 || response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
