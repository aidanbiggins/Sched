/**
 * API Route: /api/ops/graph
 *
 * GET - Get Microsoft Graph API health status and metrics
 *
 * Returns:
 * - Graph mode (mock/real)
 * - Token status (valid/expired, expiry time)
 * - API call metrics (success rate, rate limits, errors)
 * - Last successful call timestamp
 * - Last error details
 */

import { NextResponse } from 'next/server';
import { getRealClientInstance, getGraphRetryMetrics, isGraphModeReal } from '@/lib/graph';
import type { GraphCalendarClientReal } from '@/lib/graph/GraphCalendarClientReal';

export const dynamic = 'force-dynamic';

interface GraphHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy' | 'mock';
  mode: 'mock' | 'real';
  tokenStatus?: {
    valid: boolean;
    expiresAt: string | null;
    expiresInSeconds: number | null;
  };
  tokenMetrics?: {
    tokenRefreshes: number;
    tokenFailures: number;
    lastRefreshAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  };
  apiMetrics: {
    totalCalls: number;
    successfulCalls: number;
    rateLimited: number;
    transientErrors: number;
    successRate: string;
    lastSuccessfulCall: string | null;
    lastError: {
      message: string;
      status: number;
      timestamp: string;
    } | null;
  };
  timestamp: string;
}

export async function GET(): Promise<NextResponse<GraphHealthResponse>> {
  try {
    const mode = isGraphModeReal() ? 'real' : 'mock';
    const retryMetrics = getGraphRetryMetrics();

    // Calculate success rate
    const successRate = retryMetrics.totalCalls > 0
      ? ((retryMetrics.successfulCalls / retryMetrics.totalCalls) * 100).toFixed(1) + '%'
      : 'N/A';

    // Base response for mock mode
    if (mode === 'mock') {
      return NextResponse.json({
        status: 'mock',
        mode: 'mock',
        apiMetrics: {
          totalCalls: retryMetrics.totalCalls,
          successfulCalls: retryMetrics.successfulCalls,
          rateLimited: retryMetrics.rateLimited,
          transientErrors: retryMetrics.transientErrors,
          successRate,
          lastSuccessfulCall: retryMetrics.lastSuccessfulCall?.toISOString() ?? null,
          lastError: retryMetrics.lastError
            ? {
                message: retryMetrics.lastError.message,
                status: retryMetrics.lastError.status,
                timestamp: retryMetrics.lastError.timestamp.toISOString(),
              }
            : null,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Real mode - get token status from client instance
    const realClient = getRealClientInstance() as GraphCalendarClientReal | null;

    if (!realClient) {
      // Real mode but client not initialized yet
      return NextResponse.json({
        status: 'degraded',
        mode: 'real',
        tokenStatus: {
          valid: false,
          expiresAt: null,
          expiresInSeconds: null,
        },
        tokenMetrics: {
          tokenRefreshes: 0,
          tokenFailures: 0,
          lastRefreshAt: null,
          lastFailureAt: null,
          lastError: 'Client not initialized',
        },
        apiMetrics: {
          totalCalls: retryMetrics.totalCalls,
          successfulCalls: retryMetrics.successfulCalls,
          rateLimited: retryMetrics.rateLimited,
          transientErrors: retryMetrics.transientErrors,
          successRate,
          lastSuccessfulCall: retryMetrics.lastSuccessfulCall?.toISOString() ?? null,
          lastError: retryMetrics.lastError
            ? {
                message: retryMetrics.lastError.message,
                status: retryMetrics.lastError.status,
                timestamp: retryMetrics.lastError.timestamp.toISOString(),
              }
            : null,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Get token status and metrics from real client
    const tokenStatus = realClient.getTokenStatus();
    const tokenMetrics = realClient.getTokenMetrics();

    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Degraded if token is invalid or recently failed
    if (!tokenStatus.valid) {
      status = 'degraded';
    }

    // Degraded if we have recent failures
    if (retryMetrics.lastError) {
      const errorAge = Date.now() - retryMetrics.lastError.timestamp.getTime();
      if (errorAge < 5 * 60 * 1000) {
        // Last 5 minutes
        status = 'degraded';
      }
    }

    // Unhealthy if token refresh is failing repeatedly
    if (tokenMetrics.tokenFailures > 0 && tokenMetrics.lastFailureAt) {
      const failureAge = Date.now() - tokenMetrics.lastFailureAt.getTime();
      if (failureAge < 10 * 60 * 1000) {
        // Last 10 minutes
        status = 'unhealthy';
      }
    }

    return NextResponse.json({
      status,
      mode: 'real',
      tokenStatus: {
        valid: tokenStatus.valid,
        expiresAt: tokenStatus.expiresAt?.toISOString() ?? null,
        expiresInSeconds: tokenStatus.expiresInSeconds,
      },
      tokenMetrics: {
        tokenRefreshes: tokenMetrics.tokenRefreshes,
        tokenFailures: tokenMetrics.tokenFailures,
        lastRefreshAt: tokenMetrics.lastRefreshAt?.toISOString() ?? null,
        lastFailureAt: tokenMetrics.lastFailureAt?.toISOString() ?? null,
        lastError: tokenMetrics.lastError,
      },
      apiMetrics: {
        totalCalls: retryMetrics.totalCalls,
        successfulCalls: retryMetrics.successfulCalls,
        rateLimited: retryMetrics.rateLimited,
        transientErrors: retryMetrics.transientErrors,
        successRate,
        lastSuccessfulCall: retryMetrics.lastSuccessfulCall?.toISOString() ?? null,
        lastError: retryMetrics.lastError
          ? {
              message: retryMetrics.lastError.message,
              status: retryMetrics.lastError.status,
              timestamp: retryMetrics.lastError.timestamp.toISOString(),
            }
          : null,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching Graph health status:', error);
    return NextResponse.json(
      {
        status: 'unhealthy' as const,
        mode: 'real' as const,
        apiMetrics: {
          totalCalls: 0,
          successfulCalls: 0,
          rateLimited: 0,
          transientErrors: 0,
          successRate: 'N/A',
          lastSuccessfulCall: null,
          lastError: {
            message: error instanceof Error ? error.message : 'Unknown error',
            status: 500,
            timestamp: new Date().toISOString(),
          },
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
