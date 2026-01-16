/**
 * Scheduling Types for v2
 * Defines all domain models for the interview scheduling system
 */

// ============================================
// Enums
// ============================================

export type InterviewType = 'phone_screen' | 'hm_screen' | 'onsite' | 'final';
export type CalendarProvider = 'microsoft_graph' | 'google_calendar';
export type SchedulingRequestStatus = 'pending' | 'booked' | 'rescheduled' | 'cancelled' | 'expired';
export type BookingStatus = 'confirmed' | 'rescheduled' | 'cancelled';
export type AuditAction =
  | 'link_created'
  | 'slots_viewed'
  | 'booked'
  | 'rescheduled'
  | 'cancelled'
  | 'icims_note'
  | 'icims_note_attempt'
  | 'icims_note_success'
  | 'icims_note_failed'
  | 'sync_job_created'
  | 'sync_job_success'
  | 'sync_job_failed'
  | 'graph_call'
  | 'webhook_received'
  | 'webhook_deduped'
  | 'webhook_processed'
  | 'webhook_failed'
  | 'reconciliation_detected'
  | 'reconciliation_repaired'
  | 'reconciliation_failed'
  | 'calendar_event_recreated'
  | 'calendar_event_cleanup'
  | 'needs_attention_set';

export type SyncJobType = 'icims_note';
export type SyncJobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type WebhookStatus = 'received' | 'processing' | 'processed' | 'failed';
export type WebhookProvider = 'icims';

export type ReconciliationJobType =
  | 'icims_note_missing'
  | 'calendar_event_missing'
  | 'state_mismatch';
export type ReconciliationJobStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'requires_attention';

// ============================================
// Core Entities
// ============================================

/**
 * TenantIntegrationConfig - Configuration for Graph API access
 */
export interface TenantIntegrationConfig {
  id: string;
  graph: {
    tenantId: string;
    clientId: string;
    clientSecretRef: string; // Reference to secret, not the actual secret
    organizerEmail: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * InterviewerIdentity - Maps interviewer emails to Graph user IDs
 */
export interface InterviewerIdentity {
  id: string;
  tenantId: string | null; // Nullable in dev/mock mode
  email: string;
  calendarProviderUserId: string | null; // Graph user id, nullable in dev
  createdAt: Date;
}

/**
 * SchedulingRequest - Coordinator's request to schedule an interview
 */
export interface SchedulingRequest {
  id: string;

  // Context (from iCIMS or manual entry)
  applicationId: string | null; // iCIMS application ID
  candidateName: string;
  candidateEmail: string;
  reqId: string | null;
  reqTitle: string;
  interviewType: InterviewType;
  durationMinutes: number;

  // Participants
  interviewerEmails: string[];

  // Calendar linkage (v2)
  organizerEmail: string;
  calendarProvider: CalendarProvider;
  graphTenantId: string | null; // Nullable in dev/mock mode

  // Scheduling window
  windowStart: Date;
  windowEnd: Date;
  candidateTimezone: string;

  // Public link
  publicToken: string; // Raw token for coordinator access
  publicTokenHash: string; // Hash for public URL validation
  expiresAt: Date;

  // Status
  status: SchedulingRequestStatus;

  // Attention flags (M6)
  needsAttention: boolean;
  needsAttentionReason: string | null;

  // Audit
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Booking - Confirmed interview booking
 */
export interface Booking {
  id: string;
  requestId: string | null;                // FK to scheduling_requests
  availabilityRequestId?: string | null;   // FK to availability_requests (optional)

  // Scheduled time
  scheduledStart: Date;
  scheduledEnd: Date;

  // Calendar event (v2)
  calendarEventId: string | null;
  calendarIcalUid: string | null;
  conferenceJoinUrl: string | null;

  // iCIMS sync (M6)
  icimsActivityId: string | null;

  // Status
  status: BookingStatus;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;

  // Audit
  bookedBy: string; // 'candidate' or coordinator user id
  bookedAt: Date;
  updatedAt: Date;
}

/**
 * AuditLog - Record of all scheduling actions
 */
export interface AuditLog {
  id: string;
  requestId: string | null;               // FK to scheduling_requests
  availabilityRequestId?: string | null;  // FK to availability_requests (optional)
  bookingId: string | null;

  action: AuditAction;
  actorType: 'coordinator' | 'candidate' | 'system';
  actorId: string | null;

  payload: Record<string, unknown>;
  createdAt: Date;
}

/**
 * WebhookEvent - Incoming webhook from iCIMS (enhanced for M6)
 */
export interface WebhookEvent {
  id: string;
  tenantId: string | null;           // Multi-tenant support
  provider: WebhookProvider;         // Provider identifier
  eventId: string;                   // External event ID for idempotency
  payloadHash: string;               // SHA-256 of payload for dedup
  eventType: string;
  payload: Record<string, unknown>;
  signature: string;
  verified: boolean;
  status: WebhookStatus;             // Processing status
  attempts: number;                  // Processing attempts
  maxAttempts: number;               // Max processing attempts
  lastError: string | null;          // Last error message
  runAfter: Date;                    // For retry scheduling
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * SyncJob - Background job for retrying failed external writes
 */
export interface SyncJob {
  id: string;
  type: SyncJobType;
  entityId: string; // e.g., schedulingRequestId or bookingId
  entityType: 'scheduling_request' | 'booking';
  attempts: number;
  maxAttempts: number;
  status: SyncJobStatus;
  lastError: string | null;
  payload: Record<string, unknown>; // Data needed to retry
  runAfter: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ReconciliationJob - Background job for detecting and repairing drift (M6)
 */
export interface ReconciliationJob {
  id: string;
  tenantId: string | null;
  jobType: ReconciliationJobType;
  entityType: 'scheduling_request' | 'booking';
  entityId: string;
  status: ReconciliationJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  detectionReason: string;           // Why was this job created
  runAfter: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Graph API Types
// ============================================

export interface BusyInterval {
  start: Date;
  end: Date;
  status: 'busy' | 'tentative' | 'oof' | 'workingElsewhere';
  isPrivate: boolean;
}

export interface InterviewerAvailability {
  email: string;
  busyIntervals: BusyInterval[];
  workingHours: {
    start: string; // "09:00"
    end: string;   // "17:00"
    timeZone: string;
    daysOfWeek: number[]; // 0=Sun, 1=Mon, etc.
  };
}

export interface AvailableSlot {
  slotId: string;
  start: Date;
  end: Date;
  displayStart: string;
  displayEnd: string;
}

export interface CreateEventPayload {
  subject: string;
  body: {
    contentType: 'HTML' | 'Text';
    content: string;
  };
  start: Date;
  end: Date;
  timeZone: string;
  attendees: Array<{
    email: string;
    name: string;
    type: 'required' | 'optional';
  }>;
  isOnlineMeeting: boolean;
  transactionId: string;
}

export interface CreatedEvent {
  eventId: string;
  iCalUId: string | null;
  joinUrl: string | null;
  webLink: string | null;
}

export interface UpdateEventPayload {
  start?: Date;
  end?: Date;
  timeZone?: string;
  subject?: string;
  body?: {
    contentType: 'HTML' | 'Text';
    content: string;
  };
}

// ============================================
// iCIMS Types
// ============================================

export interface IcimsApplication {
  id: string;
  candidateName: string;
  candidateEmail: string;
  requisitionId: string;
  requisitionTitle: string;
  status: string;
}

// ============================================
// API Request/Response Types
// ============================================

export interface CreateSchedulingRequestInput {
  applicationId?: string;
  candidateName: string;
  candidateEmail: string;
  reqId?: string;
  reqTitle: string;
  interviewType: InterviewType;
  durationMinutes: number;
  interviewerEmails: string[];
  windowStart: string; // ISO 8601
  windowEnd: string;
  candidateTimezone: string;
}

export interface CreateSchedulingRequestOutput {
  requestId: string;
  publicLink: string;
  expiresAt: string;
}

export interface GetSlotsOutput {
  request: {
    candidateName: string;
    reqTitle: string;
    interviewType: string;
    durationMinutes: number;
  };
  slots: AvailableSlot[];
  timezone: string;
}

export interface BookSlotInput {
  token: string;
  slotId: string;
}

export interface BookSlotOutput {
  success: boolean;
  booking: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    conferenceJoinUrl: string | null;
  };
  message: string;
}

export interface RescheduleInput {
  newStart: string;
  newEnd: string;
  reason?: string;
}

export interface CancelInput {
  reason: string;
  notifyParticipants: boolean;
}

// ============================================
// Availability Request Types (Candidate Provides Availability Mode)
// ============================================

export type AvailabilityRequestStatus =
  | 'pending'      // Link sent, waiting for candidate
  | 'submitted'    // Candidate submitted availability
  | 'booked'       // Coordinator booked from suggestions
  | 'cancelled'    // Request cancelled
  | 'expired';     // Deadline passed

/**
 * AvailabilityRequest - Request for candidate to provide their availability
 * This is the "candidate first" mode where they provide windows, then coordinator matches.
 */
export interface AvailabilityRequest {
  id: string;

  // Context (from iCIMS or manual entry)
  applicationId: string | null; // iCIMS application ID
  candidateName: string;
  candidateEmail: string;
  reqId: string | null;
  reqTitle: string;
  interviewType: InterviewType;
  durationMinutes: number;

  // Interviewers to match against
  interviewerEmails: string[];

  // Calendar linkage
  organizerEmail: string;
  calendarProvider: CalendarProvider;
  graphTenantId: string | null;

  // Request window - how far out candidate can provide availability
  windowStart: Date;
  windowEnd: Date;

  // Public link
  publicToken: string;
  publicTokenHash: string;
  expiresAt: Date; // Deadline for candidate to submit

  // Candidate's timezone (set when they submit)
  candidateTimezone: string | null;

  // Status
  status: AvailabilityRequestStatus;

  // Minimum requirements
  minTotalMinutes: number; // Minimum total availability required (default 180 = 3 hours)
  minBlocks: number;       // Minimum number of blocks required (default 5)

  // Audit
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CandidateAvailabilityBlock - A time block when candidate is available
 */
export interface CandidateAvailabilityBlock {
  id: string;
  availabilityRequestId: string;

  // Time range (always in UTC)
  startAt: Date;
  endAt: Date;

  // Metadata
  createdAt: Date;
}

/**
 * AvailabilitySuggestion - A suggested time slot that matches candidate and interviewers
 */
export interface AvailabilitySuggestion {
  startAt: Date;
  endAt: Date;
  interviewerEmails: string[];
  score: number;        // Higher is better
  rationale: string;    // e.g., "All interviewers available, earliest slot"
}

// ============================================
// Availability Request API Types
// ============================================

export interface CreateAvailabilityRequestInput {
  applicationId?: string;
  candidateName: string;
  candidateEmail: string;
  reqId?: string;
  reqTitle: string;
  interviewType: InterviewType;
  durationMinutes: number;
  interviewerEmails: string[];
  windowDays: number;    // How many days out (default 14)
  deadlineDays: number;  // Days until link expires (default 7)
  minTotalMinutes?: number;
  minBlocks?: number;
}

export interface CreateAvailabilityRequestOutput {
  id: string;
  publicLink: string;
  expiresAt: string;
}

export interface SubmitAvailabilityInput {
  candidateTimezone: string;
  blocks: Array<{
    startAt: string; // ISO 8601 UTC
    endAt: string;   // ISO 8601 UTC
  }>;
}

export interface GetSuggestionsOutput {
  suggestions: Array<{
    startAt: string;
    endAt: string;
    interviewerEmails: string[];
    score: number;
    rationale: string;
  }>;
}

export interface BookFromSuggestionInput {
  startAt: string; // ISO 8601 UTC
  candidateTimezone: string;
}
