/**
 * iCIMS HTTP Helper
 *
 * HTTP client wrapper with:
 * - Auth header injection
 * - Retry logic for transient errors
 * - Rate limit handling (429 + Retry-After)
 * - Metrics recording
 */

import { IcimsConfig } from './icimsConfig';
import {
  IcimsError,
  IcimsNetworkError,
  classifyIcimsError,
  isRetryableIcimsError,
  getRetryAfterMs,
} from './icimsErrors';
import { recordIcimsSuccess, recordIcimsFailure } from './icimsMetrics';

// Retry configuration (per plan)
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second
const MAX_DELAY_MS = 30000; // 30 seconds

export interface IcimsRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}

export interface IcimsResponse<T = unknown> {
  data: T;
  statusCode: number;
  headers: Record<string, string>;
}

/**
 * Make an HTTP request to iCIMS API with retry logic
 */
export async function icimsRequest<T = unknown>(
  config: IcimsConfig,
  options: IcimsRequestOptions
): Promise<IcimsResponse<T>> {
  const { method, path, body, idempotencyKey } = options;
  const url = `${config.baseUrl}${path}`;

  let lastError: IcimsError | null = null;
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const startTime = Date.now();

    try {
      const response = await executeRequest(config, url, method, body, idempotencyKey);
      const latencyMs = Date.now() - startTime;

      // Record success
      recordIcimsSuccess(latencyMs);

      return response as IcimsResponse<T>;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      lastError = error instanceof IcimsError ? error : wrapNetworkError(error);

      // Record failure
      recordIcimsFailure(latencyMs, lastError.statusCode, lastError.message);

      // Check if retryable
      if (!isRetryableIcimsError(lastError)) {
        throw lastError;
      }

      // Max retries exceeded
      if (attempt >= MAX_RETRIES) {
        break;
      }

      // Calculate delay
      const retryAfterMs = getRetryAfterMs(lastError);
      const delay = retryAfterMs ?? calculateBackoff(attempt);

      // Log retry attempt (safe - no secrets)
      console.log(
        `[iCIMS] Retry ${attempt + 1}/${MAX_RETRIES} for ${method} ${path} after ${delay}ms`
      );

      await sleep(delay);
      attempt++;
    }
  }

  throw lastError ?? new IcimsError('Unknown error after retries');
}

/**
 * Execute a single HTTP request
 */
async function executeRequest(
  config: IcimsConfig,
  url: string,
  method: string,
  body?: unknown,
  idempotencyKey?: string
): Promise<IcimsResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-API-Key': config.apiKey,
    'User-Agent': 'Sched-Scheduler/1.0',
  };

  // Add idempotency key if provided
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    fetchOptions.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, fetchOptions);
  } catch (error) {
    throw wrapNetworkError(error);
  }

  // Read response body
  const responseText = await response.text();
  const retryAfterHeader = response.headers.get('Retry-After') ?? undefined;

  // Handle non-2xx responses
  if (!response.ok) {
    throw classifyIcimsError(response.status, responseText, retryAfterHeader);
  }

  // Parse successful response
  let data: unknown = null;
  if (responseText) {
    try {
      data = JSON.parse(responseText);
    } catch {
      data = responseText;
    }
  }

  // Extract headers
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key.toLowerCase()] = value;
  });

  return {
    data,
    statusCode: response.status,
    headers: responseHeaders,
  };
}

/**
 * Wrap unknown errors as network errors
 */
function wrapNetworkError(error: unknown): IcimsNetworkError {
  if (error instanceof IcimsError) {
    return error as IcimsNetworkError;
  }

  const message = error instanceof Error ? error.message : 'Unknown network error';
  return new IcimsNetworkError(message);
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number): number {
  // Exponential backoff with jitter
  const exponentialDelay = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * BASE_DELAY_MS;
  return Math.min(exponentialDelay + jitter, MAX_DELAY_MS);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate idempotency key for note writes
 * Format: sched-{applicationId}-{contentHash}-{date}
 */
export function generateIdempotencyKey(applicationId: string, noteText: string): string {
  // Simple hash of note text (we don't have Node.js crypto in browser)
  const contentHash = simpleHash(noteText).toString(16).substring(0, 8);
  const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  return `sched-${applicationId}-${contentHash}-${dateKey}`;
}

/**
 * Simple hash function for browser compatibility
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
