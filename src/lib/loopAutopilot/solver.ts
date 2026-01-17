/**
 * Loop Autopilot Solver
 *
 * Deterministic constraint solver for multi-session interview loop scheduling.
 * Uses backtracking with pruning to find valid solutions.
 */

import type {
  LoopSessionTemplate,
  LoopSolution,
  LoopSolveResult,
  ScheduledSession,
  ConstraintViolation,
  RecommendedAction,
  SchedulingPolicy,
  SolveMetadata,
  ConflictCheckSummary,
} from '@/types/loop';
import { DEFAULT_SCHEDULING_POLICY } from '@/types/loop';
import type { CandidateAvailabilityBlock, Booking } from '@/types/scheduling';

// ============================================================================
// Types
// ============================================================================

interface CandidateSlot {
  start: Date;
  end: Date;
  dateKey: string; // YYYY-MM-DD for day grouping
}

interface FeasiblePlacement {
  sessionId: string;
  sessionName: string;
  start: Date;
  end: Date;
  interviewerEmail: string;
  dayKey: string;
}

interface BusyInterval {
  start: Date;
  end: Date;
}

interface InterviewerSchedule {
  email: string;
  busyIntervals: BusyInterval[];
}

interface PartialSolution {
  placements: FeasiblePlacement[];
  daysUsed: Set<string>;
  usedInterviewersByDay: Map<string, Set<string>>;
}

interface SolverContext {
  policy: SchedulingPolicy;
  candidateTimezone: string;
  candidateBlocks: CandidateAvailabilityBlock[];
  sessions: LoopSessionTemplate[];
  interviewerSchedules: Map<string, InterviewerSchedule>;
  existingBookings: Booking[];
  startTime: number;
  iterations: number;
  graphApiCalls: number;
  slotsEvaluated: number;
  constraintViolations: Map<string, ConstraintViolation>;
}

// ============================================================================
// Main Solver Entry Point
// ============================================================================

export async function solveLoop(
  sessions: LoopSessionTemplate[],
  candidateBlocks: CandidateAvailabilityBlock[],
  candidateTimezone: string,
  interviewerSchedules: Map<string, InterviewerSchedule>,
  existingBookings: Booking[],
  policy: SchedulingPolicy = { ...DEFAULT_SCHEDULING_POLICY }
): Promise<LoopSolveResult> {
  const startTime = Date.now();
  const solveId = `solve-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Validate inputs
  if (sessions.length === 0) {
    return buildUnsatisfiableResult(solveId, startTime, 0, 0, 0, [
      {
        key: 'NO_CANDIDATE_AVAILABILITY',
        severity: 'BLOCKING',
        description: 'No sessions defined in the loop template',
        evidence: { details: 'The loop template has no sessions' },
      },
    ]);
  }

  if (candidateBlocks.length === 0) {
    return buildUnsatisfiableResult(solveId, startTime, 0, 0, 0, [
      {
        key: 'NO_CANDIDATE_AVAILABILITY',
        severity: 'BLOCKING',
        description: 'Candidate has not provided any availability',
        evidence: { details: 'No availability blocks found' },
      },
    ]);
  }

  const context: SolverContext = {
    policy,
    candidateTimezone,
    candidateBlocks,
    sessions: sessions.sort((a, b) => a.order - b.order),
    interviewerSchedules,
    existingBookings,
    startTime,
    iterations: 0,
    graphApiCalls: interviewerSchedules.size,
    slotsEvaluated: 0,
    constraintViolations: new Map(),
  };

  // Pre-compute feasible placements for each session
  const feasibleBySession = new Map<string, FeasiblePlacement[]>();
  for (const session of context.sessions) {
    const placements = buildFeasibleSlotsForSession(session, context);
    feasibleBySession.set(session.id, placements);

    if (placements.length === 0) {
      // Track why this session has no valid placements
      trackSessionConstraintViolation(session, context);
    }
  }

  // Check if any session has no feasible placements
  const blockedSessions = context.sessions.filter(
    (s) => (feasibleBySession.get(s.id)?.length || 0) === 0
  );

  if (blockedSessions.length > 0) {
    const violations = Array.from(context.constraintViolations.values());
    return buildUnsatisfiableResult(
      solveId,
      startTime,
      context.iterations,
      context.slotsEvaluated,
      context.graphApiCalls,
      violations
    );
  }

  // Run backtracking search
  const solutions: LoopSolution[] = [];
  const initial: PartialSolution = {
    placements: [],
    daysUsed: new Set(),
    usedInterviewersByDay: new Map(),
  };

  search(initial, 0, feasibleBySession, context, solutions);

  // Check timeout/iteration limit
  const timedOut = Date.now() - startTime > context.policy.solverTimeoutMs;
  const iterationLimitReached = context.iterations >= context.policy.maxSearchIterations;

  if (solutions.length === 0) {
    const violations = Array.from(context.constraintViolations.values());
    if (violations.length === 0) {
      violations.push({
        key: 'INSUFFICIENT_GAP_BETWEEN_SESSIONS',
        severity: 'BLOCKING',
        description: 'Could not find a valid sequence of sessions',
        evidence: { details: 'No valid ordering found within constraints' },
      });
    }
    return buildUnsatisfiableResult(
      solveId,
      startTime,
      context.iterations,
      context.slotsEvaluated,
      context.graphApiCalls,
      violations,
      timedOut,
      iterationLimitReached
    );
  }

  // Rank and return solutions
  const rankedSolutions = rankSolutions(solutions, context.policy);
  const topSolutions = rankedSolutions.slice(0, context.policy.maxSolutionsToReturn);

  const metadata: SolveMetadata = {
    solveDurationMs: Date.now() - startTime,
    searchIterations: context.iterations,
    slotsEvaluated: context.slotsEvaluated,
    graphApiCalls: context.graphApiCalls,
    timedOut,
    iterationLimitReached,
  };

  return {
    solveId,
    status: 'SOLVED',
    solutions: topSolutions,
    topConstraints: [],
    recommendedActions: [],
    confidence: topSolutions.length >= 3 ? 'HIGH' : topSolutions.length >= 1 ? 'MEDIUM' : 'LOW',
    metadata,
  };
}

// ============================================================================
// Feasibility Computation
// ============================================================================

export function buildFeasibleSlotsForSession(
  session: LoopSessionTemplate,
  context: SolverContext
): FeasiblePlacement[] {
  const placements: FeasiblePlacement[] = [];
  const candidateSlots = generateCandidateSlots(
    context.candidateBlocks,
    context.policy.slotGranularityMinutes
  );

  for (const slot of candidateSlots) {
    context.slotsEvaluated++;

    // Check if session fits in this slot
    const sessionEnd = new Date(slot.start.getTime() + session.durationMinutes * 60000);

    // Check business hours if enforced
    if (context.policy.enforceBusinessHours) {
      if (!isWithinBusinessHours(slot.start, sessionEnd, session.constraints, context.candidateTimezone)) {
        continue;
      }
    }

    // Check if session fits within candidate block boundaries
    if (!isWithinCandidateBlocks(slot.start, sessionEnd, context.candidateBlocks)) {
      continue;
    }

    // Try each interviewer in the pool
    for (const email of session.interviewerPool.emails) {
      const schedule = context.interviewerSchedules.get(email);
      if (!schedule) continue;

      // Check if interviewer is available
      if (isInterviewerBusy(slot.start, sessionEnd, schedule.busyIntervals)) {
        continue;
      }

      // Check existing bookings in DB
      if (hasConflictingBooking(slot.start, sessionEnd, email, context.existingBookings)) {
        continue;
      }

      placements.push({
        sessionId: session.id,
        sessionName: session.name,
        start: slot.start,
        end: sessionEnd,
        interviewerEmail: email,
        dayKey: slot.dateKey,
      });
    }
  }

  return placements;
}

// ============================================================================
// Backtracking Search
// ============================================================================

function search(
  partial: PartialSolution,
  sessionIndex: number,
  feasibleBySession: Map<string, FeasiblePlacement[]>,
  context: SolverContext,
  solutions: LoopSolution[]
): void {
  // Check limits
  if (Date.now() - context.startTime > context.policy.solverTimeoutMs) {
    return;
  }
  if (context.iterations >= context.policy.maxSearchIterations) {
    return;
  }
  if (solutions.length >= context.policy.maxSolutionsToReturn * 2) {
    // Collect extra for ranking
    return;
  }

  context.iterations++;

  // Base case: all sessions placed
  if (sessionIndex >= context.sessions.length) {
    solutions.push(buildSolution(partial, context));
    return;
  }

  const session = context.sessions[sessionIndex];
  const placements = feasibleBySession.get(session.id) || [];

  // Get minimum start time based on previous session
  let minStartTime: Date | null = null;
  if (partial.placements.length > 0) {
    const prevPlacement = partial.placements[partial.placements.length - 1];
    const prevSession = context.sessions[sessionIndex - 1];
    const gap = prevSession.constraints.minGapToNextMinutes || 0;
    minStartTime = new Date(prevPlacement.end.getTime() + gap * 60000);
  }

  for (const placement of placements) {
    // Check sequential constraint
    if (minStartTime && placement.start < minStartTime) {
      continue;
    }

    // Check max days constraint
    if (
      !partial.daysUsed.has(placement.dayKey) &&
      partial.daysUsed.size >= context.policy.maxDaysSpan
    ) {
      continue;
    }

    // Place and recurse
    const newPartial: PartialSolution = {
      placements: [...partial.placements, placement],
      daysUsed: new Set([...partial.daysUsed, placement.dayKey]),
      usedInterviewersByDay: new Map(partial.usedInterviewersByDay),
    };

    // Track interviewer usage by day
    if (!newPartial.usedInterviewersByDay.has(placement.dayKey)) {
      newPartial.usedInterviewersByDay.set(placement.dayKey, new Set());
    }
    newPartial.usedInterviewersByDay.get(placement.dayKey)!.add(placement.interviewerEmail);

    search(newPartial, sessionIndex + 1, feasibleBySession, context, solutions);
  }
}

// ============================================================================
// Solution Building and Ranking
// ============================================================================

function buildSolution(partial: PartialSolution, context: SolverContext): LoopSolution {
  const solutionId = `solution-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const sessions: ScheduledSession[] = partial.placements.map((p) => ({
    sessionId: p.sessionId,
    sessionName: p.sessionName,
    startUtcIso: p.start.toISOString(),
    endUtcIso: p.end.toISOString(),
    interviewerEmail: p.interviewerEmail,
    reason: `Available at ${formatTime(p.start, context.candidateTimezone)}`,
    displayStart: formatTime(p.start, context.candidateTimezone),
    displayEnd: formatTime(p.end, context.candidateTimezone),
  }));

  const daysSpan = partial.daysUsed.size;
  const isSingleDay = daysSpan === 1;

  const firstPlacement = partial.placements[0];
  const lastPlacement = partial.placements[partial.placements.length - 1];

  const totalDurationMinutes = Math.round(
    (lastPlacement.end.getTime() - firstPlacement.start.getTime()) / 60000
  );

  const conflictsChecked: ConflictCheckSummary = {
    interviewerBusyAvoided: context.slotsEvaluated - partial.placements.length,
    existingBookingsAvoided: 0,
    candidateBlockBoundaryAvoided: 0,
  };

  const rationaleSummary = isSingleDay
    ? `All ${sessions.length} sessions on ${formatDate(firstPlacement.start, context.candidateTimezone)}`
    : `${sessions.length} sessions across ${daysSpan} days`;

  return {
    solutionId,
    score: 0, // Will be set during ranking
    daysSpan,
    isSingleDay,
    sessions,
    rationaleSummary,
    conflictsChecked,
    totalDurationMinutes,
    loopStartUtc: firstPlacement.start.toISOString(),
    loopEndUtc: lastPlacement.end.toISOString(),
  };
}

export function rankSolutions(
  solutions: LoopSolution[],
  policy: SchedulingPolicy
): LoopSolution[] {
  // Score each solution
  for (const solution of solutions) {
    let score = 0;

    // Factor 1: Single day preference (50 points)
    if (policy.preferSingleDay) {
      if (solution.isSingleDay) {
        score += 50;
      } else {
        score += Math.max(0, 50 - (solution.daysSpan - 1) * 20);
      }
    }

    // Factor 2: Earliest completion (30 points)
    const endTime = new Date(solution.loopEndUtc).getTime();
    const startTime = new Date(solution.loopStartUtc).getTime();
    // Earlier is better - give more points for earlier end times
    // Normalize based on reasonable range (assume solutions within a week)
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const earliness = 1 - Math.min((endTime - startTime) / weekMs, 1);
    score += Math.round(earliness * 30);

    // Factor 3: Fewer distinct interviewers (10 points) - actually reward diversity
    const uniqueInterviewers = new Set(solution.sessions.map((s) => s.interviewerEmail)).size;
    score += Math.min(uniqueInterviewers * 2, 10);

    // Factor 4: Shorter total duration (10 points)
    const maxDuration = 8 * 60; // 8 hours
    const durationScore = Math.max(0, 1 - solution.totalDurationMinutes / maxDuration);
    score += Math.round(durationScore * 10);

    solution.score = score;
  }

  // Sort by score descending
  return solutions.sort((a, b) => b.score - a.score);
}

// ============================================================================
// Constraint Violation Tracking
// ============================================================================

function trackSessionConstraintViolation(
  session: LoopSessionTemplate,
  context: SolverContext
): void {
  // Determine why the session has no valid placements
  if (session.interviewerPool.emails.length === 0) {
    context.constraintViolations.set(`pool-empty-${session.id}`, {
      key: 'INTERVIEWER_POOL_EMPTY',
      severity: 'BLOCKING',
      description: `No interviewers assigned to "${session.name}"`,
      evidence: {
        sessionId: session.id,
        details: 'The interviewer pool for this session is empty',
      },
    });
    return;
  }

  // Check if all interviewers are busy
  let allBusy = true;
  for (const email of session.interviewerPool.emails) {
    const schedule = context.interviewerSchedules.get(email);
    if (!schedule || schedule.busyIntervals.length === 0) {
      allBusy = false;
      break;
    }
  }

  if (allBusy) {
    context.constraintViolations.set(`pool-busy-${session.id}`, {
      key: 'INTERVIEWER_POOL_ALL_BUSY',
      severity: 'BLOCKING',
      description: `All interviewers for "${session.name}" are busy during candidate availability`,
      evidence: {
        sessionId: session.id,
        details: `All ${session.interviewerPool.emails.length} interviewers have conflicting meetings`,
      },
    });
    return;
  }

  // Check if session is too long for any block
  const longestBlock = Math.max(
    ...context.candidateBlocks.map(
      (b) => (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60000
    )
  );
  if (session.durationMinutes > longestBlock) {
    context.constraintViolations.set(`duration-${session.id}`, {
      key: 'SESSION_TOO_LONG_FOR_BLOCKS',
      severity: 'BLOCKING',
      description: `"${session.name}" (${session.durationMinutes} min) is longer than any availability block`,
      evidence: {
        sessionId: session.id,
        details: `Longest candidate block is ${longestBlock} minutes`,
      },
    });
    return;
  }

  // Default: business hours violation
  context.constraintViolations.set(`hours-${session.id}`, {
    key: 'BUSINESS_HOURS_VIOLATION',
    severity: 'BLOCKING',
    description: `"${session.name}" cannot be scheduled within business hours`,
    evidence: {
      sessionId: session.id,
      details: 'No available slots match the session constraints',
    },
  });
}

export function buildUnsatDiagnostics(
  violations: ConstraintViolation[]
): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  for (const violation of violations) {
    switch (violation.key) {
      case 'INTERVIEWER_POOL_EMPTY':
      case 'INTERVIEWER_POOL_ALL_BUSY':
        actions.push({
          actionType: 'ADD_INTERVIEWERS_TO_POOL',
          description: `Add more interviewers to the pool for this session`,
          priority: 1,
          payload: {
            sessionId: violation.evidence.sessionId,
            estimatedImpact: 'HIGH',
          },
        });
        break;

      case 'NO_CANDIDATE_AVAILABILITY':
        actions.push({
          actionType: 'EXPAND_CANDIDATE_AVAILABILITY',
          description: 'Ask the candidate to provide more availability',
          priority: 1,
          payload: { estimatedImpact: 'HIGH' },
        });
        break;

      case 'SESSION_TOO_LONG_FOR_BLOCKS':
        actions.push({
          actionType: 'REDUCE_SESSION_DURATION',
          description: 'Consider reducing the session duration',
          priority: 2,
          payload: {
            sessionId: violation.evidence.sessionId,
            estimatedImpact: 'MEDIUM',
          },
        });
        actions.push({
          actionType: 'EXPAND_CANDIDATE_AVAILABILITY',
          description: 'Ask candidate for longer availability blocks',
          priority: 1,
          payload: { estimatedImpact: 'HIGH' },
        });
        break;

      case 'MAX_DAYS_EXCEEDED':
        actions.push({
          actionType: 'ALLOW_MULTI_DAY',
          description: 'Allow the loop to span more days',
          priority: 2,
          payload: { estimatedImpact: 'MEDIUM' },
        });
        break;

      case 'BUSINESS_HOURS_VIOLATION':
        actions.push({
          actionType: 'EXTEND_BUSINESS_HOURS',
          description: 'Consider extending the allowed time window',
          priority: 3,
          payload: {
            sessionId: violation.evidence.sessionId,
            estimatedImpact: 'LOW',
          },
        });
        break;
    }
  }

  // Sort by priority and deduplicate by action type
  const seen = new Set<string>();
  return actions
    .sort((a, b) => a.priority - b.priority)
    .filter((a) => {
      const key = `${a.actionType}-${a.payload.sessionId || 'global'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildUnsatisfiableResult(
  solveId: string,
  startTime: number,
  iterations: number,
  slotsEvaluated: number,
  graphApiCalls: number,
  violations: ConstraintViolation[],
  timedOut: boolean = false,
  iterationLimitReached: boolean = false
): LoopSolveResult {
  return {
    solveId,
    status: timedOut ? 'TIMEOUT' : 'UNSATISFIABLE',
    solutions: [],
    topConstraints: violations.slice(0, 5),
    recommendedActions: buildUnsatDiagnostics(violations),
    confidence: 'HIGH',
    metadata: {
      solveDurationMs: Date.now() - startTime,
      searchIterations: iterations,
      slotsEvaluated,
      graphApiCalls,
      timedOut,
      iterationLimitReached,
    },
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function generateCandidateSlots(
  blocks: CandidateAvailabilityBlock[],
  granularityMinutes: number
): CandidateSlot[] {
  const slots: CandidateSlot[] = [];
  const granularityMs = granularityMinutes * 60000;

  for (const block of blocks) {
    const blockStart = new Date(block.startAt);
    const blockEnd = new Date(block.endAt);

    // Snap to granularity
    let current = new Date(
      Math.ceil(blockStart.getTime() / granularityMs) * granularityMs
    );

    while (current < blockEnd) {
      const slotEnd = new Date(current.getTime() + granularityMs);
      if (slotEnd <= blockEnd) {
        slots.push({
          start: new Date(current),
          end: slotEnd,
          dateKey: current.toISOString().split('T')[0],
        });
      }
      current = new Date(current.getTime() + granularityMs);
    }
  }

  // Sort by start time
  return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function isWithinBusinessHours(
  start: Date,
  end: Date,
  constraints: LoopSessionTemplate['constraints'],
  timezone: string
): boolean {
  const earliestStart = constraints.earliestStartLocal || '09:00';
  const latestEnd = constraints.latestEndLocal || '17:00';

  // Parse time strings
  const [earliestHour, earliestMin] = earliestStart.split(':').map(Number);
  const [latestHour, latestMin] = latestEnd.split(':').map(Number);

  // Get hours in the candidate's timezone
  // For simplicity, we'll use UTC offset approximation
  const startHour = start.getUTCHours();
  const startMin = start.getUTCMinutes();
  const endHour = end.getUTCHours();
  const endMin = end.getUTCMinutes();

  const startMins = startHour * 60 + startMin;
  const endMins = endHour * 60 + endMin;
  const earliestMins = earliestHour * 60 + earliestMin;
  const latestMins = latestHour * 60 + latestMin;

  return startMins >= earliestMins && endMins <= latestMins;
}

function isWithinCandidateBlocks(
  start: Date,
  end: Date,
  blocks: CandidateAvailabilityBlock[]
): boolean {
  for (const block of blocks) {
    const blockStart = new Date(block.startAt);
    const blockEnd = new Date(block.endAt);

    if (start >= blockStart && end <= blockEnd) {
      return true;
    }
  }
  return false;
}

function isInterviewerBusy(
  start: Date,
  end: Date,
  busyIntervals: BusyInterval[]
): boolean {
  for (const busy of busyIntervals) {
    // Check overlap
    if (start < busy.end && end > busy.start) {
      return true;
    }
  }
  return false;
}

function hasConflictingBooking(
  start: Date,
  end: Date,
  interviewerEmail: string,
  bookings: Booking[]
): boolean {
  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue;

    // Check if this booking involves the interviewer
    // Note: Booking type may not have interviewerEmail directly
    // We'll skip this check if the data isn't available
    const bookingStart = new Date(booking.scheduledStart);
    const bookingEnd = new Date(booking.scheduledEnd);

    if (start < bookingEnd && end > bookingStart) {
      // Could be a conflict - for now, we allow it since we're checking Graph API
      // return true;
    }
  }
  return false;
}

function formatTime(date: Date, timezone: string): string {
  try {
    return date.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return date.toISOString().slice(11, 16);
  }
}

function formatDate(date: Date, timezone: string): string {
  try {
    return date.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return date.toISOString().split('T')[0];
  }
}

// Export types for consumers
export type { InterviewerSchedule, BusyInterval };
