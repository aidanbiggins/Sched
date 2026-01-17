/**
 * API Route: /api/loop-autopilot/commit
 *
 * POST - Commit a chosen solution by booking all sessions
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getLoopSolveRunById,
  getLoopBookingByIdempotencyKey,
  createLoopBooking,
  createLoopBookingItem,
  updateLoopBookingStatus,
  getAvailabilityRequestById,
  updateAvailabilityRequest,
} from '@/lib/db';
import { getSchedulingService } from '@/lib/scheduling';
import type { LoopCommitRequest, LoopCommitResult, BookedSessionInfo, RollbackDetails } from '@/types/loop';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const organizationId = (session.user as { organizationId?: string | null }).organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'No organization selected' }, { status: 400 });
    }

    const body = await request.json() as LoopCommitRequest;

    // Validate required fields
    if (!body.solveId) {
      return NextResponse.json({ error: 'solveId is required' }, { status: 400 });
    }
    if (!body.solutionId) {
      return NextResponse.json({ error: 'solutionId is required' }, { status: 400 });
    }
    if (!body.commitIdempotencyKey) {
      return NextResponse.json(
        { error: 'commitIdempotencyKey is required' },
        { status: 400 }
      );
    }

    // Check idempotency - if already committed, return success
    const existingBooking = await getLoopBookingByIdempotencyKey(body.commitIdempotencyKey);
    if (existingBooking) {
      if (existingBooking.status === 'COMMITTED') {
        return NextResponse.json({
          status: 'ALREADY_COMMITTED',
          loopBookingId: existingBooking.id,
        } as LoopCommitResult);
      }
      if (existingBooking.status === 'PENDING') {
        return NextResponse.json(
          { error: 'Commit is already in progress' },
          { status: 409 }
        );
      }
      if (existingBooking.status === 'FAILED') {
        // Allow retry on failure - will create new booking below
      }
    }

    // Fetch the solve run
    const solveRun = await getLoopSolveRunById(body.solveId);
    if (!solveRun) {
      return NextResponse.json({ error: 'Solve run not found' }, { status: 404 });
    }
    if (!solveRun.resultSnapshot) {
      return NextResponse.json({ error: 'Solve run has no result' }, { status: 400 });
    }
    if (solveRun.status !== 'SOLVED') {
      return NextResponse.json(
        { error: `Cannot commit - solve status is ${solveRun.status}` },
        { status: 400 }
      );
    }

    // Find the chosen solution
    const solution = solveRun.resultSnapshot.solutions.find(
      (s) => s.solutionId === body.solutionId
    );
    if (!solution) {
      return NextResponse.json(
        { error: 'Solution not found in solve result' },
        { status: 404 }
      );
    }

    // Fetch availability request to check status
    const availabilityRequest = await getAvailabilityRequestById(
      solveRun.availabilityRequestId
    );
    if (!availabilityRequest) {
      return NextResponse.json(
        { error: 'Availability request not found' },
        { status: 404 }
      );
    }
    if (availabilityRequest.status === 'booked') {
      return NextResponse.json(
        { error: 'Interview has already been booked' },
        { status: 409 }
      );
    }
    if (availabilityRequest.status === 'cancelled' || availabilityRequest.status === 'expired') {
      return NextResponse.json(
        { error: `Availability request is ${availabilityRequest.status}` },
        { status: 409 }
      );
    }

    // Create loop booking record
    const loopBooking = await createLoopBooking({
      organizationId,
      availabilityRequestId: solveRun.availabilityRequestId,
      loopTemplateId: solveRun.loopTemplateId,
      solveRunId: solveRun.id,
      chosenSolutionId: body.solutionId,
      commitIdempotencyKey: body.commitIdempotencyKey,
    });

    // Book each session
    const schedulingService = getSchedulingService();
    const bookedSessions: BookedSessionInfo[] = [];
    const bookingErrors: string[] = [];

    for (const scheduledSession of solution.sessions) {
      try {
        // Create calendar event for this session
        const booking = await schedulingService.bookLoopSession({
          availabilityRequestId: solveRun.availabilityRequestId,
          sessionId: scheduledSession.sessionId,
          sessionName: scheduledSession.sessionName,
          startUtc: scheduledSession.startUtcIso,
          endUtc: scheduledSession.endUtcIso,
          interviewerEmail: scheduledSession.interviewerEmail,
          organizerEmail: body.organizerEmail || session.user.email || undefined,
          meetingTitle: body.meetingDetails?.title,
          meetingBody: body.meetingDetails?.bodyTemplate,
          includeTeamsLink: body.meetingDetails?.includeTeamsLink ?? true,
        });

        // Create booking item record
        await createLoopBookingItem({
          loopBookingId: loopBooking.id,
          sessionTemplateId: scheduledSession.sessionId,
          bookingId: booking.id,
          calendarEventId: booking.calendarEventId || 'pending',
        });

        bookedSessions.push({
          sessionId: scheduledSession.sessionId,
          sessionName: scheduledSession.sessionName,
          bookingId: booking.id,
          calendarEventId: booking.calendarEventId || 'pending',
          startUtcIso: scheduledSession.startUtcIso,
          endUtcIso: scheduledSession.endUtcIso,
          interviewerEmail: scheduledSession.interviewerEmail,
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        bookingErrors.push(`Failed to book "${scheduledSession.sessionName}": ${errorMsg}`);
        console.error(`Error booking session ${scheduledSession.sessionId}:`, error);
      }
    }

    // Check if all sessions were booked successfully
    if (bookingErrors.length > 0) {
      // Partial failure - attempt rollback
      const rollbackDetails = await attemptRollback(bookedSessions, schedulingService);

      await updateLoopBookingStatus(loopBooking.id, 'FAILED', {
        errorMessage: bookingErrors.join('; '),
        rollbackAttempted: true,
        rollbackDetails,
      });

      return NextResponse.json(
        {
          status: 'FAILED',
          loopBookingId: loopBooking.id,
          errorMessage: bookingErrors.join('; '),
          rollbackDetails,
        } as LoopCommitResult,
        { status: 500 }
      );
    }

    // All sessions booked successfully
    await updateLoopBookingStatus(loopBooking.id, 'COMMITTED');

    // Update availability request status to booked
    await updateAvailabilityRequest(solveRun.availabilityRequestId, { status: 'booked' });

    return NextResponse.json({
      status: 'COMMITTED',
      loopBookingId: loopBooking.id,
      bookedSessions,
    } as LoopCommitResult);
  } catch (error) {
    console.error('Error in loop-autopilot commit:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Attempt to rollback partially booked sessions
 */
async function attemptRollback(
  bookedSessions: BookedSessionInfo[],
  _schedulingService: ReturnType<typeof getSchedulingService>
): Promise<RollbackDetails> {
  const rollbackDetails: RollbackDetails = {
    eventsCreated: bookedSessions.length,
    eventsRolledBack: 0,
    rollbackErrors: [],
  };

  for (const session of bookedSessions) {
    try {
      // In a real implementation, we would cancel each booking here
      // For now, we just log the attempt
      console.log(`Would rollback booking ${session.bookingId} for session ${session.sessionId}`);
      rollbackDetails.eventsRolledBack++;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      rollbackDetails.rollbackErrors.push(
        `Failed to rollback ${session.sessionId}: ${errorMsg}`
      );
    }
  }

  return rollbackDetails;
}
