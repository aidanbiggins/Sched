/**
 * API Route: /api/ops/icims
 *
 * GET - Get iCIMS API health status and metrics
 *
 * Returns:
 * - iCIMS mode (mock/real)
 * - API health status
 * - API call metrics (success rate, rate limits, errors)
 * - Sync queue status
 * - Configuration summary
 */

import { NextResponse } from 'next/server';
import {
  getIcimsConfigSummary,
  getIcimsFullHealthStatus,
  getIcimsMetrics24h,
  getIcimsHealthStatus,
} from '@/lib/icims';
import { getSyncJobCounts } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface IcimsOpsResponse {
  status: 'healthy' | 'degraded' | 'down';
  lastSuccessfulCall: string | null;
  lastFailedCall: string | null;
  lastError: string | null;
  metricsLast24h: {
    totalCalls: number;
    successfulCalls: number;
    failedCalls: number;
    avgResponseTimeMs: number;
    rateLimitHits: number;
  };
  syncJobs: {
    pending: number;
    processing: number;
    completedLast24h: number;
    failedLast24h: number;
  };
  config: {
    mode: string;
    baseUrl: string;
    hasApiKey: boolean;
  };
  timestamp: string;
}

export async function GET(): Promise<NextResponse<IcimsOpsResponse>> {
  try {
    const config = getIcimsConfigSummary();
    const syncJobCounts = await getSyncJobCounts();

    // Get health status
    const healthStatus = getIcimsFullHealthStatus(config, {
      pending: syncJobCounts.pending,
      processing: syncJobCounts.processing,
      completedLast24h: syncJobCounts.completedLast24h,
      failedLast24h: syncJobCounts.failedLast24h,
    });

    return NextResponse.json({
      status: healthStatus.status,
      lastSuccessfulCall: healthStatus.lastSuccessfulCall,
      lastFailedCall: healthStatus.lastFailedCall,
      lastError: healthStatus.lastError,
      metricsLast24h: healthStatus.metricsLast24h,
      syncJobs: {
        pending: syncJobCounts.pending,
        processing: syncJobCounts.processing,
        completedLast24h: syncJobCounts.completedLast24h,
        failedLast24h: syncJobCounts.failedLast24h,
      },
      config: healthStatus.config,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error fetching iCIMS health status:', error);
    return NextResponse.json(
      {
        status: 'down' as const,
        lastSuccessfulCall: null,
        lastFailedCall: null,
        lastError: error instanceof Error ? error.message : 'Unknown error',
        metricsLast24h: {
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          avgResponseTimeMs: 0,
          rateLimitHits: 0,
        },
        syncJobs: {
          pending: 0,
          processing: 0,
          completedLast24h: 0,
          failedLast24h: 0,
        },
        config: {
          mode: 'unknown',
          baseUrl: '',
          hasApiKey: false,
        },
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
