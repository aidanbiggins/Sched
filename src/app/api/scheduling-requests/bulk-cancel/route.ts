/**
 * API Route: /api/scheduling-requests/bulk-cancel
 *
 * POST - Cancel multiple scheduling requests at once
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingService } from '@/lib/scheduling';

interface BulkCancelResult {
  id: string;
  success: boolean;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.requestIds || !Array.isArray(body.requestIds) || body.requestIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required field: requestIds (array of scheduling request IDs)' },
        { status: 400 }
      );
    }

    if (!body.reason) {
      return NextResponse.json(
        { error: 'Missing required field: reason' },
        { status: 400 }
      );
    }

    // Limit bulk operations to prevent abuse
    const maxBulkSize = 50;
    if (body.requestIds.length > maxBulkSize) {
      return NextResponse.json(
        { error: `Cannot cancel more than ${maxBulkSize} requests at once` },
        { status: 400 }
      );
    }

    const service = getSchedulingService();
    const results: BulkCancelResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process cancellations sequentially to avoid race conditions
    for (const requestId of body.requestIds) {
      try {
        await service.cancel(
          requestId,
          body.reason,
          body.notifyParticipants ?? true,
          body.actorId
        );
        results.push({ id: requestId, success: true });
        successCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.push({ id: requestId, success: false, error: errorMessage });
        failureCount++;
      }
    }

    // Return appropriate status based on results
    const allSucceeded = failureCount === 0;
    const allFailed = successCount === 0;

    return NextResponse.json(
      {
        success: allSucceeded,
        message: allSucceeded
          ? `Successfully cancelled ${successCount} request(s)`
          : allFailed
            ? 'All cancellations failed'
            : `Cancelled ${successCount} request(s), ${failureCount} failed`,
        results,
        summary: {
          total: body.requestIds.length,
          succeeded: successCount,
          failed: failureCount,
        },
      },
      { status: allFailed ? 400 : allSucceeded ? 200 : 207 } // 207 = Multi-Status
    );
  } catch (error) {
    console.error('Error in bulk cancel:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
