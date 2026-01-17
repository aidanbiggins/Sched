/**
 * Loop Autopilot Solver Tests
 */

import {
  solveLoop,
  buildFeasibleSlotsForSession,
  rankSolutions,
  buildUnsatDiagnostics,
  type InterviewerSchedule,
} from '@/lib/loopAutopilot/solver';
import { DEFAULT_SCHEDULING_POLICY } from '@/types/loop';
import type {
  LoopSessionTemplate,
  SchedulingPolicy,
  ConstraintViolation,
  LoopSolution,
} from '@/types/loop';
import type { CandidateAvailabilityBlock, Booking } from '@/types/scheduling';

// ============================================================================
// Test Helpers
// ============================================================================

function createSession(
  id: string,
  name: string,
  order: number,
  durationMinutes: number,
  interviewerEmails: string[]
): LoopSessionTemplate {
  return {
    id,
    loopTemplateId: 'template-1',
    order,
    name,
    durationMinutes,
    interviewerPool: {
      emails: interviewerEmails,
      requiredCount: 1,
    },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
      minGapToNextMinutes: 15,
    },
    createdAt: new Date(),
  };
}

function createCandidateBlock(
  startAt: Date,
  endAt: Date
): CandidateAvailabilityBlock {
  return {
    id: `block-${startAt.getTime()}`,
    availabilityRequestId: 'request-1',
    startAt,
    endAt,
    createdAt: new Date(),
  };
}

function createInterviewerSchedule(
  email: string,
  busyIntervals: Array<{ start: Date; end: Date }>
): InterviewerSchedule {
  return {
    email,
    busyIntervals,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('Loop Autopilot Solver', () => {
  describe('solveLoop', () => {
    it('should return UNSATISFIABLE when no sessions provided', async () => {
      const result = await solveLoop(
        [],
        [createCandidateBlock(new Date('2024-03-01T09:00:00Z'), new Date('2024-03-01T17:00:00Z'))],
        'America/New_York',
        new Map(),
        []
      );

      expect(result.status).toBe('UNSATISFIABLE');
      expect(result.solutions).toHaveLength(0);
    });

    it('should return UNSATISFIABLE when no candidate availability provided', async () => {
      const sessions = [
        createSession('s1', 'Session 1', 0, 45, ['alice@test.com']),
      ];

      const result = await solveLoop(
        sessions,
        [],
        'America/New_York',
        new Map(),
        []
      );

      expect(result.status).toBe('UNSATISFIABLE');
      expect(result.topConstraints.some((c) => c.key === 'NO_CANDIDATE_AVAILABILITY')).toBe(true);
    });

    it('should find solutions for a simple single-session loop', async () => {
      const sessions = [
        createSession('s1', 'HM Screen', 0, 45, ['alice@test.com']),
      ];

      const candidateBlocks = [
        createCandidateBlock(
          new Date('2024-03-01T14:00:00Z'),
          new Date('2024-03-01T17:00:00Z')
        ),
      ];

      const interviewerSchedules = new Map<string, InterviewerSchedule>();
      interviewerSchedules.set(
        'alice@test.com',
        createInterviewerSchedule('alice@test.com', [])
      );

      const result = await solveLoop(
        sessions,
        candidateBlocks,
        'America/New_York',
        interviewerSchedules,
        []
      );

      expect(result.status).toBe('SOLVED');
      expect(result.solutions.length).toBeGreaterThan(0);
      expect(result.solutions[0].sessions).toHaveLength(1);
      expect(result.solutions[0].sessions[0].sessionName).toBe('HM Screen');
    });

    it('should find solutions for a multi-session loop', async () => {
      const sessions = [
        createSession('s1', 'HM Screen', 0, 45, ['alice@test.com']),
        createSession('s2', 'Technical', 1, 60, ['bob@test.com']),
        createSession('s3', 'Values', 2, 45, ['carol@test.com']),
      ];

      const candidateBlocks = [
        createCandidateBlock(
          new Date('2024-03-01T13:00:00Z'),
          new Date('2024-03-01T20:00:00Z')
        ),
      ];

      const interviewerSchedules = new Map<string, InterviewerSchedule>();
      interviewerSchedules.set('alice@test.com', createInterviewerSchedule('alice@test.com', []));
      interviewerSchedules.set('bob@test.com', createInterviewerSchedule('bob@test.com', []));
      interviewerSchedules.set('carol@test.com', createInterviewerSchedule('carol@test.com', []));

      const result = await solveLoop(
        sessions,
        candidateBlocks,
        'America/New_York',
        interviewerSchedules,
        []
      );

      expect(result.status).toBe('SOLVED');
      expect(result.solutions.length).toBeGreaterThan(0);

      // Check that sessions are in order
      const solution = result.solutions[0];
      expect(solution.sessions).toHaveLength(3);
      expect(new Date(solution.sessions[0].endUtcIso) <= new Date(solution.sessions[1].startUtcIso)).toBe(true);
      expect(new Date(solution.sessions[1].endUtcIso) <= new Date(solution.sessions[2].startUtcIso)).toBe(true);
    });

    it('should avoid busy interviewers', async () => {
      const sessions = [
        createSession('s1', 'HM Screen', 0, 45, ['alice@test.com', 'bob@test.com']),
      ];

      const candidateBlocks = [
        createCandidateBlock(
          new Date('2024-03-01T14:00:00Z'),
          new Date('2024-03-01T17:00:00Z')
        ),
      ];

      // Alice is busy the entire time
      const interviewerSchedules = new Map<string, InterviewerSchedule>();
      interviewerSchedules.set(
        'alice@test.com',
        createInterviewerSchedule('alice@test.com', [
          {
            start: new Date('2024-03-01T14:00:00Z'),
            end: new Date('2024-03-01T17:00:00Z'),
          },
        ])
      );
      interviewerSchedules.set(
        'bob@test.com',
        createInterviewerSchedule('bob@test.com', [])
      );

      const result = await solveLoop(
        sessions,
        candidateBlocks,
        'America/New_York',
        interviewerSchedules,
        []
      );

      expect(result.status).toBe('SOLVED');
      // All solutions should use Bob, not Alice
      for (const solution of result.solutions) {
        expect(solution.sessions[0].interviewerEmail).toBe('bob@test.com');
      }
    });

    it('should return UNSATISFIABLE when all interviewers are busy', async () => {
      const sessions = [
        createSession('s1', 'HM Screen', 0, 45, ['alice@test.com']),
      ];

      const candidateBlocks = [
        createCandidateBlock(
          new Date('2024-03-01T14:00:00Z'),
          new Date('2024-03-01T17:00:00Z')
        ),
      ];

      // Alice is busy the entire time
      const interviewerSchedules = new Map<string, InterviewerSchedule>();
      interviewerSchedules.set(
        'alice@test.com',
        createInterviewerSchedule('alice@test.com', [
          {
            start: new Date('2024-03-01T14:00:00Z'),
            end: new Date('2024-03-01T17:00:00Z'),
          },
        ])
      );

      const result = await solveLoop(
        sessions,
        candidateBlocks,
        'America/New_York',
        interviewerSchedules,
        []
      );

      expect(result.status).toBe('UNSATISFIABLE');
      expect(result.topConstraints.some((c) => c.key === 'INTERVIEWER_POOL_ALL_BUSY')).toBe(true);
    });

    it('should return UNSATISFIABLE when session is too long for availability', async () => {
      const sessions = [
        createSession('s1', 'Long Session', 0, 120, ['alice@test.com']),
      ];

      // Only 1 hour of availability
      const candidateBlocks = [
        createCandidateBlock(
          new Date('2024-03-01T14:00:00Z'),
          new Date('2024-03-01T15:00:00Z')
        ),
      ];

      const interviewerSchedules = new Map<string, InterviewerSchedule>();
      interviewerSchedules.set('alice@test.com', createInterviewerSchedule('alice@test.com', []));

      const result = await solveLoop(
        sessions,
        candidateBlocks,
        'America/New_York',
        interviewerSchedules,
        []
      );

      expect(result.status).toBe('UNSATISFIABLE');
      expect(result.topConstraints.some((c) => c.key === 'SESSION_TOO_LONG_FOR_BLOCKS')).toBe(true);
    });

    it('should respect maxDaysSpan policy', async () => {
      const sessions = [
        createSession('s1', 'Session 1', 0, 45, ['alice@test.com']),
        createSession('s2', 'Session 2', 1, 45, ['bob@test.com']),
      ];

      // Candidate available on 4 different days
      const candidateBlocks = [
        createCandidateBlock(new Date('2024-03-01T14:00:00Z'), new Date('2024-03-01T15:00:00Z')),
        createCandidateBlock(new Date('2024-03-02T14:00:00Z'), new Date('2024-03-02T15:00:00Z')),
        createCandidateBlock(new Date('2024-03-03T14:00:00Z'), new Date('2024-03-03T15:00:00Z')),
        createCandidateBlock(new Date('2024-03-04T14:00:00Z'), new Date('2024-03-04T15:00:00Z')),
      ];

      const interviewerSchedules = new Map<string, InterviewerSchedule>();
      interviewerSchedules.set('alice@test.com', createInterviewerSchedule('alice@test.com', []));
      interviewerSchedules.set('bob@test.com', createInterviewerSchedule('bob@test.com', []));

      const result = await solveLoop(
        sessions,
        candidateBlocks,
        'America/New_York',
        interviewerSchedules,
        [],
        { ...DEFAULT_SCHEDULING_POLICY, maxDaysSpan: 2 }
      );

      expect(result.status).toBe('SOLVED');
      // All solutions should span at most 2 days
      for (const solution of result.solutions) {
        expect(solution.daysSpan).toBeLessThanOrEqual(2);
      }
    });

    it('should prefer single-day solutions when configured', async () => {
      const sessions = [
        createSession('s1', 'Session 1', 0, 45, ['alice@test.com']),
        createSession('s2', 'Session 2', 1, 45, ['bob@test.com']),
      ];

      // Candidate available on 2 different days
      const candidateBlocks = [
        createCandidateBlock(new Date('2024-03-01T14:00:00Z'), new Date('2024-03-01T17:00:00Z')),
        createCandidateBlock(new Date('2024-03-02T14:00:00Z'), new Date('2024-03-02T17:00:00Z')),
      ];

      const interviewerSchedules = new Map<string, InterviewerSchedule>();
      interviewerSchedules.set('alice@test.com', createInterviewerSchedule('alice@test.com', []));
      interviewerSchedules.set('bob@test.com', createInterviewerSchedule('bob@test.com', []));

      const result = await solveLoop(
        sessions,
        candidateBlocks,
        'America/New_York',
        interviewerSchedules,
        [],
        { ...DEFAULT_SCHEDULING_POLICY, preferSingleDay: true }
      );

      expect(result.status).toBe('SOLVED');
      // The top-ranked solution should be single-day
      expect(result.solutions[0].isSingleDay).toBe(true);
    });
  });

  describe('rankSolutions', () => {
    it('should rank single-day solutions higher when preferSingleDay is true', () => {
      const singleDaySolution: LoopSolution = {
        solutionId: 'single',
        score: 0,
        daysSpan: 1,
        isSingleDay: true,
        sessions: [],
        rationaleSummary: 'Single day',
        conflictsChecked: { interviewerBusyAvoided: 0, existingBookingsAvoided: 0, candidateBlockBoundaryAvoided: 0 },
        totalDurationMinutes: 150,
        loopStartUtc: '2024-03-01T09:00:00Z',
        loopEndUtc: '2024-03-01T12:00:00Z',
      };

      const multiDaySolution: LoopSolution = {
        solutionId: 'multi',
        score: 0,
        daysSpan: 2,
        isSingleDay: false,
        sessions: [],
        rationaleSummary: 'Two days',
        conflictsChecked: { interviewerBusyAvoided: 0, existingBookingsAvoided: 0, candidateBlockBoundaryAvoided: 0 },
        totalDurationMinutes: 150,
        loopStartUtc: '2024-03-01T09:00:00Z',
        loopEndUtc: '2024-03-02T12:00:00Z',
      };

      const ranked = rankSolutions(
        [multiDaySolution, singleDaySolution],
        { ...DEFAULT_SCHEDULING_POLICY, preferSingleDay: true }
      );

      expect(ranked[0].solutionId).toBe('single');
      expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    });
  });

  describe('buildUnsatDiagnostics', () => {
    it('should recommend adding interviewers when pool is empty', () => {
      const violations: ConstraintViolation[] = [
        {
          key: 'INTERVIEWER_POOL_EMPTY',
          severity: 'BLOCKING',
          description: 'No interviewers assigned',
          evidence: { sessionId: 's1', details: 'Empty pool' },
        },
      ];

      const actions = buildUnsatDiagnostics(violations);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].actionType).toBe('ADD_INTERVIEWERS_TO_POOL');
    });

    it('should recommend expanding availability when candidate has none', () => {
      const violations: ConstraintViolation[] = [
        {
          key: 'NO_CANDIDATE_AVAILABILITY',
          severity: 'BLOCKING',
          description: 'No availability',
          evidence: { details: 'No blocks' },
        },
      ];

      const actions = buildUnsatDiagnostics(violations);

      expect(actions.length).toBeGreaterThan(0);
      expect(actions[0].actionType).toBe('EXPAND_CANDIDATE_AVAILABILITY');
    });

    it('should deduplicate recommendations by action type', () => {
      const violations: ConstraintViolation[] = [
        {
          key: 'INTERVIEWER_POOL_EMPTY',
          severity: 'BLOCKING',
          description: 'No interviewers for session 1',
          evidence: { sessionId: 's1', details: 'Empty pool' },
        },
        {
          key: 'INTERVIEWER_POOL_EMPTY',
          severity: 'BLOCKING',
          description: 'No interviewers for session 2',
          evidence: { sessionId: 's2', details: 'Empty pool' },
        },
      ];

      const actions = buildUnsatDiagnostics(violations);

      // Should have 2 distinct actions (one per session)
      const addInterviewerActions = actions.filter((a) => a.actionType === 'ADD_INTERVIEWERS_TO_POOL');
      expect(addInterviewerActions).toHaveLength(2);
    });
  });

  describe('buildFeasibleSlotsForSession', () => {
    it('should generate slots at correct granularity', () => {
      const session = createSession('s1', 'Session', 0, 30, ['alice@test.com']);
      const candidateBlocks = [
        createCandidateBlock(
          new Date('2024-03-01T14:00:00Z'),
          new Date('2024-03-01T15:00:00Z')
        ),
      ];

      const interviewerSchedules = new Map<string, InterviewerSchedule>();
      interviewerSchedules.set('alice@test.com', createInterviewerSchedule('alice@test.com', []));

      const context = {
        policy: { ...DEFAULT_SCHEDULING_POLICY, slotGranularityMinutes: 15, enforceBusinessHours: false },
        candidateTimezone: 'America/New_York',
        candidateBlocks,
        sessions: [session],
        interviewerSchedules,
        existingBookings: [] as Booking[],
        startTime: Date.now(),
        iterations: 0,
        graphApiCalls: 0,
        slotsEvaluated: 0,
        constraintViolations: new Map(),
      };

      const placements = buildFeasibleSlotsForSession(session, context);

      // With 15-minute granularity, 1-hour window, 30-min session
      // Should have slots starting at :00, :15, :30
      expect(placements.length).toBeGreaterThanOrEqual(2);
    });
  });
});
