# Loop Autopilot V1

Planning document for automated multi-session interview loop scheduling.

---

## 1. Problem Definition and Scope

### What is Loop Autopilot?

Loop Autopilot automatically schedules an entire interview loop (multiple sessions) within candidate availability windows. It uses deterministic constraint solving to find optimal schedules and provides explainable outputs for coordinators.

### V1 Scope

**In Scope:**
- Same-day or multi-session loop scheduling using candidate availability blocks
- 2–6 sessions per loop
- Single day preferred, may spill to multiple days if needed (max 3 days)
- Deterministic constraint solver (no LLM)
- Explainable outputs with rationale for each solution
- Fix recommendations when scheduling is impossible
- Integration with existing booking flow (Graph API + iCIMS writeback)

**Out of Scope (Future Versions):**
- Panel interviews requiring simultaneous interviewers
- Multi-location travel constraints
- Complex interviewer preferences beyond time windows
- Cross-timezone interviewer coordination
- LLM-powered natural language scheduling
- Automated interviewer pool optimization

### Relationship to Existing System

```
┌─────────────────────────────────────────────────────────────────┐
│                    Existing System                               │
├─────────────────────────────────────────────────────────────────┤
│  CandidateAvailabilityBlock  →  suggestionService  →  Booking   │
│       (single session)             (ranked slots)     (1 event) │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    Loop Autopilot V1                             │
├─────────────────────────────────────────────────────────────────┤
│  CandidateAvailabilityBlock  →  LoopSolver  →  LoopBooking      │
│       (same blocks)           (constraint     (N events,        │
│                                 solving)       linked)          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Input Contract (Types)

### LoopTemplate

Defines a reusable interview loop structure.

```typescript
/**
 * A template defining the structure of an interview loop.
 * Organizations create templates for common interview patterns.
 */
export interface LoopTemplate {
  id: string;
  organizationId: string;
  name: string;
  description?: string;

  /** Ordered list of sessions in this loop */
  sessions: LoopSessionTemplate[];

  /** Default policy for this template */
  defaultPolicy: SchedulingPolicy;

  /** Whether this template is active */
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

  /** Display order (0-indexed) */
  order: number;

  /** Human-readable name (e.g., 'HM Screen', 'Tech 1', 'Values') */
  name: string;

  /** Duration in minutes */
  durationMinutes: number;

  /** Pool of interviewers who can conduct this session */
  interviewerPool: InterviewerPoolConfig;

  /** Time and buffer constraints */
  constraints: SessionConstraints;
}

export interface InterviewerPoolConfig {
  /** Email addresses of eligible interviewers */
  emails: string[];

  /** Number of interviewers needed (default 1, future: support panels) */
  requiredCount: 1;

  /** Optional: prefer interviewers with specific tags */
  preferredTags?: string[];
}

export interface SessionConstraints {
  /** Earliest start time in local time (HH:MM, default "09:00") */
  earliestStartLocal?: string;

  /** Latest end time in local time (HH:MM, default "17:00") */
  latestEndLocal?: string;

  /** Buffer before this session starts (default 0) */
  bufferBeforeMinutes?: number;

  /** Buffer after this session ends (default 0) */
  bufferAfterMinutes?: number;

  /** Minimum gap between this session and the next (default 0) */
  minGapToNextMinutes?: number;
}
```

### CandidateAvailability

Maps directly to existing `CandidateAvailabilityBlock` model.

```typescript
/**
 * Candidate's submitted availability.
 * Reuses existing CandidateAvailabilityBlock from scheduling.ts
 */
export interface CandidateAvailability {
  /** Blocks of time the candidate is available */
  blocks: Array<{
    startUtcIso: string;
    endUtcIso: string;
  }>;

  /** Candidate's timezone for display */
  timezone: string;
}
```

### SchedulingPolicy

Configuration for how the solver should behave.

```typescript
/**
 * Policy configuration for loop solving.
 */
export interface SchedulingPolicy {
  /** Granularity of slot search (default 15 minutes) */
  slotGranularityMinutes: number;

  /** Maximum solutions to return (default 10) */
  maxSolutionsToReturn: number;

  /** Prefer keeping all sessions on same day (default true) */
  preferSingleDay: boolean;

  /** Maximum days the loop can span (default 3) */
  maxDaysSpan: number;

  /** Enforce business hours per session constraints (default true) */
  enforceBusinessHours: boolean;

  /** Allow reordering sessions if it helps find solutions (default false in V1) */
  reorderSessionsAllowed: boolean;

  /** Timeout for solver in milliseconds (default 10000) */
  solverTimeoutMs: number;

  /** Maximum search depth before giving up (default 10000 iterations) */
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
```

### LoopSolveRequest

The complete input to the solver.

```typescript
/**
 * Request to generate loop scheduling solutions.
 */
export interface LoopSolveRequest {
  /** The availability request containing candidate blocks */
  availabilityRequestId: string;

  /** The loop template to use */
  loopTemplateId: string;

  /** Candidate's timezone */
  candidateTimezone: string;

  /** Email of the organizer (for calendar events) */
  organizerEmail: string;

  /** Override interviewer pools per session (optional) */
  interviewerPoolOverrides?: Record<string, InterviewerPoolConfig>;

  /** Override scheduling policy (optional) */
  policyOverrides?: Partial<SchedulingPolicy>;

  /** Unique key for idempotent solving */
  solveIdempotencyKey?: string;
}
```

### Mapping to Existing Models

| New Type | Maps To | Notes |
|----------|---------|-------|
| `CandidateAvailability.blocks` | `CandidateAvailabilityBlock[]` | Direct mapping, blocks already in UTC |
| `InterviewerPoolConfig.emails` | `SchedulingRequest.interviewerEmails` | Same concept, expanded to pools |
| `SessionConstraints.earliestStartLocal` | `SlotGenerationService` working hours | Similar concept |
| `SchedulingPolicy.slotGranularityMinutes` | `SlotGenerationService.SLOT_INCREMENT` | Currently hardcoded to 15 |

---

## 3. Output Contract (Explainable)

### LoopSolveResult

The complete output from the solver.

```typescript
/**
 * Result of a loop solve operation.
 */
export interface LoopSolveResult {
  /** Unique ID for this solve run */
  solveId: string;

  /** Overall status of the solve */
  status: 'SOLVED' | 'UNSATISFIABLE' | 'PARTIAL' | 'TIMEOUT' | 'ERROR';

  /** Ranked solutions (empty if UNSATISFIABLE) */
  solutions: LoopSolution[];

  /** Top constraints that limited solutions */
  topConstraints: ConstraintViolation[];

  /** Recommended actions to expand solution space */
  recommendedActions: RecommendedAction[];

  /** Confidence level based on solution quality */
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';

  /** Solver execution metadata */
  metadata: SolveMetadata;
}

export type LoopSolveStatus =
  | 'SOLVED'        // Found at least one complete solution
  | 'UNSATISFIABLE' // No valid solution exists with current constraints
  | 'PARTIAL'       // Found partial solutions (some sessions couldn't be placed)
  | 'TIMEOUT'       // Solver exceeded time limit
  | 'ERROR';        // Solver encountered an error
```

### LoopSolution

A single complete solution.

```typescript
/**
 * A single valid loop schedule.
 */
export interface LoopSolution {
  /** Unique ID for this solution */
  solutionId: string;

  /** Numeric score for ranking (higher is better) */
  score: number;

  /** Number of calendar days this solution spans */
  daysSpan: number;

  /** Whether all sessions are on the same day */
  isSingleDay: boolean;

  /** Ordered list of scheduled sessions */
  sessions: ScheduledSession[];

  /** Human-readable summary of why this solution works */
  rationaleSummary: string;

  /** Conflicts that were checked and avoided */
  conflictsChecked: ConflictCheckSummary;

  /** Total duration including gaps */
  totalDurationMinutes: number;

  /** Start and end of the entire loop */
  loopStartUtc: string;
  loopEndUtc: string;
}

export interface ScheduledSession {
  /** Session template ID */
  sessionId: string;

  /** Session name for display */
  sessionName: string;

  /** Scheduled start time (UTC ISO) */
  startUtcIso: string;

  /** Scheduled end time (UTC ISO) */
  endUtcIso: string;

  /** Assigned interviewer email */
  interviewerEmail: string;

  /** Why this interviewer/time was chosen */
  reason: string;

  /** Display times in candidate timezone */
  displayStart: string;
  displayEnd: string;
}

export interface ConflictCheckSummary {
  /** Number of interviewer busy conflicts avoided */
  interviewerBusyAvoided: number;

  /** Number of existing booking conflicts avoided */
  existingBookingsAvoided: number;

  /** Number of candidate block boundary conflicts avoided */
  candidateBlockBoundaryAvoided: number;
}
```

### Constraint Violations and Recommendations

```typescript
/**
 * A constraint that limited or blocked solutions.
 */
export interface ConstraintViolation {
  /** Unique key identifying the constraint type */
  key: ConstraintKey;

  /** Severity level */
  severity: 'BLOCKING' | 'LIMITING' | 'MINOR';

  /** Human-readable description */
  description: string;

  /** Evidence supporting this constraint violation */
  evidence: ConstraintEvidence;
}

export type ConstraintKey =
  | 'NO_CANDIDATE_AVAILABILITY'
  | 'INTERVIEWER_POOL_EMPTY'
  | 'INTERVIEWER_POOL_ALL_BUSY'
  | 'SESSION_TOO_LONG_FOR_BLOCKS'
  | 'INSUFFICIENT_GAP_BETWEEN_SESSIONS'
  | 'BUSINESS_HOURS_VIOLATION'
  | 'MAX_DAYS_EXCEEDED'
  | 'CONFLICTING_EXISTING_BOOKINGS';

export interface ConstraintEvidence {
  /** Session ID if applicable */
  sessionId?: string;

  /** Interviewer email if applicable */
  interviewerEmail?: string;

  /** Time range if applicable */
  timeRange?: { start: string; end: string };

  /** Additional context */
  details: string;
}

/**
 * Recommended action to resolve constraints.
 */
export interface RecommendedAction {
  /** Type of action */
  actionType: ActionType;

  /** Human-readable description */
  description: string;

  /** Priority (1 = highest) */
  priority: number;

  /** Payload for implementing the action */
  payload: ActionPayload;
}

export type ActionType =
  | 'EXPAND_CANDIDATE_AVAILABILITY'
  | 'ADD_INTERVIEWERS_TO_POOL'
  | 'REDUCE_SESSION_DURATION'
  | 'ALLOW_MULTI_DAY'
  | 'REMOVE_BUFFER_CONSTRAINTS'
  | 'EXTEND_BUSINESS_HOURS';

export interface ActionPayload {
  /** Session ID to modify */
  sessionId?: string;

  /** Suggested new value */
  suggestedValue?: unknown;

  /** Estimated improvement if action taken */
  estimatedImpact: 'HIGH' | 'MEDIUM' | 'LOW';
}
```

### Solve Metadata

```typescript
/**
 * Metadata about the solve operation.
 */
export interface SolveMetadata {
  /** Time spent solving (ms) */
  solveDurationMs: number;

  /** Number of search iterations */
  searchIterations: number;

  /** Number of candidate slots evaluated */
  slotsEvaluated: number;

  /** Number of Graph API calls made */
  graphApiCalls: number;

  /** Whether solver hit timeout */
  timedOut: boolean;

  /** Whether solver hit iteration limit */
  iterationLimitReached: boolean;
}
```

---

## 4. Deterministic Solver Design (V1)

### Approach: Constraint Propagation + Backtracking

The V1 solver uses a hybrid approach:
1. **Pre-computation**: Generate all feasible slots per session
2. **Constraint Propagation**: Prune infeasible combinations
3. **Backtracking Search**: Find valid complete solutions
4. **Ranking**: Score and sort solutions

### Algorithm Overview

```
SOLVE(request):
  1. Load candidate availability blocks
  2. Load loop template and sessions
  3. Fetch interviewer availability for all pools (Graph API)
  4. Pre-compute feasible slots per session
  5. If any session has no feasible slots:
     → Return UNSATISFIABLE with constraint violations
  6. Run backtracking search for valid solutions
  7. Rank and return top N solutions
```

### Step 1: Candidate Block Processing

Convert candidate availability blocks into a 15-minute slot grid:

```
Input: blocks = [{ start: "2024-01-15T14:00:00Z", end: "2024-01-15T17:00:00Z" }]
Output: candidateSlots = [
  { start: "2024-01-15T14:00:00Z", end: "2024-01-15T14:15:00Z" },
  { start: "2024-01-15T14:15:00Z", end: "2024-01-15T14:30:00Z" },
  ... (12 slots total)
]
```

Reuses existing `availabilityBlocks.ts` utilities:
- `normalizeBlocks()` - merge overlapping blocks
- `mergeAdjacent()` - combine adjacent blocks
- `snapToInterval()` - align to 15-minute grid

### Step 2: Interviewer Availability Fetching

For each session's interviewer pool:

```
FOR each session IN template.sessions:
  FOR each interviewer IN session.interviewerPool.emails:
    schedule = graphClient.getSchedule(
      [interviewer],
      windowStart,  // First candidate block start
      windowEnd,    // Last candidate block end
      15            // Slot interval
    )
    busyIntervals[session.id][interviewer] = schedule.busySlots
```

This reuses the existing `GraphCalendarClient.getSchedule()` method.

### Step 3: Conflict Checking

For each potential session placement:

```typescript
function isSessionPlacementValid(
  session: LoopSessionTemplate,
  startTime: Date,
  endTime: Date,
  interviewer: string,
  busyIntervals: BusyInterval[],
  existingBookings: Booking[]
): ConflictCheckResult {

  // Check 1: Interviewer busy in Graph calendar
  for (const busy of busyIntervals) {
    if (overlaps(startTime, endTime, busy.start, busy.end)) {
      return { valid: false, reason: 'INTERVIEWER_BUSY' };
    }
  }

  // Check 2: Existing bookings in our database
  for (const booking of existingBookings) {
    if (booking.interviewerEmail === interviewer &&
        overlaps(startTime, endTime, booking.startTime, booking.endTime)) {
      return { valid: false, reason: 'EXISTING_BOOKING' };
    }
  }

  // Check 3: Session constraints (business hours)
  if (!isWithinBusinessHours(startTime, endTime, session.constraints)) {
    return { valid: false, reason: 'OUTSIDE_BUSINESS_HOURS' };
  }

  return { valid: true };
}
```

### Step 4: Feasible Slot Pre-computation

For each session, compute all valid (slot, interviewer) pairs:

```typescript
interface FeasiblePlacement {
  sessionId: string;
  startTime: Date;
  endTime: Date;
  interviewerEmail: string;
  score: number;
}

function computeFeasiblePlacements(
  session: LoopSessionTemplate,
  candidateSlots: Slot[],
  interviewerBusy: Map<string, BusyInterval[]>,
  existingBookings: Booking[]
): FeasiblePlacement[] {
  const placements: FeasiblePlacement[] = [];

  for (const slot of candidateSlots) {
    // Can this session start at this slot?
    const sessionEnd = addMinutes(slot.start, session.durationMinutes);

    // Check if session fits in candidate availability
    if (!isWithinCandidateBlocks(slot.start, sessionEnd, candidateBlocks)) {
      continue;
    }

    // Try each interviewer
    for (const email of session.interviewerPool.emails) {
      const result = isSessionPlacementValid(
        session, slot.start, sessionEnd, email,
        interviewerBusy.get(email) || [],
        existingBookings
      );

      if (result.valid) {
        placements.push({
          sessionId: session.id,
          startTime: slot.start,
          endTime: sessionEnd,
          interviewerEmail: email,
          score: computePlacementScore(slot, email)
        });
      }
    }
  }

  return placements.sort((a, b) => b.score - a.score);
}
```

### Step 5: Backtracking Search

Find valid complete solutions:

```typescript
interface PartialSolution {
  placedSessions: ScheduledSession[];
  remainingSessions: string[];
  lastEndTime: Date | null;
  lastDay: string | null;
  usedInterviewers: Set<string>;
  daysUsed: Set<string>;
}

function search(
  partial: PartialSolution,
  feasibleBySession: Map<string, FeasiblePlacement[]>,
  solutions: LoopSolution[],
  iterations: { count: number },
  limits: { maxIterations: number; maxSolutions: number }
): void {

  // Check limits
  if (iterations.count++ > limits.maxIterations) return;
  if (solutions.length >= limits.maxSolutions) return;

  // Base case: all sessions placed
  if (partial.remainingSessions.length === 0) {
    solutions.push(buildSolution(partial));
    return;
  }

  // Get next session to place
  const sessionId = partial.remainingSessions[0];
  const placements = feasibleBySession.get(sessionId) || [];

  for (const placement of placements) {
    // Check sequential constraint: must start after previous session + gap
    if (partial.lastEndTime) {
      const minStart = addMinutes(partial.lastEndTime, getGapMinutes(sessionId));
      if (placement.startTime < minStart) continue;
    }

    // Check max days constraint
    const placementDay = toDateString(placement.startTime);
    if (!partial.daysUsed.has(placementDay) &&
        partial.daysUsed.size >= policy.maxDaysSpan) {
      continue;
    }

    // Place session and recurse
    const newPartial = {
      placedSessions: [...partial.placedSessions, toScheduledSession(placement)],
      remainingSessions: partial.remainingSessions.slice(1),
      lastEndTime: placement.endTime,
      lastDay: placementDay,
      usedInterviewers: new Set([...partial.usedInterviewers, placement.interviewerEmail]),
      daysUsed: new Set([...partial.daysUsed, placementDay])
    };

    search(newPartial, feasibleBySession, solutions, iterations, limits);
  }
}
```

### Step 6: Solution Ranking

Score each solution with weighted factors:

```typescript
function scoreSolution(solution: LoopSolution, policy: SchedulingPolicy): number {
  let score = 0;

  // Factor 1: Single day preference (50 points)
  if (policy.preferSingleDay && solution.isSingleDay) {
    score += 50;
  } else {
    score += Math.max(0, 50 - (solution.daysSpan - 1) * 20);
  }

  // Factor 2: Earliest completion (30 points)
  // Normalize to 0-30 based on how early the loop ends
  const completionScore = computeEarlinessScore(solution.loopEndUtc);
  score += completionScore * 30;

  // Factor 3: Fewer distinct interviewers (10 points)
  // Prefer solutions that reuse interviewers less (fresher perspectives)
  const uniqueInterviewers = new Set(solution.sessions.map(s => s.interviewerEmail)).size;
  score += uniqueInterviewers * 2; // Reward diversity

  // Factor 4: Lower interviewer load (10 points)
  // Prefer interviewers with more capacity headroom
  const loadScore = computeLoadBalanceScore(solution.sessions);
  score += loadScore * 10;

  return score;
}
```

### Complexity Limits

| Limit | Value | Rationale |
|-------|-------|-----------|
| Max search iterations | 10,000 | Prevent runaway computation |
| Solver timeout | 10 seconds | UX responsiveness |
| Max solutions returned | 10 | UI display limit |
| Max sessions per loop | 6 | V1 scope limit |
| Max days span | 3 | Practical interview window |

### Fail-Closed Behavior

When no solution is found:

```typescript
function buildUnsatisfiableResult(
  constraints: ConstraintViolation[]
): LoopSolveResult {
  return {
    status: 'UNSATISFIABLE',
    solutions: [],
    topConstraints: constraints.slice(0, 5),
    recommendedActions: generateRecommendations(constraints),
    confidence: 'HIGH', // High confidence that it's truly unsatisfiable
    metadata: { ... }
  };
}

function generateRecommendations(constraints: ConstraintViolation[]): RecommendedAction[] {
  const actions: RecommendedAction[] = [];

  for (const constraint of constraints) {
    switch (constraint.key) {
      case 'INTERVIEWER_POOL_ALL_BUSY':
        actions.push({
          actionType: 'ADD_INTERVIEWERS_TO_POOL',
          description: `Add more interviewers to ${constraint.evidence.sessionId} pool`,
          priority: 1,
          payload: { sessionId: constraint.evidence.sessionId, estimatedImpact: 'HIGH' }
        });
        break;

      case 'NO_CANDIDATE_AVAILABILITY':
        actions.push({
          actionType: 'EXPAND_CANDIDATE_AVAILABILITY',
          description: 'Ask candidate to provide more availability',
          priority: 1,
          payload: { estimatedImpact: 'HIGH' }
        });
        break;

      // ... other cases
    }
  }

  return actions.sort((a, b) => a.priority - b.priority);
}
```

---

## 5. Booking Flow (Autopilot Commit)

### Two-Phase Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Phase A: SOLVE                                                  │
│                                                                  │
│  Input: LoopSolveRequest                                         │
│    ↓                                                             │
│  [Solver]                                                        │
│    ↓                                                             │
│  Output: LoopSolveResult (solutions, no side effects)            │
│                                                                  │
│  ► Coordinator reviews solutions                                 │
│  ► Coordinator selects one                                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  Phase B: COMMIT                                                 │
│                                                                  │
│  Input: LoopCommitRequest (solutionId, idempotencyKey)           │
│    ↓                                                             │
│  [Commit Service]                                                │
│    ↓                                                             │
│  Creates: Calendar events, Bookings, LoopBooking, Sync jobs      │
└─────────────────────────────────────────────────────────────────┘
```

### Commit Request

```typescript
export interface LoopCommitRequest {
  /** The solve run ID */
  solveId: string;

  /** The chosen solution ID */
  solutionId: string;

  /** Unique key for idempotent commit */
  commitIdempotencyKey: string;

  /** Optional: override organizer email */
  organizerEmail?: string;

  /** Optional: custom meeting details */
  meetingDetails?: {
    title?: string;
    bodyTemplate?: string;
    includeTeamsLink?: boolean;
  };
}
```

### Commit Behavior

```typescript
async function commitLoopSolution(
  request: LoopCommitRequest
): Promise<LoopCommitResult> {

  // 1. Check idempotency
  const existing = await getLoopBookingByIdempotencyKey(request.commitIdempotencyKey);
  if (existing) {
    return { status: 'ALREADY_COMMITTED', loopBookingId: existing.id };
  }

  // 2. Load solve result and solution
  const solveRun = await getLoopSolveRun(request.solveId);
  const solution = solveRun.result.solutions.find(s => s.solutionId === request.solutionId);
  if (!solution) {
    throw new Error('Solution not found');
  }

  // 3. Create LoopBooking record (pending)
  const loopBooking = await createLoopBooking({
    solveRunId: request.solveId,
    solutionId: request.solutionId,
    status: 'PENDING',
    commitIdempotencyKey: request.commitIdempotencyKey,
  });

  // 4. Create calendar events for each session
  const createdEvents: { sessionId: string; eventId: string }[] = [];

  try {
    for (const session of solution.sessions) {
      const event = await graphClient.createEvent(
        request.organizerEmail || solution.organizerEmail,
        {
          subject: buildEventSubject(session),
          start: session.startUtcIso,
          end: session.endUtcIso,
          attendees: [session.interviewerEmail, candidateEmail],
          body: buildEventBody(session, request.meetingDetails),
          isOnlineMeeting: request.meetingDetails?.includeTeamsLink ?? true,
        }
      );

      createdEvents.push({ sessionId: session.sessionId, eventId: event.id });

      // Create Booking record
      await createBooking({
        loopBookingId: loopBooking.id,
        sessionId: session.sessionId,
        calendarEventId: event.id,
        interviewerEmail: session.interviewerEmail,
        scheduledStart: session.startUtcIso,
        scheduledEnd: session.endUtcIso,
        status: 'confirmed',
      });

      // Create LoopBookingItem linking record
      await createLoopBookingItem({
        loopBookingId: loopBooking.id,
        sessionId: session.sessionId,
        bookingId: booking.id,
        calendarEventId: event.id,
      });
    }

    // 5. Update LoopBooking status to COMMITTED
    await updateLoopBookingStatus(loopBooking.id, 'COMMITTED');

    // 6. Enqueue iCIMS sync jobs (non-blocking)
    for (const session of solution.sessions) {
      await enqueueSyncJob({
        type: 'icims_note',
        bookingId: session.bookingId,
        action: 'loop_booked',
      });
    }

    // 7. Enqueue notifications
    await enqueueNotification({
      type: 'loop_booking_confirmation',
      loopBookingId: loopBooking.id,
      recipientEmail: candidateEmail,
    });

    return { status: 'COMMITTED', loopBookingId: loopBooking.id };

  } catch (error) {
    // Rollback: cancel any created events
    for (const created of createdEvents) {
      try {
        await graphClient.cancelEvent(
          request.organizerEmail,
          created.eventId,
          'Booking failed - automatic rollback'
        );
      } catch (rollbackError) {
        console.error(`Failed to rollback event ${created.eventId}:`, rollbackError);
      }
    }

    // Mark loop booking as failed
    await updateLoopBookingStatus(loopBooking.id, 'FAILED', {
      errorMessage: error.message,
      rollbackAttempted: true,
      eventsRolledBack: createdEvents.length,
    });

    throw error;
  }
}
```

### Idempotency

```typescript
// Commit idempotency key format
const commitIdempotencyKey = `loop-commit:${solveId}:${solutionId}:${timestamp}`;

// Check before commit
async function isAlreadyCommitted(key: string): Promise<boolean> {
  const existing = await db.loopBookings.findByIdempotencyKey(key);
  return existing !== null && existing.status === 'COMMITTED';
}
```

---

## 6. Data Model Additions

### Database Schema

```sql
-- Loop Templates
CREATE TABLE loop_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  default_policy JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),

  CONSTRAINT unique_template_name_per_org UNIQUE (organization_id, name)
);

-- Loop Session Templates
CREATE TABLE loop_session_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_template_id UUID NOT NULL REFERENCES loop_templates(id) ON DELETE CASCADE,
  "order" INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  duration_minutes INTEGER NOT NULL,
  interviewer_pool JSONB NOT NULL, -- { emails: string[], requiredCount: 1 }
  constraints JSONB NOT NULL DEFAULT '{}', -- SessionConstraints
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_session_order UNIQUE (loop_template_id, "order"),
  CONSTRAINT valid_duration CHECK (duration_minutes > 0 AND duration_minutes <= 480)
);

-- Loop Solve Runs
CREATE TABLE loop_solve_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  availability_request_id UUID NOT NULL REFERENCES availability_requests(id),
  loop_template_id UUID NOT NULL REFERENCES loop_templates(id),

  -- Input snapshot (for audit and debugging)
  inputs_snapshot JSONB NOT NULL,

  -- Result
  status VARCHAR(50) NOT NULL, -- SOLVED, UNSATISFIABLE, PARTIAL, TIMEOUT, ERROR
  result_snapshot JSONB, -- LoopSolveResult (without solutions if too large)
  solutions_count INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  solve_duration_ms INTEGER,
  search_iterations INTEGER,
  graph_api_calls INTEGER,

  -- Error tracking
  error_message TEXT,
  error_stack TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  solve_idempotency_key VARCHAR(255),

  CONSTRAINT unique_solve_idempotency UNIQUE (solve_idempotency_key)
);

-- Loop Bookings
CREATE TABLE loop_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  availability_request_id UUID NOT NULL REFERENCES availability_requests(id),
  loop_template_id UUID NOT NULL REFERENCES loop_templates(id),
  solve_run_id UUID NOT NULL REFERENCES loop_solve_runs(id),
  chosen_solution_id VARCHAR(255) NOT NULL,

  status VARCHAR(50) NOT NULL, -- PENDING, COMMITTED, FAILED, CANCELLED

  -- Rollback tracking
  rollback_attempted BOOLEAN DEFAULT false,
  rollback_details JSONB,

  -- Error tracking
  error_message TEXT,

  commit_idempotency_key VARCHAR(255) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_commit_idempotency UNIQUE (commit_idempotency_key)
);

-- Loop Booking Items (links sessions to bookings)
CREATE TABLE loop_booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_booking_id UUID NOT NULL REFERENCES loop_bookings(id) ON DELETE CASCADE,
  session_template_id UUID NOT NULL REFERENCES loop_session_templates(id),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  calendar_event_id VARCHAR(255) NOT NULL,

  -- Session-specific status
  status VARCHAR(50) NOT NULL DEFAULT 'confirmed', -- confirmed, cancelled, rescheduled

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT unique_session_per_loop UNIQUE (loop_booking_id, session_template_id)
);

-- Indexes
CREATE INDEX idx_loop_templates_org ON loop_templates(organization_id);
CREATE INDEX idx_loop_session_templates_template ON loop_session_templates(loop_template_id);
CREATE INDEX idx_loop_solve_runs_availability ON loop_solve_runs(availability_request_id);
CREATE INDEX idx_loop_solve_runs_org_created ON loop_solve_runs(organization_id, created_at DESC);
CREATE INDEX idx_loop_bookings_availability ON loop_bookings(availability_request_id);
CREATE INDEX idx_loop_bookings_status ON loop_bookings(status);
CREATE INDEX idx_loop_booking_items_booking ON loop_booking_items(booking_id);
```

### TypeScript Model Mapping

```typescript
// Existing model extension
interface Booking {
  // ... existing fields
  loopBookingId?: string; // New: link to loop booking
}

// New models (added to src/types/loop.ts)
export interface LoopTemplate { ... }
export interface LoopSessionTemplate { ... }
export interface LoopSolveRun { ... }
export interface LoopBooking { ... }
export interface LoopBookingItem { ... }
```

---

## 7. UI Spec (Coordinator)

### Availability Request Detail Page Enhancement

```
┌─────────────────────────────────────────────────────────────────┐
│  Availability Request: Jane Doe - Senior Engineer               │
│  Status: SUBMITTED                                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Candidate Availability:                                         │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  Mon Jan 15: 9:00 AM - 12:00 PM, 2:00 PM - 5:00 PM          ││
│  │  Tue Jan 16: 10:00 AM - 4:00 PM                             ││
│  │  Wed Jan 17: 9:00 AM - 5:00 PM                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  🔄 LOOP AUTOPILOT                                        │   │
│  │                                                            │   │
│  │  Template: [Senior Engineer Interview Loop      ▼]        │   │
│  │                                                            │   │
│  │  Sessions:                                                 │   │
│  │  1. HM Screen (45 min) - 3 interviewers available         │   │
│  │  2. Tech Deep Dive (60 min) - 5 interviewers available    │   │
│  │  3. Values Interview (45 min) - 4 interviewers available  │   │
│  │  4. Final HM (30 min) - 2 interviewers available          │   │
│  │                                                            │   │
│  │  [ Generate Loop Options ]                                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Solution Display

```
┌─────────────────────────────────────────────────────────────────┐
│  Loop Options Found: 5 solutions                                 │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ⭐ OPTION 1 (Recommended)                Score: 95       │  │
│  │  Single Day: Monday Jan 15                                 │  │
│  │                                                            │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │ 9:00 AM  │ HM Screen      │ alice@co.com           │  │  │
│  │  │ 10:00 AM │ Tech Deep Dive │ bob@co.com             │  │  │
│  │  │ 11:15 AM │ Values         │ carol@co.com           │  │  │
│  │  │ 12:15 PM │ Final HM       │ alice@co.com           │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  │                                                            │  │
│  │  ✓ Why this works:                                        │  │
│  │    - All sessions fit in a single day                     │  │
│  │    - Interviewers have low current load                   │  │
│  │    - Natural breaks between sessions                      │  │
│  │                                                            │  │
│  │  ⚠ What might break:                                      │  │
│  │    - Bob has a meeting at 11:30 AM that could extend      │  │
│  │                                                            │  │
│  │  [ Book This Loop ]                                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  OPTION 2                                  Score: 82       │  │
│  │  Spans 2 Days: Monday Jan 15 - Tuesday Jan 16             │  │
│  │  [Expand to see details]                                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Unsatisfiable State

```
┌─────────────────────────────────────────────────────────────────┐
│  ❌ No Valid Loop Schedule Found                                 │
│                                                                  │
│  We couldn't find a way to schedule all 4 sessions within       │
│  the candidate's availability. Here's why:                       │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  🔴 BLOCKING: Tech Deep Dive                              │  │
│  │     All 5 interviewers are busy during candidate's       │  │
│  │     available times on Jan 15-16.                         │  │
│  │                                                            │  │
│  │  🟡 LIMITING: HM Screen                                   │  │
│  │     Only 1 of 3 interviewers has availability on Jan 15. │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Recommended Actions:                                            │
│  1. [Add interviewers to Tech Deep Dive pool] ← High impact     │
│  2. [Ask candidate for more availability] ← High impact         │
│  3. [Allow scheduling across 3+ days] ← Medium impact           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Post-Booking View

```
┌─────────────────────────────────────────────────────────────────┐
│  ✅ Loop Booked Successfully                                     │
│                                                                  │
│  Candidate: Jane Doe                                             │
│  Template: Senior Engineer Interview Loop                        │
│  Status: COMMITTED                                               │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Session          │ Time           │ Interviewer │ Status │  │
│  ├───────────────────┼────────────────┼─────────────┼────────┤  │
│  │  HM Screen        │ Mon 9:00 AM    │ Alice       │ ✓      │  │
│  │  Tech Deep Dive   │ Mon 10:00 AM   │ Bob         │ ✓      │  │
│  │  Values           │ Mon 11:15 AM   │ Carol       │ ✓      │  │
│  │  Final HM         │ Mon 12:15 PM   │ Alice       │ ✓      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  Calendar Links:                                                 │
│  • View in Outlook                                               │
│  • Download .ics                                                 │
│                                                                  │
│  Sync Status:                                                    │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Calendar Events: 4/4 created                             │  │
│  │  iCIMS Notes: 2/4 synced (2 pending)                      │  │
│  │  Notifications: Sent to candidate                         │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  [ Cancel Entire Loop ]  [ View Individual Sessions ]           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. Ops and Safety

### Ops Dashboard: Loop Autopilot Tab

```
┌─────────────────────────────────────────────────────────────────┐
│  LOOP AUTOPILOT - Operations                                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Last 24 Hours:                                                  │
│  ┌────────────────┬────────────────┬────────────────┐           │
│  │  Solve Runs    │  Bookings      │  Failures      │           │
│  │      47        │      31        │      3         │           │
│  └────────────────┴────────────────┴────────────────┘           │
│                                                                  │
│  Solve Status Distribution:                                      │
│  ■■■■■■■■■■■■■■■■■■ SOLVED (38)                                  │
│  ■■■■■ UNSATISFIABLE (6)                                        │
│  ■■ PARTIAL (2)                                                  │
│  ■ TIMEOUT (1)                                                   │
│                                                                  │
│  Top Failure Reasons:                                            │
│  1. INTERVIEWER_POOL_ALL_BUSY (4 occurrences)                   │
│  2. SESSION_TOO_LONG_FOR_BLOCKS (2 occurrences)                 │
│                                                                  │
│  Recent Solve Runs:                                              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │ ID       │ Request        │ Status      │ Solutions │ Time  ││
│  ├─────────────────────────────────────────────────────────────┤│
│  │ srv-123  │ Jane Doe       │ SOLVED      │ 5         │ 2.3s  ││
│  │ srv-122  │ Bob Smith      │ UNSATISFIED │ 0         │ 1.8s  ││
│  │ srv-121  │ Alice Jones    │ SOLVED      │ 3         │ 4.1s  ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Limits and Safeguards

| Safeguard | Limit | Rationale |
|-----------|-------|-----------|
| Max sessions per loop | 6 | V1 scope, solver complexity |
| Max solve requests per minute | 10 | Prevent abuse, Graph API rate limits |
| Solver timeout | 10 seconds | UX responsiveness |
| Max search iterations | 10,000 | Prevent runaway computation |
| Max days span | 3 | Practical interview window |
| Graph API calls per solve | 50 | Rate limit protection |
| Max solutions returned | 10 | UI display limit |

### Rate Limiting

```typescript
// Rate limit configuration
const LOOP_RATE_LIMITS = {
  solvePerMinute: 10,
  solvePerHour: 100,
  commitPerMinute: 5,
  graphCallsPerSolve: 50,
};

// Implementation using existing pattern from workers
async function checkRateLimit(
  organizationId: string,
  action: 'solve' | 'commit'
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const key = `loop:${action}:${organizationId}`;
  const count = await incrementCounter(key, 60); // 60 second window

  const limit = action === 'solve'
    ? LOOP_RATE_LIMITS.solvePerMinute
    : LOOP_RATE_LIMITS.commitPerMinute;

  if (count > limit) {
    return { allowed: false, retryAfterSeconds: 60 };
  }
  return { allowed: true };
}
```

### Audit Logging

Add to existing `AuditAction` type:

```typescript
type AuditAction =
  | ... // existing actions
  | 'loop_template_created'
  | 'loop_template_updated'
  | 'loop_template_deleted'
  | 'loop_solve_started'
  | 'loop_solve_completed'
  | 'loop_solve_failed'
  | 'loop_commit_started'
  | 'loop_commit_completed'
  | 'loop_commit_failed'
  | 'loop_cancelled';
```

---

## 9. Tests

### Unit Tests

```typescript
// __tests__/lib/loop/slotGeneration.test.ts
describe('Loop Slot Generation', () => {
  it('generates 15-minute slots from candidate blocks', () => {
    const blocks = [
      { start: '2024-01-15T14:00:00Z', end: '2024-01-15T17:00:00Z' }
    ];
    const slots = generateCandidateSlots(blocks, 15);
    expect(slots).toHaveLength(12); // 3 hours = 12 × 15 min slots
    expect(slots[0]).toEqual({
      start: '2024-01-15T14:00:00Z',
      end: '2024-01-15T14:15:00Z'
    });
  });

  it('respects slot granularity setting', () => {
    const blocks = [
      { start: '2024-01-15T14:00:00Z', end: '2024-01-15T15:00:00Z' }
    ];
    const slots30 = generateCandidateSlots(blocks, 30);
    expect(slots30).toHaveLength(2);
  });

  it('handles multiple non-contiguous blocks', () => {
    const blocks = [
      { start: '2024-01-15T09:00:00Z', end: '2024-01-15T11:00:00Z' },
      { start: '2024-01-15T14:00:00Z', end: '2024-01-15T16:00:00Z' }
    ];
    const slots = generateCandidateSlots(blocks, 15);
    expect(slots).toHaveLength(16); // 8 + 8
  });
});

// __tests__/lib/loop/feasibilityFiltering.test.ts
describe('Feasibility Filtering', () => {
  it('filters slots outside business hours', () => {
    const session = createMockSession({
      constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00' }
    });
    const slots = [
      { start: '2024-01-15T07:00:00Z' }, // Before business hours
      { start: '2024-01-15T10:00:00Z' }, // Within business hours
      { start: '2024-01-15T18:00:00Z' }, // After business hours
    ];
    const feasible = filterFeasibleSlots(slots, session, 'America/New_York');
    expect(feasible).toHaveLength(1);
    expect(feasible[0].start).toBe('2024-01-15T10:00:00Z');
  });

  it('excludes slots where interviewer is busy', () => {
    const session = createMockSession({
      interviewerPool: { emails: ['alice@co.com'], requiredCount: 1 }
    });
    const busyIntervals = {
      'alice@co.com': [{ start: '2024-01-15T10:00:00Z', end: '2024-01-15T11:00:00Z' }]
    };
    const slots = [
      { start: '2024-01-15T09:00:00Z' },
      { start: '2024-01-15T10:30:00Z' }, // Overlaps with busy
      { start: '2024-01-15T11:00:00Z' },
    ];
    const feasible = filterFeasibleSlots(slots, session, busyIntervals);
    expect(feasible).toHaveLength(2);
  });
});

// __tests__/lib/loop/solver.test.ts
describe('Loop Solver', () => {
  it('returns SOLVED for synthetic scenario with available slots', async () => {
    const request = createMockSolveRequest({
      candidateBlocks: [
        { start: '2024-01-15T09:00:00Z', end: '2024-01-15T17:00:00Z' }
      ],
      template: createMockTemplate({
        sessions: [
          { name: 'HM Screen', durationMinutes: 45 },
          { name: 'Tech', durationMinutes: 60 },
        ]
      })
    });

    const result = await solve(request);

    expect(result.status).toBe('SOLVED');
    expect(result.solutions.length).toBeGreaterThan(0);
    expect(result.solutions[0].sessions).toHaveLength(2);
  });

  it('returns UNSATISFIABLE with correct constraints when impossible', async () => {
    const request = createMockSolveRequest({
      candidateBlocks: [
        { start: '2024-01-15T09:00:00Z', end: '2024-01-15T10:00:00Z' } // Only 1 hour
      ],
      template: createMockTemplate({
        sessions: [
          { name: 'Long Session', durationMinutes: 120 } // Needs 2 hours
        ]
      })
    });

    const result = await solve(request);

    expect(result.status).toBe('UNSATISFIABLE');
    expect(result.topConstraints).toContainEqual(
      expect.objectContaining({ key: 'SESSION_TOO_LONG_FOR_BLOCKS' })
    );
    expect(result.recommendedActions).toContainEqual(
      expect.objectContaining({ actionType: 'EXPAND_CANDIDATE_AVAILABILITY' })
    );
  });

  it('ranks single-day solutions higher', async () => {
    const request = createMockSolveRequest({
      candidateBlocks: [
        { start: '2024-01-15T09:00:00Z', end: '2024-01-15T17:00:00Z' },
        { start: '2024-01-16T09:00:00Z', end: '2024-01-16T17:00:00Z' },
      ],
      policy: { preferSingleDay: true }
    });

    const result = await solve(request);

    const singleDaySolutions = result.solutions.filter(s => s.isSingleDay);
    const multiDaySolutions = result.solutions.filter(s => !s.isSingleDay);

    if (singleDaySolutions.length > 0 && multiDaySolutions.length > 0) {
      const bestSingleDay = Math.max(...singleDaySolutions.map(s => s.score));
      const bestMultiDay = Math.max(...multiDaySolutions.map(s => s.score));
      expect(bestSingleDay).toBeGreaterThan(bestMultiDay);
    }
  });
});
```

### Integration Tests

```typescript
// __tests__/integration/loop-booking.test.ts
describe('Loop Booking Integration', () => {
  it('creates N calendar events when committing a solution', async () => {
    // Setup
    const mockGraphClient = createMockGraphClient();
    const request = createMockSolveRequest();

    // Solve
    const solveResult = await solve(request);
    expect(solveResult.status).toBe('SOLVED');

    // Commit
    const commitResult = await commit({
      solveId: solveResult.solveId,
      solutionId: solveResult.solutions[0].solutionId,
      commitIdempotencyKey: `test-${Date.now()}`
    });

    // Verify
    expect(commitResult.status).toBe('COMMITTED');
    expect(mockGraphClient.createEvent).toHaveBeenCalledTimes(
      solveResult.solutions[0].sessions.length
    );

    // Check database records
    const loopBooking = await getLoopBooking(commitResult.loopBookingId);
    expect(loopBooking.status).toBe('COMMITTED');

    const items = await getLoopBookingItems(loopBooking.id);
    expect(items).toHaveLength(solveResult.solutions[0].sessions.length);
  });

  it('rolls back created events when a later event fails', async () => {
    // Setup
    const mockGraphClient = createMockGraphClient();
    mockGraphClient.createEvent
      .mockResolvedValueOnce({ id: 'event-1' })
      .mockResolvedValueOnce({ id: 'event-2' })
      .mockRejectedValueOnce(new Error('Graph API error'));

    const request = createMockSolveRequest({
      template: createMockTemplate({ sessions: [
        { name: 'Session 1' },
        { name: 'Session 2' },
        { name: 'Session 3' }, // This one will fail
      ]})
    });

    // Solve
    const solveResult = await solve(request);

    // Commit (should fail)
    await expect(commit({
      solveId: solveResult.solveId,
      solutionId: solveResult.solutions[0].solutionId,
      commitIdempotencyKey: `test-${Date.now()}`
    })).rejects.toThrow('Graph API error');

    // Verify rollback
    expect(mockGraphClient.cancelEvent).toHaveBeenCalledTimes(2);
    expect(mockGraphClient.cancelEvent).toHaveBeenCalledWith(
      expect.any(String), 'event-1', expect.any(String)
    );
    expect(mockGraphClient.cancelEvent).toHaveBeenCalledWith(
      expect.any(String), 'event-2', expect.any(String)
    );

    // Check loop booking marked as failed
    const loopBookings = await getLoopBookingsByAvailabilityRequest(request.availabilityRequestId);
    expect(loopBookings[0].status).toBe('FAILED');
    expect(loopBookings[0].rollbackAttempted).toBe(true);
  });
});
```

### UI Tests

```typescript
// __tests__/components/LoopAutopilot.test.tsx
describe('Loop Autopilot UI', () => {
  it('shows template selector when availability is submitted', async () => {
    render(<AvailabilityRequestDetail requestId="req-123" />);

    await waitFor(() => {
      expect(screen.getByText('LOOP AUTOPILOT')).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /template/i })).toBeInTheDocument();
    });
  });

  it('generates solutions when button clicked', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        status: 'SOLVED',
        solutions: [createMockSolution({ score: 95 }), createMockSolution({ score: 82 })],
      })
    });

    render(<AvailabilityRequestDetail requestId="req-123" />);

    fireEvent.click(screen.getByText('Generate Loop Options'));

    await waitFor(() => {
      expect(screen.getByText('Loop Options Found: 2 solutions')).toBeInTheDocument();
      expect(screen.getByText('OPTION 1 (Recommended)')).toBeInTheDocument();
      expect(screen.getByText('Score: 95')).toBeInTheDocument();
    });
  });

  it('shows unsatisfiable state with recommendations', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        status: 'UNSATISFIABLE',
        solutions: [],
        topConstraints: [
          { key: 'INTERVIEWER_POOL_ALL_BUSY', severity: 'BLOCKING', description: 'All interviewers are busy' }
        ],
        recommendedActions: [
          { actionType: 'ADD_INTERVIEWERS_TO_POOL', description: 'Add more interviewers' }
        ]
      })
    });

    render(<AvailabilityRequestDetail requestId="req-123" />);

    fireEvent.click(screen.getByText('Generate Loop Options'));

    await waitFor(() => {
      expect(screen.getByText('No Valid Loop Schedule Found')).toBeInTheDocument();
      expect(screen.getByText('BLOCKING: All interviewers are busy')).toBeInTheDocument();
      expect(screen.getByText('Add more interviewers')).toBeInTheDocument();
    });
  });

  it('books loop when solution selected', async () => {
    // Mock solve result already loaded
    const { getByText } = render(<LoopSolutionCard solution={createMockSolution()} />);

    fireEvent.click(getByText('Book This Loop'));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/loop/commit'),
        expect.objectContaining({ method: 'POST' })
      );
    });
  });
});
```

---

## 10. Implementation Plan

### Phase 1: Foundation (Steps 1-4)

#### Step 1: Types and Data Model
**Files:**
- `src/types/loop.ts` (new)
- `src/lib/supabase/migrations/008_loop_autopilot.sql` (new)

**Tasks:**
- Define all TypeScript interfaces from Section 2-3
- Create database migration with all tables
- Add to supabase-adapter exports

**Tests:**
- Type compilation check
- Migration applies cleanly

**Verification:**
- `npm run build` passes
- Migration can be applied to test database

---

#### Step 2: Database Adapters
**Files:**
- `src/lib/db/loop-templates.ts` (new)
- `src/lib/db/loop-solve-runs.ts` (new)
- `src/lib/db/loop-bookings.ts` (new)
- `src/lib/db/index.ts` (modify - add exports)

**Tasks:**
- Implement CRUD for loop_templates
- Implement CRUD for loop_session_templates
- Implement create/read for loop_solve_runs
- Implement CRUD for loop_bookings and loop_booking_items

**Tests:**
- `__tests__/lib/db/loop-templates.test.ts`
- `__tests__/lib/db/loop-bookings.test.ts`

**Verification:**
- All adapter tests pass

---

#### Step 3: Slot Generation Utilities
**Files:**
- `src/lib/loop/slotGeneration.ts` (new)
- `src/lib/loop/feasibility.ts` (new)

**Tasks:**
- `generateCandidateSlots(blocks, granularity)` - convert blocks to slot grid
- `filterByBusinessHours(slots, constraints, timezone)`
- `filterByInterviewerAvailability(slots, busyIntervals)`
- `computeFeasiblePlacements(session, slots, busy, bookings)`

**Tests:**
- `__tests__/lib/loop/slotGeneration.test.ts`
- `__tests__/lib/loop/feasibility.test.ts`

**Verification:**
- All unit tests pass
- Edge cases covered (DST, overlapping blocks)

---

#### Step 4: Core Solver
**Files:**
- `src/lib/loop/solver.ts` (new)
- `src/lib/loop/scoring.ts` (new)
- `src/lib/loop/constraints.ts` (new)

**Tasks:**
- Implement `solve(request)` function
- Implement backtracking search with pruning
- Implement solution scoring
- Implement constraint detection and recommendations

**Tests:**
- `__tests__/lib/loop/solver.test.ts` (comprehensive)

**Verification:**
- Solver finds solutions for valid inputs
- Solver returns UNSATISFIABLE with reasons for impossible inputs
- Performance within 10 second limit

---

### Phase 2: APIs and Booking (Steps 5-7)

#### Step 5: Solve API
**Files:**
- `src/app/api/loop/solve/route.ts` (new)
- `src/lib/loop/LoopService.ts` (new)

**Tasks:**
- POST endpoint for solve requests
- Validate input, check permissions
- Call solver, persist solve run
- Return result

**Tests:**
- `__tests__/api/loop-solve.test.ts`

**Verification:**
- API returns valid solve results
- Rate limiting works
- Audit logging captured

---

#### Step 6: Commit API
**Files:**
- `src/app/api/loop/commit/route.ts` (new)
- `src/lib/loop/LoopService.ts` (modify - add commit)

**Tasks:**
- POST endpoint for commit requests
- Idempotency check
- Create calendar events with rollback
- Create database records
- Enqueue notifications and sync jobs

**Tests:**
- `__tests__/api/loop-commit.test.ts`
- `__tests__/integration/loop-booking.test.ts`

**Verification:**
- Commit creates all calendar events
- Rollback works on partial failure
- Idempotency prevents double-booking

---

#### Step 7: Template Management APIs
**Files:**
- `src/app/api/loop/templates/route.ts` (new)
- `src/app/api/loop/templates/[id]/route.ts` (new)

**Tasks:**
- CRUD endpoints for loop templates
- RBAC (org admin only for create/update/delete)
- List templates by organization

**Tests:**
- `__tests__/api/loop-templates.test.ts`

**Verification:**
- Template CRUD works
- RBAC enforced

---

### Phase 3: UI (Steps 8-10)

#### Step 8: Coordinator UI - Solve
**Files:**
- `src/components/loop/LoopAutopilot.tsx` (new)
- `src/components/loop/TemplateSelector.tsx` (new)
- `src/components/loop/SolutionList.tsx` (new)
- `src/components/loop/SolutionCard.tsx` (new)
- `src/app/coordinator/availability/[id]/page.tsx` (modify)

**Tasks:**
- Add Loop Autopilot section to availability detail
- Template dropdown
- Generate button and loading state
- Solution display with ranking

**Tests:**
- `__tests__/components/LoopAutopilot.test.tsx`

**Verification:**
- UI renders correctly
- Solutions display with all details
- Empty and error states work

---

#### Step 9: Coordinator UI - Commit and Status
**Files:**
- `src/components/loop/BookingConfirmation.tsx` (new)
- `src/components/loop/LoopStatus.tsx` (new)

**Tasks:**
- Book button and confirmation dialog
- Post-booking status display
- Sync health indicators

**Tests:**
- `__tests__/components/LoopBookingConfirmation.test.tsx`

**Verification:**
- Booking flow works end-to-end
- Status updates correctly

---

#### Step 10: Unsatisfiable UI
**Files:**
- `src/components/loop/UnsatisfiableDisplay.tsx` (new)
- `src/components/loop/RecommendedActions.tsx` (new)

**Tasks:**
- Display constraint violations
- Show recommended actions with buttons
- Help users understand why scheduling failed

**Tests:**
- `__tests__/components/UnsatisfiableDisplay.test.tsx`

**Verification:**
- All constraint types display correctly
- Recommended actions are actionable

---

### Phase 4: Ops and Polish (Steps 11-14)

#### Step 11: Ops Dashboard
**Files:**
- `src/app/ops/page.tsx` (modify - add Loop tab)
- `src/app/api/ops/loop/route.ts` (new)

**Tasks:**
- Add Loop Autopilot tab to ops dashboard
- Show solve run counts and status distribution
- Show failure reasons
- Recent runs table

**Tests:**
- `__tests__/api/ops-loop.test.ts`

**Verification:**
- Ops tab shows accurate metrics

---

#### Step 12: Template Admin UI
**Files:**
- `src/app/settings/loop-templates/page.tsx` (new)
- `src/app/settings/loop-templates/[id]/page.tsx` (new)
- `src/components/loop/TemplateEditor.tsx` (new)

**Tasks:**
- List templates page
- Create/edit template form
- Session ordering and configuration

**Tests:**
- `__tests__/components/TemplateEditor.test.tsx`

**Verification:**
- Template CRUD works in UI
- Validation prevents invalid configurations

---

#### Step 13: Cancel Loop
**Files:**
- `src/app/api/loop/[id]/cancel/route.ts` (new)
- `src/lib/loop/LoopService.ts` (modify - add cancel)

**Tasks:**
- Cancel all sessions in a loop
- Cancel calendar events
- Update statuses
- Audit logging

**Tests:**
- `__tests__/api/loop-cancel.test.ts`

**Verification:**
- Cancel removes all events
- Proper notifications sent

---

#### Step 14: Documentation and Final Testing
**Files:**
- `docs/plans/SCHEDULER_ROADMAP.md` (modify)
- `docs/LOOP_AUTOPILOT_GUIDE.md` (new)

**Tasks:**
- Update roadmap with Loop Autopilot milestone
- Write user guide for coordinators
- Final E2E testing
- Performance testing

**Tests:**
- Full test suite passes

**Verification:**
- `npm run build` passes
- `npm test` passes
- Manual E2E testing complete

---

## 11. Definition of Done

### Core Functionality
- [ ] Generate at least 3 ranked loop solutions for a request with submitted availability
- [ ] Solutions are correctly ranked (single-day preferred, earlier is better)
- [ ] Commit books all sessions and creates calendar events
- [ ] Commit creates linked database records (LoopBooking, LoopBookingItems, Bookings)
- [ ] Failed commits roll back created events

### Explainability
- [ ] UNSATISFIABLE returns top constraint violations
- [ ] UNSATISFIABLE returns actionable recommended actions
- [ ] Each solution includes rationale summary
- [ ] Each session includes reason for interviewer/time selection

### Safety
- [ ] Rate limiting prevents abuse
- [ ] Idempotency prevents double-booking
- [ ] Timeout prevents runaway solving
- [ ] Audit logging captures all solve and commit operations

### UI
- [ ] Coordinator can select template and generate solutions
- [ ] Coordinator can view ranked solutions with details
- [ ] Coordinator can book a solution
- [ ] Coordinator sees post-booking status
- [ ] Unsatisfiable state shows constraints and recommendations

### Ops
- [ ] Loop Autopilot tab in ops dashboard
- [ ] Solve run metrics visible
- [ ] Failure reasons tracked

### Quality
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Manual E2E testing complete

---

## 12. Implementation Status

### Completed
- [x] TypeScript types (`src/types/loop.ts`)
- [x] Database migration (`src/lib/supabase/migrations/008_loop_autopilot.sql`)
- [x] Memory adapter with CRUD operations (`src/lib/db/loop-adapter.ts`)
- [x] Seed templates for development
- [x] Deterministic solver with backtracking (`src/lib/loopAutopilot/solver.ts`)
- [x] API: GET/POST `/api/loop-autopilot/templates`
- [x] API: POST `/api/loop-autopilot/solve`
- [x] API: POST `/api/loop-autopilot/commit`
- [x] API: GET `/api/loop-autopilot/last-run`
- [x] API: GET `/api/ops/loop-autopilot` (ops visibility)
- [x] Commit/rollback logic in SchedulingService
- [x] Coordinator UI component (`src/components/coordinator/LoopAutopilot.tsx`)
- [x] Unit tests for solver (14 tests passing)

### Pending
- [ ] Supabase adapter (currently using in-memory)
- [ ] Integration into coordinator detail page
- [ ] Additional integration tests
- [ ] E2E testing
- [ ] User guide documentation

---

*Created: 2026-01-17*
*Status: IN PROGRESS (V1 Core Complete)*
