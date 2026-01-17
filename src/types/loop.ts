/**
 * Loop Autopilot Types
 *
 * Types for automated multi-session interview loop scheduling.
 */

import type { OrgMemberRole } from './organization';

// ============================================================================
// Loop Template Types
// ============================================================================

/**
 * A template defining the structure of an interview loop.
 */
export interface LoopTemplate {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

/**
 * A single session within a loop template.
 */
export interface LoopSessionTemplate {
  id: string;
  loopTemplateId: string;
  order: number;
  name: string;
  durationMinutes: number;
  interviewerPool: InterviewerPoolConfig;
  constraints: SessionConstraints;
  createdAt: Date;
}

export interface InterviewerPoolConfig {
  emails: string[];
  requiredCount: number;
  preferredTags?: string[];
}

export interface SessionConstraints {
  earliestStartLocal?: string; // "HH:MM" format, default "09:00"
  latestEndLocal?: string; // "HH:MM" format, default "17:00"
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  minGapToNextMinutes?: number;
}

// ============================================================================
// Scheduling Policy
// ============================================================================

export interface SchedulingPolicy {
  slotGranularityMinutes: number;
  maxSolutionsToReturn: number;
  preferSingleDay: boolean;
  maxDaysSpan: number;
  enforceBusinessHours: boolean;
  reorderSessionsAllowed: boolean;
  solverTimeoutMs: number;
  maxSearchIterations: number;
}

export const DEFAULT_SCHEDULING_POLICY: SchedulingPolicy = {
  slotGranularityMinutes: 15,
  maxSolutionsToReturn: 10,
  preferSingleDay: true,
  maxDaysSpan: 3,
  enforceBusinessHours: true,
  reorderSessionsAllowed: false,
  solverTimeoutMs: 10000,
  maxSearchIterations: 10000,
};

// ============================================================================
// Solve Request/Result Types
// ============================================================================

export interface LoopSolveRequest {
  availabilityRequestId: string;
  loopTemplateId: string;
  candidateTimezone: string;
  organizerEmail: string;
  interviewerPoolOverrides?: Record<string, InterviewerPoolConfig>;
  policyOverrides?: Partial<SchedulingPolicy>;
  solveIdempotencyKey?: string;
}

export type LoopSolveStatus =
  | 'SOLVED'
  | 'UNSATISFIABLE'
  | 'PARTIAL'
  | 'TIMEOUT'
  | 'ERROR';

export interface LoopSolveResult {
  solveId: string;
  status: LoopSolveStatus;
  solutions: LoopSolution[];
  topConstraints: ConstraintViolation[];
  recommendedActions: RecommendedAction[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  metadata: SolveMetadata;
}

export interface LoopSolution {
  solutionId: string;
  score: number;
  daysSpan: number;
  isSingleDay: boolean;
  sessions: ScheduledSession[];
  rationaleSummary: string;
  conflictsChecked: ConflictCheckSummary;
  totalDurationMinutes: number;
  loopStartUtc: string;
  loopEndUtc: string;
}

export interface ScheduledSession {
  sessionId: string;
  sessionName: string;
  startUtcIso: string;
  endUtcIso: string;
  interviewerEmail: string;
  reason: string;
  displayStart: string;
  displayEnd: string;
}

export interface ConflictCheckSummary {
  interviewerBusyAvoided: number;
  existingBookingsAvoided: number;
  candidateBlockBoundaryAvoided: number;
}

// ============================================================================
// Constraint Violations and Recommendations
// ============================================================================

export type ConstraintKey =
  | 'NO_CANDIDATE_AVAILABILITY'
  | 'INTERVIEWER_POOL_EMPTY'
  | 'INTERVIEWER_POOL_ALL_BUSY'
  | 'SESSION_TOO_LONG_FOR_BLOCKS'
  | 'INSUFFICIENT_GAP_BETWEEN_SESSIONS'
  | 'BUSINESS_HOURS_VIOLATION'
  | 'MAX_DAYS_EXCEEDED'
  | 'CONFLICTING_EXISTING_BOOKINGS';

export interface ConstraintViolation {
  key: ConstraintKey;
  severity: 'BLOCKING' | 'LIMITING' | 'MINOR';
  description: string;
  evidence: ConstraintEvidence;
}

export interface ConstraintEvidence {
  sessionId?: string;
  interviewerEmail?: string;
  timeRange?: { start: string; end: string };
  details: string;
}

export type ActionType =
  | 'EXPAND_CANDIDATE_AVAILABILITY'
  | 'ADD_INTERVIEWERS_TO_POOL'
  | 'REDUCE_SESSION_DURATION'
  | 'ALLOW_MULTI_DAY'
  | 'REMOVE_BUFFER_CONSTRAINTS'
  | 'EXTEND_BUSINESS_HOURS';

export interface RecommendedAction {
  actionType: ActionType;
  description: string;
  priority: number;
  payload: ActionPayload;
}

export interface ActionPayload {
  sessionId?: string;
  suggestedValue?: unknown;
  estimatedImpact: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface SolveMetadata {
  solveDurationMs: number;
  searchIterations: number;
  slotsEvaluated: number;
  graphApiCalls: number;
  timedOut: boolean;
  iterationLimitReached: boolean;
}

// ============================================================================
// Solve Run (Persisted)
// ============================================================================

export interface LoopSolveRun {
  id: string;
  organizationId: string;
  availabilityRequestId: string;
  loopTemplateId: string;
  inputsSnapshot: LoopSolveRequest;
  status: LoopSolveStatus;
  resultSnapshot: LoopSolveResult | null;
  solutionsCount: number;
  solveDurationMs: number | null;
  searchIterations: number | null;
  graphApiCalls: number | null;
  errorMessage: string | null;
  errorStack: string | null;
  createdAt: Date;
  solveIdempotencyKey: string | null;
}

// ============================================================================
// Loop Booking Types
// ============================================================================

export type LoopBookingStatus = 'PENDING' | 'COMMITTED' | 'FAILED' | 'CANCELLED';

export interface LoopBooking {
  id: string;
  organizationId: string;
  availabilityRequestId: string;
  loopTemplateId: string;
  solveRunId: string;
  chosenSolutionId: string;
  status: LoopBookingStatus;
  rollbackAttempted: boolean;
  rollbackDetails: RollbackDetails | null;
  errorMessage: string | null;
  commitIdempotencyKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RollbackDetails {
  eventsCreated: number;
  eventsRolledBack: number;
  rollbackErrors: string[];
}

export interface LoopBookingItem {
  id: string;
  loopBookingId: string;
  sessionTemplateId: string;
  bookingId: string;
  calendarEventId: string;
  status: 'confirmed' | 'cancelled' | 'rescheduled';
  createdAt: Date;
}

// ============================================================================
// Commit Request/Result
// ============================================================================

export interface LoopCommitRequest {
  solveId: string;
  solutionId: string;
  commitIdempotencyKey: string;
  organizerEmail?: string;
  meetingDetails?: {
    title?: string;
    bodyTemplate?: string;
    includeTeamsLink?: boolean;
  };
}

export interface LoopCommitResult {
  status: 'COMMITTED' | 'ALREADY_COMMITTED' | 'FAILED';
  loopBookingId: string;
  bookedSessions?: BookedSessionInfo[];
  errorMessage?: string;
}

export interface BookedSessionInfo {
  sessionId: string;
  sessionName: string;
  bookingId: string;
  calendarEventId: string;
  startUtcIso: string;
  endUtcIso: string;
  interviewerEmail: string;
}

// ============================================================================
// Template with Sessions (for API responses)
// ============================================================================

export interface LoopTemplateWithSessions extends LoopTemplate {
  sessions: LoopSessionTemplate[];
}

// ============================================================================
// Input types for creation
// ============================================================================

export interface CreateLoopTemplateInput {
  organizationId: string;
  name: string;
  description?: string;
  createdBy: string;
}

export interface CreateLoopSessionTemplateInput {
  loopTemplateId: string;
  order: number;
  name: string;
  durationMinutes: number;
  interviewerPool: InterviewerPoolConfig;
  constraints?: SessionConstraints;
}

export interface CreateLoopSolveRunInput {
  organizationId: string;
  availabilityRequestId: string;
  loopTemplateId: string;
  inputsSnapshot: LoopSolveRequest;
  solveIdempotencyKey?: string;
}

export interface CreateLoopBookingInput {
  organizationId: string;
  availabilityRequestId: string;
  loopTemplateId: string;
  solveRunId: string;
  chosenSolutionId: string;
  commitIdempotencyKey: string;
}

export interface CreateLoopBookingItemInput {
  loopBookingId: string;
  sessionTemplateId: string;
  bookingId: string;
  calendarEventId: string;
}
