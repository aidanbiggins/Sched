/**
 * Loop Autopilot Database Adapter
 *
 * In-memory implementation for loop templates, solve runs, and bookings.
 */

import type {
  LoopTemplate,
  LoopSessionTemplate,
  LoopSolveRun,
  LoopBooking,
  LoopBookingItem,
  LoopTemplateWithSessions,
  CreateLoopTemplateInput,
  CreateLoopSessionTemplateInput,
  CreateLoopSolveRunInput,
  CreateLoopBookingInput,
  CreateLoopBookingItemInput,
  LoopSolveResult,
  LoopBookingStatus,
  RollbackDetails,
} from '@/types/loop';

// ============================================================================
// In-Memory Stores
// ============================================================================

const loopTemplatesStore = new Map<string, LoopTemplate>();
const loopSessionTemplatesStore = new Map<string, LoopSessionTemplate>();
const loopSolveRunsStore = new Map<string, LoopSolveRun>();
const loopBookingsStore = new Map<string, LoopBooking>();
const loopBookingItemsStore = new Map<string, LoopBookingItem>();

// ============================================================================
// Loop Templates
// ============================================================================

export async function createLoopTemplate(
  input: CreateLoopTemplateInput
): Promise<LoopTemplate> {
  const id = `loop-template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const template: LoopTemplate = {
    id,
    organizationId: input.organizationId,
    name: input.name,
    description: input.description || null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };

  loopTemplatesStore.set(id, template);
  return template;
}

export async function getLoopTemplateById(id: string): Promise<LoopTemplate | null> {
  return loopTemplatesStore.get(id) || null;
}

export async function getLoopTemplatesByOrg(
  organizationId: string,
  activeOnly: boolean = true
): Promise<LoopTemplate[]> {
  const templates: LoopTemplate[] = [];
  for (const template of loopTemplatesStore.values()) {
    if (template.organizationId === organizationId) {
      if (!activeOnly || template.isActive) {
        templates.push(template);
      }
    }
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getLoopTemplateWithSessions(
  id: string
): Promise<LoopTemplateWithSessions | null> {
  const template = await getLoopTemplateById(id);
  if (!template) return null;

  const sessions = await getLoopSessionTemplatesByTemplateId(id);
  return { ...template, sessions };
}

export async function updateLoopTemplate(
  id: string,
  updates: Partial<Pick<LoopTemplate, 'name' | 'description' | 'isActive'>>
): Promise<LoopTemplate | null> {
  const template = loopTemplatesStore.get(id);
  if (!template) return null;

  const updated: LoopTemplate = {
    ...template,
    ...updates,
    updatedAt: new Date(),
  };

  loopTemplatesStore.set(id, updated);
  return updated;
}

export async function deleteLoopTemplate(id: string): Promise<boolean> {
  // Also delete all session templates
  for (const [sessionId, session] of loopSessionTemplatesStore.entries()) {
    if (session.loopTemplateId === id) {
      loopSessionTemplatesStore.delete(sessionId);
    }
  }
  return loopTemplatesStore.delete(id);
}

// ============================================================================
// Loop Session Templates
// ============================================================================

export async function createLoopSessionTemplate(
  input: CreateLoopSessionTemplateInput
): Promise<LoopSessionTemplate> {
  const id = `loop-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const session: LoopSessionTemplate = {
    id,
    loopTemplateId: input.loopTemplateId,
    order: input.order,
    name: input.name,
    durationMinutes: input.durationMinutes,
    interviewerPool: input.interviewerPool,
    constraints: input.constraints || {},
    createdAt: new Date(),
  };

  loopSessionTemplatesStore.set(id, session);
  return session;
}

export async function getLoopSessionTemplatesByTemplateId(
  loopTemplateId: string
): Promise<LoopSessionTemplate[]> {
  const sessions: LoopSessionTemplate[] = [];
  for (const session of loopSessionTemplatesStore.values()) {
    if (session.loopTemplateId === loopTemplateId) {
      sessions.push(session);
    }
  }
  return sessions.sort((a, b) => a.order - b.order);
}

export async function deleteLoopSessionTemplate(id: string): Promise<boolean> {
  return loopSessionTemplatesStore.delete(id);
}

// ============================================================================
// Loop Solve Runs
// ============================================================================

export async function createLoopSolveRun(
  input: CreateLoopSolveRunInput
): Promise<LoopSolveRun> {
  const id = `solve-run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const run: LoopSolveRun = {
    id,
    organizationId: input.organizationId,
    availabilityRequestId: input.availabilityRequestId,
    loopTemplateId: input.loopTemplateId,
    inputsSnapshot: input.inputsSnapshot,
    status: 'SOLVED', // Will be updated after solve
    resultSnapshot: null,
    solutionsCount: 0,
    solveDurationMs: null,
    searchIterations: null,
    graphApiCalls: null,
    errorMessage: null,
    errorStack: null,
    createdAt: new Date(),
    solveIdempotencyKey: input.solveIdempotencyKey || null,
  };

  loopSolveRunsStore.set(id, run);
  return run;
}

export async function getLoopSolveRunById(id: string): Promise<LoopSolveRun | null> {
  return loopSolveRunsStore.get(id) || null;
}

export async function getLoopSolveRunByIdempotencyKey(
  key: string
): Promise<LoopSolveRun | null> {
  for (const run of loopSolveRunsStore.values()) {
    if (run.solveIdempotencyKey === key) {
      return run;
    }
  }
  return null;
}

export async function getLatestLoopSolveRun(
  availabilityRequestId: string
): Promise<LoopSolveRun | null> {
  let latest: LoopSolveRun | null = null;
  for (const run of loopSolveRunsStore.values()) {
    if (run.availabilityRequestId === availabilityRequestId) {
      if (!latest || run.createdAt > latest.createdAt) {
        latest = run;
      }
    }
  }
  return latest;
}

export async function updateLoopSolveRunResult(
  id: string,
  result: LoopSolveResult,
  metadata: {
    solveDurationMs: number;
    searchIterations: number;
    graphApiCalls: number;
  }
): Promise<LoopSolveRun | null> {
  const run = loopSolveRunsStore.get(id);
  if (!run) return null;

  const updated: LoopSolveRun = {
    ...run,
    status: result.status,
    resultSnapshot: result,
    solutionsCount: result.solutions.length,
    solveDurationMs: metadata.solveDurationMs,
    searchIterations: metadata.searchIterations,
    graphApiCalls: metadata.graphApiCalls,
  };

  loopSolveRunsStore.set(id, updated);
  return updated;
}

export async function updateLoopSolveRunError(
  id: string,
  errorMessage: string,
  errorStack?: string
): Promise<LoopSolveRun | null> {
  const run = loopSolveRunsStore.get(id);
  if (!run) return null;

  const updated: LoopSolveRun = {
    ...run,
    status: 'ERROR',
    errorMessage,
    errorStack: errorStack || null,
  };

  loopSolveRunsStore.set(id, updated);
  return updated;
}

export async function getLoopSolveRunsForOps(
  organizationId: string | null,
  since: Date
): Promise<LoopSolveRun[]> {
  const runs: LoopSolveRun[] = [];
  for (const run of loopSolveRunsStore.values()) {
    if (run.createdAt >= since) {
      if (!organizationId || run.organizationId === organizationId) {
        runs.push(run);
      }
    }
  }
  return runs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ============================================================================
// Loop Bookings
// ============================================================================

export async function createLoopBooking(
  input: CreateLoopBookingInput
): Promise<LoopBooking> {
  const id = `loop-booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();

  const booking: LoopBooking = {
    id,
    organizationId: input.organizationId,
    availabilityRequestId: input.availabilityRequestId,
    loopTemplateId: input.loopTemplateId,
    solveRunId: input.solveRunId,
    chosenSolutionId: input.chosenSolutionId,
    status: 'PENDING',
    rollbackAttempted: false,
    rollbackDetails: null,
    errorMessage: null,
    commitIdempotencyKey: input.commitIdempotencyKey,
    createdAt: now,
    updatedAt: now,
  };

  loopBookingsStore.set(id, booking);
  return booking;
}

export async function getLoopBookingById(id: string): Promise<LoopBooking | null> {
  return loopBookingsStore.get(id) || null;
}

export async function getLoopBookingByIdempotencyKey(
  key: string
): Promise<LoopBooking | null> {
  for (const booking of loopBookingsStore.values()) {
    if (booking.commitIdempotencyKey === key) {
      return booking;
    }
  }
  return null;
}

export async function getLoopBookingByAvailabilityRequest(
  availabilityRequestId: string
): Promise<LoopBooking | null> {
  for (const booking of loopBookingsStore.values()) {
    if (
      booking.availabilityRequestId === availabilityRequestId &&
      booking.status === 'COMMITTED'
    ) {
      return booking;
    }
  }
  return null;
}

export async function updateLoopBookingStatus(
  id: string,
  status: LoopBookingStatus,
  details?: {
    errorMessage?: string;
    rollbackAttempted?: boolean;
    rollbackDetails?: RollbackDetails;
  }
): Promise<LoopBooking | null> {
  const booking = loopBookingsStore.get(id);
  if (!booking) return null;

  const updated: LoopBooking = {
    ...booking,
    status,
    updatedAt: new Date(),
    ...(details?.errorMessage !== undefined && { errorMessage: details.errorMessage }),
    ...(details?.rollbackAttempted !== undefined && {
      rollbackAttempted: details.rollbackAttempted,
    }),
    ...(details?.rollbackDetails !== undefined && {
      rollbackDetails: details.rollbackDetails,
    }),
  };

  loopBookingsStore.set(id, updated);
  return updated;
}

export async function getLoopBookingsForOps(
  organizationId: string | null,
  since: Date
): Promise<LoopBooking[]> {
  const bookings: LoopBooking[] = [];
  for (const booking of loopBookingsStore.values()) {
    if (booking.createdAt >= since) {
      if (!organizationId || booking.organizationId === organizationId) {
        bookings.push(booking);
      }
    }
  }
  return bookings.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

// ============================================================================
// Loop Booking Items
// ============================================================================

export async function createLoopBookingItem(
  input: CreateLoopBookingItemInput
): Promise<LoopBookingItem> {
  const id = `loop-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const item: LoopBookingItem = {
    id,
    loopBookingId: input.loopBookingId,
    sessionTemplateId: input.sessionTemplateId,
    bookingId: input.bookingId,
    calendarEventId: input.calendarEventId,
    status: 'confirmed',
    createdAt: new Date(),
  };

  loopBookingItemsStore.set(id, item);
  return item;
}

export async function getLoopBookingItems(
  loopBookingId: string
): Promise<LoopBookingItem[]> {
  const items: LoopBookingItem[] = [];
  for (const item of loopBookingItemsStore.values()) {
    if (item.loopBookingId === loopBookingId) {
      items.push(item);
    }
  }
  return items;
}

// ============================================================================
// Seed Templates (Dev Only)
// ============================================================================

export async function seedLoopTemplates(organizationId: string, createdBy: string): Promise<void> {
  // Check if already seeded
  const existing = await getLoopTemplatesByOrg(organizationId, false);
  if (existing.length > 0) {
    return; // Already seeded
  }

  // Standard Tech Loop (3 sessions)
  const standardTemplate = await createLoopTemplate({
    organizationId,
    name: 'Standard Tech Loop',
    description: 'Standard technical interview loop: HM Screen, Technical Deep Dive, Values Interview',
    createdBy,
  });

  await createLoopSessionTemplate({
    loopTemplateId: standardTemplate.id,
    order: 0,
    name: 'HM Screen',
    durationMinutes: 45,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
      minGapToNextMinutes: 15,
    },
  });

  await createLoopSessionTemplate({
    loopTemplateId: standardTemplate.id,
    order: 1,
    name: 'Technical Deep Dive',
    durationMinutes: 60,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
      minGapToNextMinutes: 15,
    },
  });

  await createLoopSessionTemplate({
    loopTemplateId: standardTemplate.id,
    order: 2,
    name: 'Values Interview',
    durationMinutes: 45,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
    },
  });

  // Light Loop (2 sessions)
  const lightTemplate = await createLoopTemplate({
    organizationId,
    name: 'Light Loop',
    description: 'Quick interview loop for initial screening: Phone Screen and Technical Assessment',
    createdBy,
  });

  await createLoopSessionTemplate({
    loopTemplateId: lightTemplate.id,
    order: 0,
    name: 'Phone Screen',
    durationMinutes: 30,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
      minGapToNextMinutes: 15,
    },
  });

  await createLoopSessionTemplate({
    loopTemplateId: lightTemplate.id,
    order: 1,
    name: 'Technical Assessment',
    durationMinutes: 45,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
    },
  });

  // Full Loop (5 sessions)
  const fullTemplate = await createLoopTemplate({
    organizationId,
    name: 'Full Loop',
    description: 'Comprehensive interview loop: HM Screen, System Design, Coding, Values, Executive',
    createdBy,
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 0,
    name: 'HM Screen',
    durationMinutes: 45,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
      minGapToNextMinutes: 15,
    },
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 1,
    name: 'System Design',
    durationMinutes: 60,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
      minGapToNextMinutes: 15,
    },
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 2,
    name: 'Coding Interview',
    durationMinutes: 60,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
      minGapToNextMinutes: 15,
    },
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 3,
    name: 'Values Interview',
    durationMinutes: 45,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
      minGapToNextMinutes: 15,
    },
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 4,
    name: 'Executive Interview',
    durationMinutes: 30,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: {
      earliestStartLocal: '09:00',
      latestEndLocal: '17:00',
    },
  });
}

// ============================================================================
// Clear (for testing)
// ============================================================================

export function clearLoopStores(): void {
  loopTemplatesStore.clear();
  loopSessionTemplatesStore.clear();
  loopSolveRunsStore.clear();
  loopBookingsStore.clear();
  loopBookingItemsStore.clear();
}
