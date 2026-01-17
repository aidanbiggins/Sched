/**
 * API Route: /api/loop-autopilot/last-run
 *
 * GET - Get the latest solve run for an availability request
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getLatestLoopSolveRun,
  getLoopBookingByAvailabilityRequest,
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const availabilityRequestId = searchParams.get('availabilityRequestId');

    if (!availabilityRequestId) {
      return NextResponse.json(
        { error: 'availabilityRequestId query parameter is required' },
        { status: 400 }
      );
    }

    // Get latest solve run
    const latestRun = await getLatestLoopSolveRun(availabilityRequestId);

    if (!latestRun) {
      return NextResponse.json({
        found: false,
        message: 'No solve runs found for this availability request',
      });
    }

    // Check if there's a committed booking
    const committedBooking = await getLoopBookingByAvailabilityRequest(availabilityRequestId);

    return NextResponse.json({
      found: true,
      solveRun: {
        id: latestRun.id,
        status: latestRun.status,
        solutionsCount: latestRun.solutionsCount,
        solveDurationMs: latestRun.solveDurationMs,
        createdAt: latestRun.createdAt.toISOString(),
        result: latestRun.resultSnapshot,
        errorMessage: latestRun.errorMessage,
      },
      committedBooking: committedBooking
        ? {
            id: committedBooking.id,
            status: committedBooking.status,
            chosenSolutionId: committedBooking.chosenSolutionId,
            createdAt: committedBooking.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error('Error fetching last loop solve run:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
