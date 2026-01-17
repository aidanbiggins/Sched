/**
 * API Route: /api/loop-autopilot/solve
 *
 * POST - Run the constraint solver to find valid interview loop schedules
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getAvailabilityRequestById,
  getCandidateAvailabilityBlocksByRequestId,
  getLoopTemplateWithSessions,
  getLoopSolveRunByIdempotencyKey,
  createLoopSolveRun,
  updateLoopSolveRunResult,
  updateLoopSolveRunError,
  getBookingsInTimeRange,
} from '@/lib/db';
import { solveLoop, type InterviewerSchedule } from '@/lib/loopAutopilot/solver';
import { getGraphCalendarClient } from '@/lib/graph';
import { getCalendarClient } from '@/lib/calendar';
import { isStandaloneMode } from '@/lib/config';
import type { LoopSolveRequest, SchedulingPolicy, DEFAULT_SCHEDULING_POLICY } from '@/types/loop';

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

    const body = await request.json() as LoopSolveRequest;

    // Validate required fields
    if (!body.availabilityRequestId) {
      return NextResponse.json(
        { error: 'availabilityRequestId is required' },
        { status: 400 }
      );
    }
    if (!body.loopTemplateId) {
      return NextResponse.json(
        { error: 'loopTemplateId is required' },
        { status: 400 }
      );
    }

    // Check idempotency
    if (body.solveIdempotencyKey) {
      const existingRun = await getLoopSolveRunByIdempotencyKey(body.solveIdempotencyKey);
      if (existingRun && existingRun.resultSnapshot) {
        return NextResponse.json({
          solveId: existingRun.id,
          cached: true,
          result: existingRun.resultSnapshot,
        });
      }
    }

    // Fetch availability request
    const availabilityRequest = await getAvailabilityRequestById(body.availabilityRequestId);
    if (!availabilityRequest) {
      return NextResponse.json(
        { error: 'Availability request not found' },
        { status: 404 }
      );
    }

    // Check status
    if (availabilityRequest.status === 'pending') {
      return NextResponse.json(
        { error: 'Candidate has not submitted availability yet' },
        { status: 400 }
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

    // Fetch loop template with sessions
    const loopTemplate = await getLoopTemplateWithSessions(body.loopTemplateId);
    if (!loopTemplate) {
      return NextResponse.json(
        { error: 'Loop template not found' },
        { status: 404 }
      );
    }
    if (!loopTemplate.isActive) {
      return NextResponse.json(
        { error: 'Loop template is not active' },
        { status: 400 }
      );
    }
    if (loopTemplate.sessions.length === 0) {
      return NextResponse.json(
        { error: 'Loop template has no sessions' },
        { status: 400 }
      );
    }

    // Apply interviewer pool overrides if provided
    const sessions = loopTemplate.sessions.map((s) => {
      if (body.interviewerPoolOverrides?.[s.id]) {
        return { ...s, interviewerPool: body.interviewerPoolOverrides[s.id] };
      }
      return s;
    });

    // Validate all sessions have interviewers
    for (const s of sessions) {
      if (s.interviewerPool.emails.length === 0) {
        return NextResponse.json(
          { error: `Session "${s.name}" has no interviewers in pool` },
          { status: 400 }
        );
      }
    }

    // Fetch candidate availability blocks
    const candidateBlocks = await getCandidateAvailabilityBlocksByRequestId(
      body.availabilityRequestId
    );
    if (candidateBlocks.length === 0) {
      return NextResponse.json(
        { error: 'No candidate availability blocks found' },
        { status: 400 }
      );
    }

    // Determine window for interviewer availability
    const allStarts = candidateBlocks.map((b) => new Date(b.startAt));
    const allEnds = candidateBlocks.map((b) => new Date(b.endAt));
    const windowStart = new Date(Math.min(...allStarts.map((d) => d.getTime())));
    const windowEnd = new Date(Math.max(...allEnds.map((d) => d.getTime())));

    // Collect all unique interviewer emails
    const allInterviewerEmails = new Set<string>();
    for (const s of sessions) {
      for (const email of s.interviewerPool.emails) {
        allInterviewerEmails.add(email);
      }
    }

    // Fetch interviewer schedules from calendar
    let interviewerSchedules: Map<string, InterviewerSchedule>;
    try {
      interviewerSchedules = await fetchInterviewerSchedules(
        Array.from(allInterviewerEmails),
        windowStart,
        windowEnd,
        session.user.id
      );
    } catch (error) {
      console.error('Error fetching interviewer schedules:', error);
      return NextResponse.json(
        { error: 'Failed to fetch interviewer calendars' },
        { status: 502 }
      );
    }

    // Fetch existing bookings in the time window for conflict checking
    const existingBookings = await getBookingsInTimeRange(windowStart, windowEnd);

    // Create solve run record
    const solveRun = await createLoopSolveRun({
      organizationId,
      availabilityRequestId: body.availabilityRequestId,
      loopTemplateId: body.loopTemplateId,
      inputsSnapshot: body,
      solveIdempotencyKey: body.solveIdempotencyKey,
    });

    // Build policy
    const policy: SchedulingPolicy = {
      slotGranularityMinutes: body.policyOverrides?.slotGranularityMinutes ?? 15,
      maxSolutionsToReturn: body.policyOverrides?.maxSolutionsToReturn ?? 10,
      preferSingleDay: body.policyOverrides?.preferSingleDay ?? true,
      maxDaysSpan: body.policyOverrides?.maxDaysSpan ?? 3,
      enforceBusinessHours: body.policyOverrides?.enforceBusinessHours ?? true,
      reorderSessionsAllowed: body.policyOverrides?.reorderSessionsAllowed ?? false,
      solverTimeoutMs: body.policyOverrides?.solverTimeoutMs ?? 10000,
      maxSearchIterations: body.policyOverrides?.maxSearchIterations ?? 10000,
    };

    // Run solver
    const candidateTimezone = body.candidateTimezone || availabilityRequest.candidateTimezone || 'America/New_York';

    try {
      const result = await solveLoop(
        sessions,
        candidateBlocks,
        candidateTimezone,
        interviewerSchedules,
        existingBookings,
        policy
      );

      // Update solve run with result
      await updateLoopSolveRunResult(solveRun.id, result, {
        solveDurationMs: result.metadata.solveDurationMs,
        searchIterations: result.metadata.searchIterations,
        graphApiCalls: result.metadata.graphApiCalls,
      });

      return NextResponse.json({
        solveId: solveRun.id,
        cached: false,
        result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown solver error';
      await updateLoopSolveRunError(
        solveRun.id,
        errorMessage,
        error instanceof Error ? error.stack : undefined
      );

      return NextResponse.json(
        { error: `Solver error: ${errorMessage}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in loop-autopilot solve:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Fetch interviewer schedules from the appropriate calendar source
 */
async function fetchInterviewerSchedules(
  emails: string[],
  windowStart: Date,
  windowEnd: Date,
  userId: string
): Promise<Map<string, InterviewerSchedule>> {
  const schedules = new Map<string, InterviewerSchedule>();

  if (isStandaloneMode()) {
    // Use personal calendar in standalone mode
    const calendarClient = await getCalendarClient(userId);
    const freeBusyResponses = await calendarClient.getFreeBusy({
      emails,
      startTime: windowStart,
      endTime: windowEnd,
    });

    for (const response of freeBusyResponses) {
      schedules.set(response.email, {
        email: response.email,
        busyIntervals: response.busyIntervals.map((interval) => ({
          start: interval.start,
          end: interval.end,
        })),
      });
    }
  } else {
    // Enterprise mode: use Graph API
    const graphClient = getGraphCalendarClient();
    const graphSchedules = await graphClient.getSchedule(emails, windowStart, windowEnd, 15);

    for (const gs of graphSchedules) {
      schedules.set(gs.email, {
        email: gs.email,
        busyIntervals: gs.busyIntervals.map((interval) => ({
          start: interval.start,
          end: interval.end,
        })),
      });
    }
  }

  return schedules;
}
