/**
 * Supabase Database Adapter
 *
 * Implements the same interface as memory-adapter.ts but uses Supabase PostgreSQL.
 * All functions are async and return the same types.
 */

import { getSupabaseClient } from '../supabase/client';
import {
  SchedulingRequest,
  Booking,
  AuditLog,
  WebhookEvent,
  InterviewerIdentity,
  TenantIntegrationConfig,
  SyncJob,
  SyncJobStatus,
  ReconciliationJob,
  ReconciliationJobStatus,
  WebhookStatus,
  InterviewType,
  CalendarProvider,
  SchedulingRequestStatus,
  BookingStatus,
  AuditAction,
  SyncJobType,
  WebhookProvider,
  ReconciliationJobType,
  AvailabilityRequest,
  AvailabilityRequestStatus,
  CandidateAvailabilityBlock,
  NotificationJob,
  NotificationAttempt,
  NotificationStatus,
  NotificationType,
  NotificationEntityType,
  CoordinatorNotificationPreferences,
} from '@/types/scheduling';
import {
  InterviewerProfile,
  InterviewerProfileInput,
  InterviewerLoadRollup,
  LoadRollupInput,
  SchedulingRecommendation,
  RecommendationInput,
  RecommendationStatus,
} from '@/types/capacity';
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
  LoopSolveStatus,
} from '@/types/loop';
// Database row types for mapping - using inline types for flexibility
// until we generate proper types from a real Supabase project
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SchedulingRequestRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BookingRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AuditLogRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SyncJobRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebhookEventRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ReconciliationJobRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InterviewerIdentityRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TenantConfigRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AvailabilityRequestRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CandidateAvailabilityBlockRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotificationJobRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NotificationAttemptRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoopTemplateRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoopSessionTemplateRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoopSolveRunRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoopBookingRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoopBookingItemRow = any;

// ============================================
// Type Mappers (DB Row <-> Domain Type)
// ============================================

function mapToSchedulingRequest(row: SchedulingRequestRow): SchedulingRequest {
  return {
    id: row.id,
    organizationId: row.organization_id || null,
    applicationId: row.application_id,
    candidateName: row.candidate_name,
    candidateEmail: row.candidate_email,
    reqId: row.req_id,
    reqTitle: row.req_title,
    interviewType: row.interview_type as InterviewType,
    durationMinutes: row.duration_minutes,
    interviewerEmails: row.interviewer_emails,
    organizerEmail: row.organizer_email,
    calendarProvider: row.calendar_provider as CalendarProvider,
    graphTenantId: row.graph_tenant_id,
    windowStart: new Date(row.window_start),
    windowEnd: new Date(row.window_end),
    candidateTimezone: row.candidate_timezone,
    publicToken: row.public_token,
    publicTokenHash: row.public_token_hash,
    expiresAt: new Date(row.expires_at),
    status: row.status as SchedulingRequestStatus,
    needsAttention: row.needs_attention,
    needsAttentionReason: row.needs_attention_reason,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    requestId: row.request_id,
    availabilityRequestId: row.availability_request_id,
    scheduledStart: new Date(row.scheduled_start),
    scheduledEnd: new Date(row.scheduled_end),
    calendarEventId: row.calendar_event_id,
    calendarIcalUid: row.calendar_ical_uid,
    conferenceJoinUrl: row.conference_join_url,
    icimsActivityId: row.icims_activity_id,
    status: row.status as BookingStatus,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    cancellationReason: row.cancellation_reason,
    bookedBy: row.booked_by,
    bookedAt: new Date(row.booked_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToAuditLog(row: AuditLogRow): AuditLog {
  return {
    id: row.id,
    requestId: row.request_id,
    availabilityRequestId: row.availability_request_id,
    bookingId: row.booking_id,
    action: row.action as AuditAction,
    actorType: row.actor_type as 'coordinator' | 'candidate' | 'system',
    actorId: row.actor_id,
    payload: row.payload as Record<string, unknown>,
    createdAt: new Date(row.created_at),
  };
}

function mapToSyncJob(row: SyncJobRow): SyncJob {
  return {
    id: row.id,
    type: row.type as SyncJobType,
    entityId: row.entity_id,
    entityType: row.entity_type as 'scheduling_request' | 'booking',
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    status: row.status as SyncJobStatus,
    lastError: row.last_error,
    payload: row.payload as Record<string, unknown>,
    runAfter: new Date(row.run_after),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToWebhookEvent(row: WebhookEventRow): WebhookEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider as WebhookProvider,
    eventId: row.event_id,
    payloadHash: row.payload_hash,
    eventType: row.event_type,
    payload: row.payload as Record<string, unknown>,
    signature: row.signature,
    verified: row.verified,
    status: row.status as WebhookStatus,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    runAfter: new Date(row.run_after),
    processedAt: row.processed_at ? new Date(row.processed_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToReconciliationJob(row: ReconciliationJobRow): ReconciliationJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    jobType: row.job_type as ReconciliationJobType,
    entityType: row.entity_type as 'scheduling_request' | 'booking',
    entityId: row.entity_id,
    status: row.status as ReconciliationJobStatus,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    detectionReason: row.detection_reason,
    runAfter: new Date(row.run_after),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToInterviewerIdentity(row: InterviewerIdentityRow): InterviewerIdentity {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    calendarProviderUserId: row.calendar_provider_user_id,
    createdAt: new Date(row.created_at),
  };
}

function mapToTenantConfig(row: TenantConfigRow): TenantIntegrationConfig {
  return {
    id: row.id,
    graph: {
      tenantId: row.graph_tenant_id,
      clientId: row.graph_client_id,
      clientSecretRef: row.graph_client_secret_ref,
      organizerEmail: row.graph_organizer_email,
    },
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToAvailabilityRequest(row: AvailabilityRequestRow): AvailabilityRequest {
  return {
    id: row.id,
    applicationId: row.application_id,
    candidateName: row.candidate_name,
    candidateEmail: row.candidate_email,
    reqId: row.req_id,
    reqTitle: row.req_title,
    interviewType: row.interview_type as AvailabilityRequest['interviewType'],
    durationMinutes: row.duration_minutes,
    interviewerEmails: row.interviewer_emails,
    organizerEmail: row.organizer_email,
    calendarProvider: row.calendar_provider as AvailabilityRequest['calendarProvider'],
    graphTenantId: row.graph_tenant_id,
    windowStart: new Date(row.window_start),
    windowEnd: new Date(row.window_end),
    publicToken: row.public_token,
    publicTokenHash: row.public_token_hash,
    expiresAt: new Date(row.expires_at),
    candidateTimezone: row.candidate_timezone,
    status: row.status as AvailabilityRequestStatus,
    minTotalMinutes: row.min_total_minutes,
    minBlocks: row.min_blocks,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToCandidateAvailabilityBlock(row: CandidateAvailabilityBlockRow): CandidateAvailabilityBlock {
  return {
    id: row.id,
    availabilityRequestId: row.availability_request_id,
    startAt: new Date(row.start_at),
    endAt: new Date(row.end_at),
    createdAt: new Date(row.created_at),
  };
}

function mapToNotificationJob(row: NotificationJobRow): NotificationJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    type: row.type as NotificationType,
    entityType: row.entity_type as NotificationEntityType,
    entityId: row.entity_id,
    idempotencyKey: row.idempotency_key,
    toEmail: row.to_email,
    payloadJson: row.payload_json || {},
    status: row.status as NotificationStatus,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: new Date(row.run_after),
    lastError: row.last_error,
    sentAt: row.sent_at ? new Date(row.sent_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToNotificationAttempt(row: NotificationAttemptRow): NotificationAttempt {
  return {
    id: row.id,
    notificationJobId: row.notification_job_id,
    attemptNumber: row.attempt_number,
    status: row.status as 'success' | 'failure',
    error: row.error,
    providerMessageId: row.provider_message_id,
    createdAt: new Date(row.created_at),
  };
}

// ============================================
// Scheduling Requests
// ============================================

export async function createSchedulingRequest(request: SchedulingRequest): Promise<SchedulingRequest> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('scheduling_requests')
    .insert({
      id: request.id,
      organization_id: request.organizationId,
      application_id: request.applicationId,
      candidate_name: request.candidateName,
      candidate_email: request.candidateEmail,
      req_id: request.reqId,
      req_title: request.reqTitle,
      interview_type: request.interviewType,
      duration_minutes: request.durationMinutes,
      interviewer_emails: request.interviewerEmails,
      organizer_email: request.organizerEmail,
      calendar_provider: request.calendarProvider,
      graph_tenant_id: request.graphTenantId,
      window_start: request.windowStart.toISOString(),
      window_end: request.windowEnd.toISOString(),
      candidate_timezone: request.candidateTimezone,
      public_token: request.publicToken,
      public_token_hash: request.publicTokenHash,
      expires_at: request.expiresAt.toISOString(),
      status: request.status,
      needs_attention: request.needsAttention,
      needs_attention_reason: request.needsAttentionReason,
      created_by: request.createdBy,
      created_at: request.createdAt.toISOString(),
      updated_at: request.updatedAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create scheduling request: ${error.message}`);
  return mapToSchedulingRequest(data);
}

export async function getSchedulingRequestById(id: string): Promise<SchedulingRequest | null> {
  const supabase = getSupabaseClient();

  // Use explicit select('*') and limit(1) instead of .single() to avoid Supabase caching issues
  const { data, error } = await supabase
    .from('scheduling_requests')
    .select('*')
    .eq('id', id)
    .limit(1);

  if (error) {
    throw new Error(`Failed to get scheduling request: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  // Debug logging to trace caching issues
  console.log(`[DB] getSchedulingRequestById(${id}) - raw status from DB: ${data[0].status}`);

  return mapToSchedulingRequest(data[0]);
}

export async function getSchedulingRequestByTokenHash(tokenHash: string): Promise<SchedulingRequest | null> {
  const supabase = getSupabaseClient();

  // Use explicit select('*') and limit(1) instead of .single() to avoid Supabase caching issues
  const { data, error } = await supabase
    .from('scheduling_requests')
    .select('*')
    .eq('public_token_hash', tokenHash)
    .limit(1);

  if (error) {
    throw new Error(`Failed to get scheduling request by token hash: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return mapToSchedulingRequest(data[0]);
}

export async function updateSchedulingRequest(
  id: string,
  updates: Partial<SchedulingRequest>
): Promise<SchedulingRequest | null> {
  const supabase = getSupabaseClient();

  // Map domain updates to database columns
  const dbUpdates: Record<string, unknown> = {};
  if (updates.applicationId !== undefined) dbUpdates.application_id = updates.applicationId;
  if (updates.candidateName !== undefined) dbUpdates.candidate_name = updates.candidateName;
  if (updates.candidateEmail !== undefined) dbUpdates.candidate_email = updates.candidateEmail;
  if (updates.reqId !== undefined) dbUpdates.req_id = updates.reqId;
  if (updates.reqTitle !== undefined) dbUpdates.req_title = updates.reqTitle;
  if (updates.interviewType !== undefined) dbUpdates.interview_type = updates.interviewType;
  if (updates.durationMinutes !== undefined) dbUpdates.duration_minutes = updates.durationMinutes;
  if (updates.interviewerEmails !== undefined) dbUpdates.interviewer_emails = updates.interviewerEmails;
  if (updates.organizerEmail !== undefined) dbUpdates.organizer_email = updates.organizerEmail;
  if (updates.calendarProvider !== undefined) dbUpdates.calendar_provider = updates.calendarProvider;
  if (updates.graphTenantId !== undefined) dbUpdates.graph_tenant_id = updates.graphTenantId;
  if (updates.windowStart !== undefined) dbUpdates.window_start = updates.windowStart.toISOString();
  if (updates.windowEnd !== undefined) dbUpdates.window_end = updates.windowEnd.toISOString();
  if (updates.candidateTimezone !== undefined) dbUpdates.candidate_timezone = updates.candidateTimezone;
  if (updates.publicToken !== undefined) dbUpdates.public_token = updates.publicToken;
  if (updates.publicTokenHash !== undefined) dbUpdates.public_token_hash = updates.publicTokenHash;
  if (updates.expiresAt !== undefined) dbUpdates.expires_at = updates.expiresAt.toISOString();
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.needsAttention !== undefined) dbUpdates.needs_attention = updates.needsAttention;
  if (updates.needsAttentionReason !== undefined) dbUpdates.needs_attention_reason = updates.needsAttentionReason;
  if (updates.createdBy !== undefined) dbUpdates.created_by = updates.createdBy;

  const { data, error } = await supabase
    .from('scheduling_requests')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to update scheduling request: ${error.message}`);
  }
  return mapToSchedulingRequest(data);
}

export async function getAllSchedulingRequests(): Promise<SchedulingRequest[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('scheduling_requests')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get all scheduling requests: ${error.message}`);
  return data.map(mapToSchedulingRequest);
}

// Aliases for reconciliation service
export const getAllRequests = getAllSchedulingRequests;
export const getRequestById = getSchedulingRequestById;
export const updateRequest = updateSchedulingRequest;

export interface SchedulingRequestFilters {
  status?: string[];
  search?: string;
  ageRange?: string; // '0-2d' | '3-7d' | '8-14d' | '15+d'
  needsSync?: boolean;
  interviewerEmail?: string;
  createdBy?: string; // Filter by user ID
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export async function getSchedulingRequestsFiltered(
  filters: SchedulingRequestFilters,
  pagination: PaginationOptions = {}
): Promise<PaginatedResult<SchedulingRequest>> {
  const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc' } = pagination;
  const supabase = getSupabaseClient();

  let query = supabase.from('scheduling_requests').select('*', { count: 'exact' });

  // Apply createdBy filter (user scoping)
  if (filters.createdBy) {
    query = query.eq('created_by', filters.createdBy);
  }

  // Apply status filter
  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  // Apply search filter
  if (filters.search) {
    const searchPattern = `%${filters.search}%`;
    query = query.or(
      `candidate_email.ilike.${searchPattern},application_id.ilike.${searchPattern},id.ilike.${searchPattern}`
    );
  }

  // Apply age range filter
  if (filters.ageRange) {
    const now = new Date();
    const dayMs = 24 * 60 * 60 * 1000;
    let startDate: Date | null = null;
    let endDate: Date | null = null;

    switch (filters.ageRange) {
      case '0-2d':
        startDate = new Date(now.getTime() - 2 * dayMs);
        endDate = now;
        break;
      case '3-7d':
        startDate = new Date(now.getTime() - 7 * dayMs);
        endDate = new Date(now.getTime() - 2 * dayMs);
        break;
      case '8-14d':
        startDate = new Date(now.getTime() - 14 * dayMs);
        endDate = new Date(now.getTime() - 7 * dayMs);
        break;
      case '15+d':
        endDate = new Date(now.getTime() - 14 * dayMs);
        break;
    }

    if (startDate) query = query.gte('created_at', startDate.toISOString());
    if (endDate) query = query.lte('created_at', endDate.toISOString());
  }

  // Apply interviewer email filter
  if (filters.interviewerEmail) {
    query = query.contains('interviewer_emails', [filters.interviewerEmail]);
  }

  // Sorting
  if (sortBy === 'status') {
    // Special sort: status order, then by created_at ascending (oldest first within status)
    query = query
      .order('status', { ascending: true })
      .order('created_at', { ascending: true });
  } else {
    query = query.order('created_at', { ascending: sortOrder === 'asc' });
  }

  // Pagination
  const offset = (page - 1) * limit;
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to filter scheduling requests: ${error.message}`);

  // For needsSync filter, we need to do a post-filter (requires checking sync_jobs)
  let filteredData = data;
  if (filters.needsSync) {
    const syncJobsResult = await supabase
      .from('sync_jobs')
      .select('entity_id')
      .eq('entity_type', 'scheduling_request')
      .in('status', ['failed', 'pending']);

    if (syncJobsResult.error) throw new Error(`Failed to get sync jobs: ${syncJobsResult.error.message}`);

    const entityIds = new Set(syncJobsResult.data.map((j) => j.entity_id));
    filteredData = data.filter((r) => entityIds.has(r.id));
  }

  const total = filters.needsSync ? filteredData.length : (count ?? 0);
  const totalPages = Math.ceil(total / limit);

  return {
    data: filteredData.map(mapToSchedulingRequest),
    total,
    page,
    limit,
    totalPages,
  };
}

export async function getSchedulingRequestCounts(userId?: string): Promise<Record<string, number>> {
  const supabase = getSupabaseClient();

  let query = supabase.from('scheduling_requests').select('status');

  // Filter by user if provided
  if (userId) {
    query = query.eq('created_by', userId);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get scheduling request counts: ${error.message}`);

  const counts: Record<string, number> = {
    pending: 0,
    booked: 0,
    cancelled: 0,
    rescheduled: 0,
    all: data.length,
  };

  for (const row of data) {
    if (counts[row.status] !== undefined) {
      counts[row.status]++;
    }
  }

  return counts;
}

// ============================================
// Bookings
// ============================================

export async function createBooking(booking: Booking): Promise<Booking> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      id: booking.id,
      request_id: booking.requestId,
      availability_request_id: booking.availabilityRequestId,
      scheduled_start: booking.scheduledStart.toISOString(),
      scheduled_end: booking.scheduledEnd.toISOString(),
      calendar_event_id: booking.calendarEventId,
      calendar_ical_uid: booking.calendarIcalUid,
      conference_join_url: booking.conferenceJoinUrl,
      icims_activity_id: booking.icimsActivityId,
      status: booking.status,
      confirmed_at: booking.confirmedAt?.toISOString() ?? null,
      cancelled_at: booking.cancelledAt?.toISOString() ?? null,
      cancellation_reason: booking.cancellationReason,
      booked_by: booking.bookedBy,
      booked_at: booking.bookedAt.toISOString(),
      updated_at: booking.updatedAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create booking: ${error.message}`);
  return mapToBooking(data);
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const supabase = getSupabaseClient();

  // Use explicit select('*') and limit(1) instead of .single() to avoid Supabase caching issues
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', id)
    .limit(1);

  if (error) {
    throw new Error(`Failed to get booking: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return mapToBooking(data[0]);
}

export async function getBookingByRequestId(requestId: string): Promise<Booking | null> {
  const supabase = getSupabaseClient();

  // Use explicit select('*') and limit(1) instead of .maybeSingle() for consistency
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('request_id', requestId)
    .limit(1);

  if (error) throw new Error(`Failed to get booking by request ID: ${error.message}`);

  if (!data || data.length === 0) {
    return null;
  }

  return mapToBooking(data[0]);
}

export async function updateBooking(
  id: string,
  updates: Partial<Booking>
): Promise<Booking | null> {
  const supabase = getSupabaseClient();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.requestId !== undefined) dbUpdates.request_id = updates.requestId;
  if (updates.scheduledStart !== undefined) dbUpdates.scheduled_start = updates.scheduledStart.toISOString();
  if (updates.scheduledEnd !== undefined) dbUpdates.scheduled_end = updates.scheduledEnd.toISOString();
  if (updates.calendarEventId !== undefined) dbUpdates.calendar_event_id = updates.calendarEventId;
  if (updates.calendarIcalUid !== undefined) dbUpdates.calendar_ical_uid = updates.calendarIcalUid;
  if (updates.conferenceJoinUrl !== undefined) dbUpdates.conference_join_url = updates.conferenceJoinUrl;
  if (updates.icimsActivityId !== undefined) dbUpdates.icims_activity_id = updates.icimsActivityId;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.confirmedAt !== undefined) dbUpdates.confirmed_at = updates.confirmedAt?.toISOString() ?? null;
  if (updates.cancelledAt !== undefined) dbUpdates.cancelled_at = updates.cancelledAt?.toISOString() ?? null;
  if (updates.cancellationReason !== undefined) dbUpdates.cancellation_reason = updates.cancellationReason;
  if (updates.bookedBy !== undefined) dbUpdates.booked_by = updates.bookedBy;

  const { data, error } = await supabase
    .from('bookings')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update booking: ${error.message}`);
  }
  return mapToBooking(data);
}

export async function getAllBookings(): Promise<Booking[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('bookings').select();

  if (error) throw new Error(`Failed to get all bookings: ${error.message}`);
  return data.map(mapToBooking);
}

export async function getBookingsInTimeRange(
  start: Date,
  end: Date,
  interviewerEmails?: string[]
): Promise<Booking[]> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('bookings')
    .select('*, scheduling_requests!inner(interviewer_emails)')
    .neq('status', 'cancelled')
    .lt('scheduled_start', end.toISOString())
    .gt('scheduled_end', start.toISOString());

  if (interviewerEmails && interviewerEmails.length > 0) {
    query = query.overlaps('scheduling_requests.interviewer_emails', interviewerEmails);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get bookings in time range: ${error.message}`);

  // Map to Booking type (strip the joined scheduling_requests data)
  return data.map((row) => {
    const { scheduling_requests, ...bookingRow } = row;
    return mapToBooking(bookingRow as BookingRow);
  });
}

// ============================================
// Audit Log
// ============================================

export async function createAuditLog(log: AuditLog): Promise<AuditLog> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .insert({
      id: log.id,
      request_id: log.requestId,
      availability_request_id: log.availabilityRequestId,
      booking_id: log.bookingId,
      action: log.action,
      actor_type: log.actorType,
      actor_id: log.actorId,
      payload: log.payload,
      created_at: log.createdAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create audit log: ${error.message}`);
  return mapToAuditLog(data);
}

export async function getAuditLogsByRequestId(requestId: string): Promise<AuditLog[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .select()
    .eq('request_id', requestId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get audit logs: ${error.message}`);
  return data.map(mapToAuditLog);
}

export async function getAllAuditLogs(): Promise<AuditLog[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get all audit logs: ${error.message}`);
  return data.map(mapToAuditLog);
}

// ============================================
// Webhook Events
// ============================================

export async function createWebhookEvent(event: WebhookEvent): Promise<WebhookEvent> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('webhook_events')
    .insert({
      id: event.id,
      tenant_id: event.tenantId,
      provider: event.provider,
      event_id: event.eventId,
      payload_hash: event.payloadHash,
      event_type: event.eventType,
      payload: event.payload,
      signature: event.signature,
      verified: event.verified,
      status: event.status,
      attempts: event.attempts,
      max_attempts: event.maxAttempts,
      last_error: event.lastError,
      run_after: event.runAfter.toISOString(),
      processed_at: event.processedAt?.toISOString() ?? null,
      created_at: event.createdAt.toISOString(),
      updated_at: event.updatedAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create webhook event: ${error.message}`);
  return mapToWebhookEvent(data);
}

export async function getWebhookEventById(id: string): Promise<WebhookEvent | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('webhook_events')
    .select()
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get webhook event: ${error.message}`);
  }
  return mapToWebhookEvent(data);
}

export async function getWebhookEventByEventId(eventId: string): Promise<WebhookEvent | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('webhook_events')
    .select()
    .eq('event_id', eventId)
    .maybeSingle();

  if (error) throw new Error(`Failed to get webhook event by event ID: ${error.message}`);
  return data ? mapToWebhookEvent(data) : null;
}

export async function getWebhookEventByPayloadHash(
  tenantId: string | null,
  provider: string,
  payloadHash: string
): Promise<WebhookEvent | null> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('webhook_events')
    .select()
    .eq('provider', provider)
    .eq('payload_hash', payloadHash);

  if (tenantId === null) {
    query = query.is('tenant_id', null);
  } else {
    query = query.eq('tenant_id', tenantId);
  }

  const { data, error } = await query.maybeSingle();

  if (error) throw new Error(`Failed to get webhook event by payload hash: ${error.message}`);
  return data ? mapToWebhookEvent(data) : null;
}

export async function updateWebhookEvent(
  id: string,
  updates: Partial<WebhookEvent>
): Promise<WebhookEvent | null> {
  const supabase = getSupabaseClient();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.tenantId !== undefined) dbUpdates.tenant_id = updates.tenantId;
  if (updates.provider !== undefined) dbUpdates.provider = updates.provider;
  if (updates.eventId !== undefined) dbUpdates.event_id = updates.eventId;
  if (updates.payloadHash !== undefined) dbUpdates.payload_hash = updates.payloadHash;
  if (updates.eventType !== undefined) dbUpdates.event_type = updates.eventType;
  if (updates.payload !== undefined) dbUpdates.payload = updates.payload;
  if (updates.signature !== undefined) dbUpdates.signature = updates.signature;
  if (updates.verified !== undefined) dbUpdates.verified = updates.verified;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.attempts !== undefined) dbUpdates.attempts = updates.attempts;
  if (updates.maxAttempts !== undefined) dbUpdates.max_attempts = updates.maxAttempts;
  if (updates.lastError !== undefined) dbUpdates.last_error = updates.lastError;
  if (updates.runAfter !== undefined) dbUpdates.run_after = updates.runAfter.toISOString();
  if (updates.processedAt !== undefined) dbUpdates.processed_at = updates.processedAt?.toISOString() ?? null;

  const { data, error } = await supabase
    .from('webhook_events')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update webhook event: ${error.message}`);
  }
  return mapToWebhookEvent(data);
}

export async function getWebhookEventsFiltered(
  filters: {
    status?: WebhookStatus[];
    provider?: string;
    since?: Date;
  },
  pagination: { page?: number; limit?: number } = {}
): Promise<{ data: WebhookEvent[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 20 } = pagination;
  const supabase = getSupabaseClient();

  let query = supabase.from('webhook_events').select('*', { count: 'exact' });

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }
  if (filters.provider) {
    query = query.eq('provider', filters.provider);
  }
  if (filters.since) {
    query = query.gte('created_at', filters.since.toISOString());
  }

  const offset = (page - 1) * limit;
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to filter webhook events: ${error.message}`);

  return {
    data: data.map(mapToWebhookEvent),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function getPendingWebhookEvents(limit: number = 10): Promise<WebhookEvent[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('webhook_events')
    .select()
    .eq('status', 'received')
    .lte('run_after', new Date().toISOString())
    .order('run_after', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to get pending webhook events: ${error.message}`);
  return data.map(mapToWebhookEvent);
}

export async function getWebhookEventCounts(since?: Date): Promise<{
  total: number;
  received: number;
  processing: number;
  processed: number;
  failed: number;
}> {
  const supabase = getSupabaseClient();

  let query = supabase.from('webhook_events').select('status');
  if (since) {
    query = query.gte('created_at', since.toISOString());
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get webhook event counts: ${error.message}`);

  const counts = { total: 0, received: 0, processing: 0, processed: 0, failed: 0 };
  for (const row of data) {
    counts.total++;
    const status = row.status as WebhookStatus;
    if (status in counts) {
      counts[status]++;
    }
  }
  return counts;
}

// ============================================
// Interviewer Identities
// ============================================

export async function createInterviewerIdentity(
  identity: InterviewerIdentity
): Promise<InterviewerIdentity> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('interviewer_identities')
    .insert({
      id: identity.id,
      tenant_id: identity.tenantId,
      email: identity.email,
      calendar_provider_user_id: identity.calendarProviderUserId,
      created_at: identity.createdAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create interviewer identity: ${error.message}`);
  return mapToInterviewerIdentity(data);
}

export async function getInterviewerIdentityByEmail(
  email: string
): Promise<InterviewerIdentity | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('interviewer_identities')
    .select()
    .ilike('email', email)
    .maybeSingle();

  if (error) throw new Error(`Failed to get interviewer identity: ${error.message}`);
  return data ? mapToInterviewerIdentity(data) : null;
}

// ============================================
// Tenant Config
// ============================================

export async function getTenantConfig(): Promise<TenantIntegrationConfig | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('tenant_configs')
    .select()
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to get tenant config: ${error.message}`);
  return data ? mapToTenantConfig(data) : null;
}

export async function setTenantConfig(
  config: TenantIntegrationConfig
): Promise<TenantIntegrationConfig> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('tenant_configs')
    .upsert({
      id: config.id,
      graph_tenant_id: config.graph.tenantId,
      graph_client_id: config.graph.clientId,
      graph_client_secret_ref: config.graph.clientSecretRef,
      graph_organizer_email: config.graph.organizerEmail,
      created_at: config.createdAt.toISOString(),
      updated_at: config.updatedAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to set tenant config: ${error.message}`);
  return mapToTenantConfig(data);
}

// ============================================
// Sync Jobs
// ============================================

export async function createSyncJob(job: SyncJob): Promise<SyncJob> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sync_jobs')
    .insert({
      id: job.id,
      type: job.type,
      entity_id: job.entityId,
      entity_type: job.entityType,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      status: job.status,
      last_error: job.lastError,
      payload: job.payload,
      run_after: job.runAfter.toISOString(),
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create sync job: ${error.message}`);
  return mapToSyncJob(data);
}

export async function getSyncJobById(id: string): Promise<SyncJob | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sync_jobs')
    .select()
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get sync job: ${error.message}`);
  }
  return mapToSyncJob(data);
}

export async function updateSyncJob(
  id: string,
  updates: Partial<SyncJob>
): Promise<SyncJob | null> {
  const supabase = getSupabaseClient();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.type !== undefined) dbUpdates.type = updates.type;
  if (updates.entityId !== undefined) dbUpdates.entity_id = updates.entityId;
  if (updates.entityType !== undefined) dbUpdates.entity_type = updates.entityType;
  if (updates.attempts !== undefined) dbUpdates.attempts = updates.attempts;
  if (updates.maxAttempts !== undefined) dbUpdates.max_attempts = updates.maxAttempts;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.lastError !== undefined) dbUpdates.last_error = updates.lastError;
  if (updates.payload !== undefined) dbUpdates.payload = updates.payload;
  if (updates.runAfter !== undefined) dbUpdates.run_after = updates.runAfter.toISOString();

  const { data, error } = await supabase
    .from('sync_jobs')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update sync job: ${error.message}`);
  }
  return mapToSyncJob(data);
}

export async function getPendingSyncJobs(limit: number = 10): Promise<SyncJob[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sync_jobs')
    .select()
    .eq('status', 'pending')
    .lte('run_after', new Date().toISOString())
    .order('run_after', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to get pending sync jobs: ${error.message}`);
  return data.map(mapToSyncJob);
}

export async function getSyncJobsByEntityId(entityId: string): Promise<SyncJob[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sync_jobs')
    .select()
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get sync jobs by entity ID: ${error.message}`);
  return data.map(mapToSyncJob);
}

export async function getLatestSyncJobByEntityId(entityId: string): Promise<SyncJob | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('sync_jobs')
    .select()
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Failed to get latest sync job: ${error.message}`);
  return data ? mapToSyncJob(data) : null;
}

export async function getSyncJobCounts(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  completedLast24h: number;
  failedLast24h: number;
}> {
  const supabase = getSupabaseClient();
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get counts by status
  const { data: statusCounts, error: statusError } = await supabase
    .from('sync_jobs')
    .select('status')
    .returns<Array<{ status: string }>>();

  if (statusError) throw new Error(`Failed to get sync job counts: ${statusError.message}`);

  let pending = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;

  for (const job of statusCounts || []) {
    switch (job.status) {
      case 'pending':
        pending++;
        break;
      case 'processing':
        processing++;
        break;
      case 'completed':
        completed++;
        break;
      case 'failed':
        failed++;
        break;
    }
  }

  // Get completed in last 24h
  const { count: completedLast24h, error: completed24Error } = await supabase
    .from('sync_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed')
    .gte('updated_at', twentyFourHoursAgo);

  if (completed24Error) throw new Error(`Failed to get completed count: ${completed24Error.message}`);

  // Get failed in last 24h
  const { count: failedLast24h, error: failed24Error } = await supabase
    .from('sync_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed')
    .gte('updated_at', twentyFourHoursAgo);

  if (failed24Error) throw new Error(`Failed to get failed count: ${failed24Error.message}`);

  return {
    pending,
    processing,
    completed,
    failed,
    completedLast24h: completedLast24h || 0,
    failedLast24h: failedLast24h || 0,
  };
}

// ============================================
// Reconciliation Jobs
// ============================================

export async function createReconciliationJob(job: ReconciliationJob): Promise<ReconciliationJob> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('reconciliation_jobs')
    .insert({
      id: job.id,
      tenant_id: job.tenantId,
      job_type: job.jobType,
      entity_type: job.entityType,
      entity_id: job.entityId,
      status: job.status,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      last_error: job.lastError,
      detection_reason: job.detectionReason,
      run_after: job.runAfter.toISOString(),
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create reconciliation job: ${error.message}`);
  return mapToReconciliationJob(data);
}

export async function getReconciliationJobById(id: string): Promise<ReconciliationJob | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('reconciliation_jobs')
    .select()
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get reconciliation job: ${error.message}`);
  }
  return mapToReconciliationJob(data);
}

export async function updateReconciliationJob(
  id: string,
  updates: Partial<ReconciliationJob>
): Promise<ReconciliationJob | null> {
  const supabase = getSupabaseClient();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.tenantId !== undefined) dbUpdates.tenant_id = updates.tenantId;
  if (updates.jobType !== undefined) dbUpdates.job_type = updates.jobType;
  if (updates.entityType !== undefined) dbUpdates.entity_type = updates.entityType;
  if (updates.entityId !== undefined) dbUpdates.entity_id = updates.entityId;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.attempts !== undefined) dbUpdates.attempts = updates.attempts;
  if (updates.maxAttempts !== undefined) dbUpdates.max_attempts = updates.maxAttempts;
  if (updates.lastError !== undefined) dbUpdates.last_error = updates.lastError;
  if (updates.detectionReason !== undefined) dbUpdates.detection_reason = updates.detectionReason;
  if (updates.runAfter !== undefined) dbUpdates.run_after = updates.runAfter.toISOString();

  const { data, error } = await supabase
    .from('reconciliation_jobs')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update reconciliation job: ${error.message}`);
  }
  return mapToReconciliationJob(data);
}

export async function getPendingReconciliationJobs(limit: number = 10): Promise<ReconciliationJob[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('reconciliation_jobs')
    .select()
    .eq('status', 'pending')
    .lte('run_after', new Date().toISOString())
    .order('run_after', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to get pending reconciliation jobs: ${error.message}`);
  return data.map(mapToReconciliationJob);
}

export async function getReconciliationJobsByEntityId(entityId: string): Promise<ReconciliationJob[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('reconciliation_jobs')
    .select()
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get reconciliation jobs by entity ID: ${error.message}`);
  return data.map(mapToReconciliationJob);
}

export async function getReconciliationJobsFiltered(
  filters: {
    status?: ReconciliationJobStatus[];
    jobType?: string;
  },
  pagination: { page?: number; limit?: number } = {}
): Promise<{ data: ReconciliationJob[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 20 } = pagination;
  const supabase = getSupabaseClient();

  let query = supabase.from('reconciliation_jobs').select('*', { count: 'exact' });

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }
  if (filters.jobType) {
    query = query.eq('job_type', filters.jobType);
  }

  const offset = (page - 1) * limit;
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to filter reconciliation jobs: ${error.message}`);

  return {
    data: data.map(mapToReconciliationJob),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function getReconciliationJobCounts(): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  requires_attention: number;
}> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('reconciliation_jobs').select('status');

  if (error) throw new Error(`Failed to get reconciliation job counts: ${error.message}`);

  const counts = {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    requires_attention: 0,
  };

  for (const row of data) {
    counts.total++;
    const status = row.status as ReconciliationJobStatus;
    if (status in counts) {
      counts[status]++;
    }
  }

  return counts;
}

// ============================================
// Needs Attention Queries
// ============================================

export async function getRequestsNeedingAttention(
  pagination: { page?: number; limit?: number } = {}
): Promise<{ data: SchedulingRequest[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 20 } = pagination;
  const supabase = getSupabaseClient();

  const offset = (page - 1) * limit;

  const { data, error, count } = await supabase
    .from('scheduling_requests')
    .select('*', { count: 'exact' })
    .eq('needs_attention', true)
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to get requests needing attention: ${error.message}`);

  return {
    data: data.map(mapToSchedulingRequest),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function getNeedsAttentionCount(): Promise<number> {
  const supabase = getSupabaseClient();

  const { count, error } = await supabase
    .from('scheduling_requests')
    .select('*', { count: 'exact', head: true })
    .eq('needs_attention', true);

  if (error) throw new Error(`Failed to get needs attention count: ${error.message}`);
  return count ?? 0;
}

// ============================================
// Availability Requests (Candidate Provides Availability Mode)
// ============================================

export async function createAvailabilityRequest(
  request: AvailabilityRequest
): Promise<AvailabilityRequest> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('availability_requests')
    .insert({
      id: request.id,
      application_id: request.applicationId,
      candidate_name: request.candidateName,
      candidate_email: request.candidateEmail,
      req_id: request.reqId,
      req_title: request.reqTitle,
      interview_type: request.interviewType,
      duration_minutes: request.durationMinutes,
      interviewer_emails: request.interviewerEmails,
      organizer_email: request.organizerEmail,
      calendar_provider: request.calendarProvider,
      graph_tenant_id: request.graphTenantId,
      window_start: request.windowStart.toISOString(),
      window_end: request.windowEnd.toISOString(),
      public_token: request.publicToken,
      public_token_hash: request.publicTokenHash,
      expires_at: request.expiresAt.toISOString(),
      candidate_timezone: request.candidateTimezone,
      status: request.status,
      min_total_minutes: request.minTotalMinutes,
      min_blocks: request.minBlocks,
      created_by: request.createdBy,
      created_at: request.createdAt.toISOString(),
      updated_at: request.updatedAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create availability request: ${error.message}`);
  return mapToAvailabilityRequest(data);
}

export async function getAvailabilityRequestById(
  id: string
): Promise<AvailabilityRequest | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('availability_requests')
    .select('*')
    .eq('id', id)
    .limit(1);

  if (error) {
    throw new Error(`Failed to get availability request: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return mapToAvailabilityRequest(data[0]);
}

export async function getAvailabilityRequestByTokenHash(
  tokenHash: string
): Promise<AvailabilityRequest | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('availability_requests')
    .select('*')
    .eq('public_token_hash', tokenHash)
    .limit(1);

  if (error) {
    throw new Error(`Failed to get availability request by token hash: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return null;
  }

  return mapToAvailabilityRequest(data[0]);
}

export async function updateAvailabilityRequest(
  id: string,
  updates: Partial<AvailabilityRequest>
): Promise<AvailabilityRequest | null> {
  const supabase = getSupabaseClient();

  const dbUpdates: Record<string, unknown> = {};
  if (updates.applicationId !== undefined) dbUpdates.application_id = updates.applicationId;
  if (updates.candidateName !== undefined) dbUpdates.candidate_name = updates.candidateName;
  if (updates.candidateEmail !== undefined) dbUpdates.candidate_email = updates.candidateEmail;
  if (updates.reqId !== undefined) dbUpdates.req_id = updates.reqId;
  if (updates.reqTitle !== undefined) dbUpdates.req_title = updates.reqTitle;
  if (updates.interviewType !== undefined) dbUpdates.interview_type = updates.interviewType;
  if (updates.durationMinutes !== undefined) dbUpdates.duration_minutes = updates.durationMinutes;
  if (updates.interviewerEmails !== undefined) dbUpdates.interviewer_emails = updates.interviewerEmails;
  if (updates.organizerEmail !== undefined) dbUpdates.organizer_email = updates.organizerEmail;
  if (updates.calendarProvider !== undefined) dbUpdates.calendar_provider = updates.calendarProvider;
  if (updates.graphTenantId !== undefined) dbUpdates.graph_tenant_id = updates.graphTenantId;
  if (updates.windowStart !== undefined) dbUpdates.window_start = updates.windowStart.toISOString();
  if (updates.windowEnd !== undefined) dbUpdates.window_end = updates.windowEnd.toISOString();
  if (updates.publicToken !== undefined) dbUpdates.public_token = updates.publicToken;
  if (updates.publicTokenHash !== undefined) dbUpdates.public_token_hash = updates.publicTokenHash;
  if (updates.expiresAt !== undefined) dbUpdates.expires_at = updates.expiresAt.toISOString();
  if (updates.candidateTimezone !== undefined) dbUpdates.candidate_timezone = updates.candidateTimezone;
  if (updates.status !== undefined) dbUpdates.status = updates.status;
  if (updates.minTotalMinutes !== undefined) dbUpdates.min_total_minutes = updates.minTotalMinutes;
  if (updates.minBlocks !== undefined) dbUpdates.min_blocks = updates.minBlocks;
  if (updates.createdBy !== undefined) dbUpdates.created_by = updates.createdBy;

  const { data, error } = await supabase
    .from('availability_requests')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to update availability request: ${error.message}`);
  }
  return mapToAvailabilityRequest(data);
}

export async function getAllAvailabilityRequests(): Promise<AvailabilityRequest[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('availability_requests')
    .select()
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get all availability requests: ${error.message}`);
  return data.map(mapToAvailabilityRequest);
}

export async function getAvailabilityRequestsFiltered(
  filters: {
    status?: AvailabilityRequestStatus[];
  },
  pagination: { page?: number; limit?: number } = {}
): Promise<{ data: AvailabilityRequest[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 20 } = pagination;
  const supabase = getSupabaseClient();

  let query = supabase.from('availability_requests').select('*', { count: 'exact' });

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  const offset = (page - 1) * limit;
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Failed to filter availability requests: ${error.message}`);

  return {
    data: data.map(mapToAvailabilityRequest),
    total: count ?? 0,
    page,
    limit,
  };
}

// ============================================
// Candidate Availability Blocks
// ============================================

export async function createCandidateAvailabilityBlock(
  block: CandidateAvailabilityBlock
): Promise<CandidateAvailabilityBlock> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('candidate_availability_blocks')
    .insert({
      id: block.id,
      availability_request_id: block.availabilityRequestId,
      start_at: block.startAt.toISOString(),
      end_at: block.endAt.toISOString(),
      created_at: block.createdAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create candidate availability block: ${error.message}`);
  return mapToCandidateAvailabilityBlock(data);
}

export async function getCandidateAvailabilityBlocksByRequestId(
  availabilityRequestId: string
): Promise<CandidateAvailabilityBlock[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('candidate_availability_blocks')
    .select()
    .eq('availability_request_id', availabilityRequestId)
    .order('start_at', { ascending: true });

  if (error) throw new Error(`Failed to get candidate availability blocks: ${error.message}`);
  return data.map(mapToCandidateAvailabilityBlock);
}

export async function deleteCandidateAvailabilityBlocksByRequestId(
  availabilityRequestId: string
): Promise<number> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('candidate_availability_blocks')
    .delete()
    .eq('availability_request_id', availabilityRequestId)
    .select();

  if (error) throw new Error(`Failed to delete candidate availability blocks: ${error.message}`);
  return data?.length ?? 0;
}

// ============================================
// Notification Jobs
// ============================================

export async function createNotificationJob(job: NotificationJob): Promise<NotificationJob> {
  const supabase = getSupabaseClient();

  // Check if idempotency key already exists
  const { data: existing } = await supabase
    .from('notification_jobs')
    .select()
    .eq('idempotency_key', job.idempotencyKey)
    .single();

  if (existing) {
    return mapToNotificationJob(existing);
  }

  const { data, error } = await supabase
    .from('notification_jobs')
    .insert({
      id: job.id,
      tenant_id: job.tenantId,
      type: job.type,
      entity_type: job.entityType,
      entity_id: job.entityId,
      idempotency_key: job.idempotencyKey,
      to_email: job.toEmail,
      payload_json: job.payloadJson,
      status: job.status,
      attempts: job.attempts,
      max_attempts: job.maxAttempts,
      run_after: job.runAfter.toISOString(),
      last_error: job.lastError,
      sent_at: job.sentAt?.toISOString() || null,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create notification job: ${error.message}`);
  return mapToNotificationJob(data);
}

export async function getNotificationJobById(id: string): Promise<NotificationJob | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('notification_jobs')
    .select()
    .eq('id', id)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`Failed to get notification job: ${error.message}`);
  return data ? mapToNotificationJob(data) : null;
}

export async function getNotificationJobByIdempotencyKey(
  idempotencyKey: string
): Promise<NotificationJob | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('notification_jobs')
    .select()
    .eq('idempotency_key', idempotencyKey)
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`Failed to get notification job: ${error.message}`);
  return data ? mapToNotificationJob(data) : null;
}

export async function updateNotificationJob(
  id: string,
  updates: Partial<NotificationJob>
): Promise<NotificationJob | null> {
  const supabase = getSupabaseClient();

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.attempts !== undefined) updateData.attempts = updates.attempts;
  if (updates.runAfter !== undefined) updateData.run_after = updates.runAfter.toISOString();
  if (updates.lastError !== undefined) updateData.last_error = updates.lastError;
  if (updates.sentAt !== undefined) updateData.sent_at = updates.sentAt?.toISOString() || null;

  const { data, error } = await supabase
    .from('notification_jobs')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error && error.code !== 'PGRST116') throw new Error(`Failed to update notification job: ${error.message}`);
  return data ? mapToNotificationJob(data) : null;
}

export async function getPendingNotificationJobs(limit: number = 10): Promise<NotificationJob[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('notification_jobs')
    .select()
    .eq('status', 'PENDING')
    .lte('run_after', new Date().toISOString())
    .order('run_after', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Failed to get pending notification jobs: ${error.message}`);
  return (data || []).map(mapToNotificationJob);
}

export async function getNotificationJobsByEntityId(
  entityType: string,
  entityId: string
): Promise<NotificationJob[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('notification_jobs')
    .select()
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get notification jobs: ${error.message}`);
  return (data || []).map(mapToNotificationJob);
}

export async function getNotificationJobsFiltered(
  filters: {
    status?: NotificationStatus[];
    type?: NotificationType[];
    entityType?: string;
    entityId?: string;
  },
  pagination: { page?: number; limit?: number } = {}
): Promise<{ data: NotificationJob[]; total: number; page: number; limit: number }> {
  const supabase = getSupabaseClient();
  const { page = 1, limit = 20 } = pagination;
  const offset = (page - 1) * limit;

  let query = supabase.from('notification_jobs').select('*', { count: 'exact' });

  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }
  if (filters.type && filters.type.length > 0) {
    query = query.in('type', filters.type);
  }
  if (filters.entityType) {
    query = query.eq('entity_type', filters.entityType);
  }
  if (filters.entityId) {
    query = query.eq('entity_id', filters.entityId);
  }

  const { data, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Failed to get notification jobs: ${error.message}`);

  return {
    data: (data || []).map(mapToNotificationJob),
    total: count || 0,
    page,
    limit,
  };
}

export async function getNotificationJobCounts(): Promise<{
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  canceled: number;
}> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('notification_jobs')
    .select('status');

  if (error) throw new Error(`Failed to get notification job counts: ${error.message}`);

  const counts = { total: 0, pending: 0, sending: 0, sent: 0, failed: 0, canceled: 0 };
  for (const row of data || []) {
    counts.total++;
    switch (row.status) {
      case 'PENDING': counts.pending++; break;
      case 'SENDING': counts.sending++; break;
      case 'SENT': counts.sent++; break;
      case 'FAILED': counts.failed++; break;
      case 'CANCELED': counts.canceled++; break;
    }
  }

  return counts;
}

export async function cancelPendingNotificationJobsByEntity(
  entityType: string,
  entityId: string,
  types?: NotificationType[]
): Promise<number> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('notification_jobs')
    .update({ status: 'CANCELED', updated_at: new Date().toISOString() })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('status', 'PENDING');

  if (types && types.length > 0) {
    query = query.in('type', types);
  }

  const { data, error } = await query.select();

  if (error) throw new Error(`Failed to cancel notification jobs: ${error.message}`);
  return data?.length ?? 0;
}

// ============================================
// Notification Attempts
// ============================================

export async function createNotificationAttempt(
  attempt: NotificationAttempt
): Promise<NotificationAttempt> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('notification_attempts')
    .insert({
      id: attempt.id,
      notification_job_id: attempt.notificationJobId,
      attempt_number: attempt.attemptNumber,
      status: attempt.status,
      error: attempt.error,
      provider_message_id: attempt.providerMessageId,
      created_at: attempt.createdAt.toISOString(),
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create notification attempt: ${error.message}`);
  return mapToNotificationAttempt(data);
}

export async function getNotificationAttemptsByJobId(
  notificationJobId: string
): Promise<NotificationAttempt[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('notification_attempts')
    .select()
    .eq('notification_job_id', notificationJobId)
    .order('attempt_number', { ascending: true });

  if (error) throw new Error(`Failed to get notification attempts: ${error.message}`);
  return (data || []).map(mapToNotificationAttempt);
}

// ============================================
// Analytics Aggregation (M12)
// ============================================

export interface AnalyticsDataResult {
  statusCounts: Record<string, number>;
  interviewTypeCounts: Record<string, number>;
  bookingStatusCounts: Record<string, number>;
  cancellationReasons: Record<string, number>;
}

export async function getAnalyticsData(
  start: Date,
  end: Date,
  userId?: string
): Promise<AnalyticsDataResult> {
  const supabase = getSupabaseClient();

  // Query scheduling requests grouped by status
  let statusQuery = supabase
    .from('scheduling_requests')
    .select('status')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (userId) {
    statusQuery = statusQuery.eq('created_by', userId);
  }

  const { data: requestsData, error: requestsError } = await statusQuery;
  if (requestsError) throw new Error(`Failed to get request stats: ${requestsError.message}`);

  // Count statuses and interview types
  const statusCounts: Record<string, number> = {};
  for (const row of requestsData || []) {
    statusCounts[row.status] = (statusCounts[row.status] || 0) + 1;
  }

  // Query interview types
  let typeQuery = supabase
    .from('scheduling_requests')
    .select('interview_type')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  if (userId) {
    typeQuery = typeQuery.eq('created_by', userId);
  }

  const { data: typesData, error: typesError } = await typeQuery;
  if (typesError) throw new Error(`Failed to get type stats: ${typesError.message}`);

  const interviewTypeCounts: Record<string, number> = {};
  for (const row of typesData || []) {
    interviewTypeCounts[row.interview_type] = (interviewTypeCounts[row.interview_type] || 0) + 1;
  }

  // Query bookings for status and cancellation reasons
  // For user filtering, we need to join with scheduling_requests
  let bookingsQuery = supabase
    .from('bookings')
    .select('status, cancellation_reason, request_id')
    .gte('booked_at', start.toISOString())
    .lte('booked_at', end.toISOString());

  const { data: bookingsData, error: bookingsError } = await bookingsQuery;
  if (bookingsError) throw new Error(`Failed to get booking stats: ${bookingsError.message}`);

  const bookingStatusCounts: Record<string, number> = {};
  const cancellationReasons: Record<string, number> = {};

  // If we need to filter by user, get the user's request IDs first
  let userRequestIds: Set<string> | null = null;
  if (userId) {
    const { data: userRequests } = await supabase
      .from('scheduling_requests')
      .select('id')
      .eq('created_by', userId);
    userRequestIds = new Set((userRequests || []).map(r => r.id));
  }

  for (const row of bookingsData || []) {
    // Filter by user if needed
    if (userRequestIds && row.request_id && !userRequestIds.has(row.request_id)) {
      continue;
    }

    bookingStatusCounts[row.status] = (bookingStatusCounts[row.status] || 0) + 1;

    if (row.status === 'cancelled') {
      const reason = row.cancellation_reason || 'Not specified';
      cancellationReasons[reason] = (cancellationReasons[reason] || 0) + 1;
    }
  }

  return {
    statusCounts,
    interviewTypeCounts,
    bookingStatusCounts,
    cancellationReasons,
  };
}

export async function getTimeToScheduleData(
  start: Date,
  end: Date,
  userId?: string
): Promise<number[]> {
  const supabase = getSupabaseClient();

  // Get bookings with their related requests
  let query = supabase
    .from('bookings')
    .select('booked_at, request_id, scheduling_requests!inner(created_at, created_by)')
    .gte('scheduling_requests.created_at', start.toISOString())
    .lte('scheduling_requests.created_at', end.toISOString());

  if (userId) {
    query = query.eq('scheduling_requests.created_by', userId);
  }

  const { data, error } = await query;
  if (error) {
    // Fall back to a simpler query if the join fails
    console.warn('Join query failed, using fallback:', error.message);
    return [];
  }

  const timeToScheduleHours: number[] = [];
  for (const row of data || []) {
    const bookedAt = new Date(row.booked_at);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const createdAt = new Date((row.scheduling_requests as any).created_at);
    const diffMs = bookedAt.getTime() - createdAt.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    timeToScheduleHours.push(diffHours);
  }

  return timeToScheduleHours;
}

export async function getAuditActionCounts(
  start: Date,
  end: Date,
  userId?: string
): Promise<Record<string, number>> {
  const supabase = getSupabaseClient();

  let query = supabase
    .from('audit_logs')
    .select('action, request_id')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  const { data, error } = await query;
  if (error) throw new Error(`Failed to get audit stats: ${error.message}`);

  // If we need to filter by user, get the user's request IDs first
  let userRequestIds: Set<string> | null = null;
  if (userId) {
    const { data: userRequests } = await supabase
      .from('scheduling_requests')
      .select('id')
      .eq('created_by', userId);
    userRequestIds = new Set((userRequests || []).map(r => r.id));
  }

  const actionCounts: Record<string, number> = {};
  for (const row of data || []) {
    // Filter by user if needed
    if (userRequestIds && row.request_id && !userRequestIds.has(row.request_id)) {
      continue;
    }

    actionCounts[row.action] = (actionCounts[row.action] || 0) + 1;
  }

  return actionCounts;
}

// ============================================
// Interviewer Profiles (M15 Capacity Planning)
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InterviewerProfileRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LoadRollupRow = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RecommendationRow = any;

function mapToInterviewerProfile(row: InterviewerProfileRow): InterviewerProfile {
  return {
    id: row.id,
    userId: row.user_id,
    email: row.email,
    organizationId: row.organization_id,
    maxInterviewsPerWeek: row.max_interviews_per_week,
    maxInterviewsPerDay: row.max_interviews_per_day,
    maxConcurrentPerDay: row.max_concurrent_per_day,
    bufferMinutes: row.buffer_minutes,
    preferredTimes: row.preferred_times || {},
    blackoutDates: row.blackout_dates || [],
    interviewTypePreferences: row.interview_type_preferences || [],
    tags: row.tags || [],
    skillAreas: row.skill_areas || [],
    seniorityLevels: row.seniority_levels || [],
    isActive: row.is_active,
    lastCapacityOverrideAt: row.last_capacity_override_at ? new Date(row.last_capacity_override_at) : null,
    lastCapacityOverrideBy: row.last_capacity_override_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createInterviewerProfile(input: InterviewerProfileInput): Promise<InterviewerProfile> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_profiles')
    .insert({
      user_id: input.userId || null,
      email: input.email,
      organization_id: input.organizationId || null,
      max_interviews_per_week: input.maxInterviewsPerWeek ?? 10,
      max_interviews_per_day: input.maxInterviewsPerDay ?? 3,
      max_concurrent_per_day: input.maxConcurrentPerDay ?? 2,
      buffer_minutes: input.bufferMinutes ?? 15,
      preferred_times: input.preferredTimes ?? {},
      blackout_dates: input.blackoutDates ?? [],
      interview_type_preferences: input.interviewTypePreferences ?? [],
      tags: input.tags ?? [],
      skill_areas: input.skillAreas ?? [],
      seniority_levels: input.seniorityLevels ?? [],
      is_active: input.isActive ?? true,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create interviewer profile: ${error.message}`);
  return mapToInterviewerProfile(data);
}

export async function getInterviewerProfileById(id: string): Promise<InterviewerProfile | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_profiles')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to get profile: ${error.message}`);
  return data ? mapToInterviewerProfile(data) : null;
}

export async function getInterviewerProfileByEmail(
  email: string,
  organizationId?: string
): Promise<InterviewerProfile | null> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('interviewer_profiles')
    .select('*')
    .ilike('email', email);
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }
  const { data, error } = await query.limit(1).single();
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to get profile by email: ${error.message}`);
  return data ? mapToInterviewerProfile(data) : null;
}

export async function getInterviewerProfilesByOrg(organizationId: string): Promise<InterviewerProfile[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .order('email');
  if (error) throw new Error(`Failed to get profiles: ${error.message}`);
  return (data || []).map(mapToInterviewerProfile);
}

export async function getActiveInterviewerProfiles(organizationId?: string): Promise<InterviewerProfile[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('interviewer_profiles')
    .select('*')
    .eq('is_active', true);
  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }
  const { data, error } = await query.order('email');
  if (error) throw new Error(`Failed to get active profiles: ${error.message}`);
  return (data || []).map(mapToInterviewerProfile);
}

export async function updateInterviewerProfile(
  id: string,
  updates: Partial<InterviewerProfileInput>
): Promise<InterviewerProfile | null> {
  const supabase = getSupabaseClient();
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.email !== undefined) updateData.email = updates.email;
  if (updates.userId !== undefined) updateData.user_id = updates.userId;
  if (updates.maxInterviewsPerWeek !== undefined) updateData.max_interviews_per_week = updates.maxInterviewsPerWeek;
  if (updates.maxInterviewsPerDay !== undefined) updateData.max_interviews_per_day = updates.maxInterviewsPerDay;
  if (updates.maxConcurrentPerDay !== undefined) updateData.max_concurrent_per_day = updates.maxConcurrentPerDay;
  if (updates.bufferMinutes !== undefined) updateData.buffer_minutes = updates.bufferMinutes;
  if (updates.preferredTimes !== undefined) updateData.preferred_times = updates.preferredTimes;
  if (updates.blackoutDates !== undefined) updateData.blackout_dates = updates.blackoutDates;
  if (updates.interviewTypePreferences !== undefined) updateData.interview_type_preferences = updates.interviewTypePreferences;
  if (updates.tags !== undefined) updateData.tags = updates.tags;
  if (updates.skillAreas !== undefined) updateData.skill_areas = updates.skillAreas;
  if (updates.seniorityLevels !== undefined) updateData.seniority_levels = updates.seniorityLevels;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('interviewer_profiles')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to update profile: ${error.message}`);
  return data ? mapToInterviewerProfile(data) : null;
}

export async function deleteInterviewerProfile(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('interviewer_profiles')
    .delete()
    .eq('id', id);
  if (error) throw new Error(`Failed to delete profile: ${error.message}`);
  return true;
}

// ============================================
// Load Rollups (M15 Capacity Planning)
// ============================================

function mapToLoadRollup(row: LoadRollupRow): InterviewerLoadRollup {
  return {
    id: row.id,
    interviewerProfileId: row.interviewer_profile_id,
    organizationId: row.organization_id,
    weekStart: new Date(row.week_start),
    weekEnd: new Date(row.week_end),
    scheduledCount: row.scheduled_count,
    completedCount: row.completed_count,
    cancelledCount: row.cancelled_count,
    rescheduledCount: row.rescheduled_count,
    utilizationPct: parseFloat(row.utilization_pct),
    peakDayCount: row.peak_day_count,
    avgDailyCount: parseFloat(row.avg_daily_count),
    byInterviewType: row.by_interview_type || {},
    byDayOfWeek: row.by_day_of_week || {},
    byHourOfDay: row.by_hour_of_day || {},
    atCapacity: row.at_capacity,
    overCapacity: row.over_capacity,
    computedAt: new Date(row.computed_at),
    computationDurationMs: row.computation_duration_ms,
  };
}

export async function createLoadRollup(input: LoadRollupInput): Promise<InterviewerLoadRollup> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_load_rollups')
    .insert({
      interviewer_profile_id: input.interviewerProfileId,
      organization_id: input.organizationId,
      week_start: input.weekStart.toISOString().split('T')[0],
      week_end: input.weekEnd.toISOString().split('T')[0],
      scheduled_count: input.scheduledCount,
      completed_count: input.completedCount,
      cancelled_count: input.cancelledCount,
      rescheduled_count: input.rescheduledCount,
      utilization_pct: input.utilizationPct,
      peak_day_count: input.peakDayCount,
      avg_daily_count: input.avgDailyCount,
      by_interview_type: input.byInterviewType,
      by_day_of_week: input.byDayOfWeek,
      by_hour_of_day: input.byHourOfDay,
      at_capacity: input.atCapacity,
      over_capacity: input.overCapacity,
      computation_duration_ms: input.computationDurationMs,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create load rollup: ${error.message}`);
  return mapToLoadRollup(data);
}

export async function getLoadRollupById(id: string): Promise<InterviewerLoadRollup | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_load_rollups')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to get rollup: ${error.message}`);
  return data ? mapToLoadRollup(data) : null;
}

export async function getLoadRollupByProfileAndWeek(
  interviewerProfileId: string,
  weekStart: Date
): Promise<InterviewerLoadRollup | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_load_rollups')
    .select('*')
    .eq('interviewer_profile_id', interviewerProfileId)
    .eq('week_start', weekStart.toISOString().split('T')[0])
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to get rollup: ${error.message}`);
  return data ? mapToLoadRollup(data) : null;
}

export async function getLoadRollupsByOrg(
  organizationId: string,
  weekStart?: Date
): Promise<InterviewerLoadRollup[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('interviewer_load_rollups')
    .select('*')
    .eq('organization_id', organizationId);
  if (weekStart) {
    query = query.eq('week_start', weekStart.toISOString().split('T')[0]);
  }
  const { data, error } = await query.order('week_start', { ascending: false });
  if (error) throw new Error(`Failed to get rollups: ${error.message}`);
  return (data || []).map(mapToLoadRollup);
}

export async function upsertLoadRollup(input: LoadRollupInput): Promise<InterviewerLoadRollup> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_load_rollups')
    .upsert({
      interviewer_profile_id: input.interviewerProfileId,
      organization_id: input.organizationId,
      week_start: input.weekStart.toISOString().split('T')[0],
      week_end: input.weekEnd.toISOString().split('T')[0],
      scheduled_count: input.scheduledCount,
      completed_count: input.completedCount,
      cancelled_count: input.cancelledCount,
      rescheduled_count: input.rescheduledCount,
      utilization_pct: input.utilizationPct,
      peak_day_count: input.peakDayCount,
      avg_daily_count: input.avgDailyCount,
      by_interview_type: input.byInterviewType,
      by_day_of_week: input.byDayOfWeek,
      by_hour_of_day: input.byHourOfDay,
      at_capacity: input.atCapacity,
      over_capacity: input.overCapacity,
      computation_duration_ms: input.computationDurationMs,
      computed_at: new Date().toISOString(),
    }, {
      onConflict: 'interviewer_profile_id,week_start',
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to upsert load rollup: ${error.message}`);
  return mapToLoadRollup(data);
}

export async function getAtCapacityInterviewers(
  organizationId: string,
  weekStart: Date
): Promise<InterviewerLoadRollup[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_load_rollups')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('week_start', weekStart.toISOString().split('T')[0])
    .eq('at_capacity', true);
  if (error) throw new Error(`Failed to get at-capacity interviewers: ${error.message}`);
  return (data || []).map(mapToLoadRollup);
}

export async function getOverCapacityInterviewers(
  organizationId: string,
  weekStart: Date
): Promise<InterviewerLoadRollup[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('interviewer_load_rollups')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('week_start', weekStart.toISOString().split('T')[0])
    .eq('over_capacity', true);
  if (error) throw new Error(`Failed to get over-capacity interviewers: ${error.message}`);
  return (data || []).map(mapToLoadRollup);
}

// ============================================
// Scheduling Recommendations (M15 Capacity Planning)
// ============================================

function mapToRecommendation(row: RecommendationRow): SchedulingRecommendation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    schedulingRequestId: row.scheduling_request_id,
    availabilityRequestId: row.availability_request_id,
    recommendationType: row.recommendation_type,
    priority: row.priority,
    title: row.title,
    description: row.description,
    evidence: row.evidence,
    suggestedAction: row.suggested_action,
    actionData: row.action_data,
    status: row.status,
    dismissedAt: row.dismissed_at ? new Date(row.dismissed_at) : null,
    dismissedBy: row.dismissed_by,
    dismissedReason: row.dismissed_reason,
    actedAt: row.acted_at ? new Date(row.acted_at) : null,
    actedBy: row.acted_by,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    createdAt: new Date(row.created_at),
  };
}

export async function createRecommendation(input: RecommendationInput): Promise<SchedulingRecommendation> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('scheduling_recommendations')
    .insert({
      organization_id: input.organizationId,
      scheduling_request_id: input.schedulingRequestId || null,
      availability_request_id: input.availabilityRequestId || null,
      recommendation_type: input.recommendationType,
      priority: input.priority,
      title: input.title,
      description: input.description,
      evidence: input.evidence,
      suggested_action: input.suggestedAction || null,
      action_data: input.actionData || null,
      expires_at: input.expiresAt?.toISOString() || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Failed to create recommendation: ${error.message}`);
  return mapToRecommendation(data);
}

export async function getRecommendationById(id: string): Promise<SchedulingRecommendation | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('scheduling_recommendations')
    .select('*')
    .eq('id', id)
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to get recommendation: ${error.message}`);
  return data ? mapToRecommendation(data) : null;
}

export async function getRecommendationsByOrg(
  organizationId: string,
  status?: RecommendationStatus
): Promise<SchedulingRecommendation[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('scheduling_recommendations')
    .select('*')
    .eq('organization_id', organizationId);
  if (status) {
    query = query.eq('status', status);
  }
  const { data, error } = await query
    .order('priority')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to get recommendations: ${error.message}`);
  return (data || []).map(mapToRecommendation);
}

export async function getRecommendationsByRequest(
  schedulingRequestId: string
): Promise<SchedulingRecommendation[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('scheduling_recommendations')
    .select('*')
    .eq('scheduling_request_id', schedulingRequestId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to get recommendations by request: ${error.message}`);
  return (data || []).map(mapToRecommendation);
}

export async function getActiveRecommendationsByType(
  organizationId: string,
  recommendationType: string
): Promise<SchedulingRecommendation[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('scheduling_recommendations')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('recommendation_type', recommendationType)
    .eq('status', 'active');
  if (error) throw new Error(`Failed to get recommendations by type: ${error.message}`);
  return (data || []).map(mapToRecommendation);
}

export async function updateRecommendation(
  id: string,
  updates: Partial<Pick<SchedulingRecommendation, 'status' | 'dismissedAt' | 'dismissedBy' | 'dismissedReason' | 'actedAt' | 'actedBy'>>
): Promise<SchedulingRecommendation | null> {
  const supabase = getSupabaseClient();
  const updateData: Record<string, unknown> = {};

  if (updates.status !== undefined) updateData.status = updates.status;
  if (updates.dismissedAt !== undefined) updateData.dismissed_at = updates.dismissedAt?.toISOString();
  if (updates.dismissedBy !== undefined) updateData.dismissed_by = updates.dismissedBy;
  if (updates.dismissedReason !== undefined) updateData.dismissed_reason = updates.dismissedReason;
  if (updates.actedAt !== undefined) updateData.acted_at = updates.actedAt?.toISOString();
  if (updates.actedBy !== undefined) updateData.acted_by = updates.actedBy;

  const { data, error } = await supabase
    .from('scheduling_recommendations')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  if (error && error.code !== 'PGRST116') throw new Error(`Failed to update recommendation: ${error.message}`);
  return data ? mapToRecommendation(data) : null;
}

export async function dismissRecommendation(
  id: string,
  dismissedBy: string,
  reason?: string
): Promise<SchedulingRecommendation | null> {
  return updateRecommendation(id, {
    status: 'dismissed',
    dismissedAt: new Date(),
    dismissedBy,
    dismissedReason: reason || null,
  });
}

export async function markRecommendationActed(
  id: string,
  actedBy: string
): Promise<SchedulingRecommendation | null> {
  return updateRecommendation(id, {
    status: 'acted',
    actedAt: new Date(),
    actedBy,
  });
}

export async function expireOldRecommendations(): Promise<number> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('scheduling_recommendations')
    .update({ status: 'expired' })
    .eq('status', 'active')
    .lt('expires_at', new Date().toISOString())
    .select();
  if (error) throw new Error(`Failed to expire recommendations: ${error.message}`);
  return (data || []).length;
}

// ============================================
// Coordinator Notification Preferences (M16)
// ============================================

function mapCoordinatorPreferencesRow(row: any): CoordinatorNotificationPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    organizationId: row.organization_id,
    notifyOnBooking: row.notify_on_booking,
    notifyOnCancel: row.notify_on_cancel,
    notifyOnEscalation: row.notify_on_escalation,
    digestFrequency: row.digest_frequency,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getCoordinatorPreferences(
  userId: string,
  organizationId: string
): Promise<CoordinatorNotificationPreferences | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('coordinator_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to get coordinator preferences: ${error.message}`);
  }
  return data ? mapCoordinatorPreferencesRow(data) : null;
}

export async function getCoordinatorPreferencesByOrg(
  organizationId: string
): Promise<CoordinatorNotificationPreferences[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('coordinator_notification_preferences')
    .select('*')
    .eq('organization_id', organizationId);

  if (error) throw new Error(`Failed to get org coordinator preferences: ${error.message}`);
  return (data || []).map(mapCoordinatorPreferencesRow);
}

export async function upsertCoordinatorPreferences(
  preferences: CoordinatorNotificationPreferences
): Promise<CoordinatorNotificationPreferences> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('coordinator_notification_preferences')
    .upsert({
      id: preferences.id,
      user_id: preferences.userId,
      organization_id: preferences.organizationId,
      notify_on_booking: preferences.notifyOnBooking,
      notify_on_cancel: preferences.notifyOnCancel,
      notify_on_escalation: preferences.notifyOnEscalation,
      digest_frequency: preferences.digestFrequency,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,organization_id',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to upsert coordinator preferences: ${error.message}`);
  return mapCoordinatorPreferencesRow(data);
}

export async function deleteCoordinatorPreferences(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('coordinator_notification_preferences')
    .delete()
    .eq('user_id', userId)
    .eq('organization_id', organizationId);

  if (error) throw new Error(`Failed to delete coordinator preferences: ${error.message}`);
  return true;
}

// ============================================
// Loop Autopilot (M18)
// ============================================

// Type mappers for Loop entities
function mapToLoopTemplate(row: LoopTemplateRow): LoopTemplate {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
  };
}

function mapToLoopSessionTemplate(row: LoopSessionTemplateRow): LoopSessionTemplate {
  return {
    id: row.id,
    loopTemplateId: row.loop_template_id,
    order: row.order,
    name: row.name,
    durationMinutes: row.duration_minutes,
    interviewerPool: row.interviewer_pool,
    constraints: row.constraints || {},
    createdAt: new Date(row.created_at),
  };
}

function mapToLoopSolveRun(row: LoopSolveRunRow): LoopSolveRun {
  return {
    id: row.id,
    organizationId: row.organization_id,
    availabilityRequestId: row.availability_request_id,
    loopTemplateId: row.loop_template_id,
    inputsSnapshot: row.inputs_snapshot,
    status: row.status as LoopSolveStatus,
    resultSnapshot: row.result_snapshot,
    solutionsCount: row.solutions_count,
    solveDurationMs: row.solve_duration_ms,
    searchIterations: row.search_iterations,
    graphApiCalls: row.graph_api_calls,
    errorMessage: row.error_message,
    errorStack: row.error_stack,
    createdAt: new Date(row.created_at),
    solveIdempotencyKey: row.solve_idempotency_key,
  };
}

function mapToLoopBooking(row: LoopBookingRow): LoopBooking {
  return {
    id: row.id,
    organizationId: row.organization_id,
    availabilityRequestId: row.availability_request_id,
    loopTemplateId: row.loop_template_id,
    solveRunId: row.solve_run_id,
    chosenSolutionId: row.chosen_solution_id,
    status: row.status as LoopBookingStatus,
    rollbackAttempted: row.rollback_attempted,
    rollbackDetails: row.rollback_details,
    errorMessage: row.error_message,
    commitIdempotencyKey: row.commit_idempotency_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function mapToLoopBookingItem(row: LoopBookingItemRow): LoopBookingItem {
  return {
    id: row.id,
    loopBookingId: row.loop_booking_id,
    sessionTemplateId: row.session_template_id,
    bookingId: row.booking_id,
    calendarEventId: row.calendar_event_id,
    status: row.status,
    createdAt: new Date(row.created_at),
  };
}

// Loop Templates
export async function createLoopTemplate(
  input: CreateLoopTemplateInput
): Promise<LoopTemplate> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_templates')
    .insert({
      organization_id: input.organizationId,
      name: input.name,
      description: input.description || null,
      is_active: true,
      created_by: input.createdBy,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create loop template: ${error.message}`);
  return mapToLoopTemplate(data);
}

export async function getLoopTemplateById(id: string): Promise<LoopTemplate | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_templates')
    .select('*')
    .eq('id', id)
    .limit(1);

  if (error) throw new Error(`Failed to get loop template: ${error.message}`);
  if (!data || data.length === 0) return null;
  return mapToLoopTemplate(data[0]);
}

export async function getLoopTemplatesByOrg(
  organizationId: string,
  activeOnly: boolean = true
): Promise<LoopTemplate[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('loop_templates')
    .select('*')
    .eq('organization_id', organizationId);

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query.order('name');

  if (error) throw new Error(`Failed to get loop templates: ${error.message}`);
  return (data || []).map(mapToLoopTemplate);
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
  const supabase = getSupabaseClient();
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.description !== undefined) dbUpdates.description = updates.description;
  if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('loop_templates')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update loop template: ${error.message}`);
  }
  return mapToLoopTemplate(data);
}

export async function deleteLoopTemplate(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('loop_templates')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete loop template: ${error.message}`);
  return true;
}

// Loop Session Templates
export async function createLoopSessionTemplate(
  input: CreateLoopSessionTemplateInput
): Promise<LoopSessionTemplate> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_session_templates')
    .insert({
      loop_template_id: input.loopTemplateId,
      order: input.order,
      name: input.name,
      duration_minutes: input.durationMinutes,
      interviewer_pool: input.interviewerPool,
      constraints: input.constraints || {},
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create loop session template: ${error.message}`);
  return mapToLoopSessionTemplate(data);
}

export async function getLoopSessionTemplatesByTemplateId(
  loopTemplateId: string
): Promise<LoopSessionTemplate[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_session_templates')
    .select('*')
    .eq('loop_template_id', loopTemplateId)
    .order('order');

  if (error) throw new Error(`Failed to get loop session templates: ${error.message}`);
  return (data || []).map(mapToLoopSessionTemplate);
}

export async function deleteLoopSessionTemplate(id: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('loop_session_templates')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Failed to delete loop session template: ${error.message}`);
  return true;
}

// Loop Solve Runs
export async function createLoopSolveRun(
  input: CreateLoopSolveRunInput
): Promise<LoopSolveRun> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_solve_runs')
    .insert({
      organization_id: input.organizationId,
      availability_request_id: input.availabilityRequestId,
      loop_template_id: input.loopTemplateId,
      inputs_snapshot: input.inputsSnapshot,
      status: 'SOLVED',
      solutions_count: 0,
      solve_idempotency_key: input.solveIdempotencyKey || null,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create loop solve run: ${error.message}`);
  return mapToLoopSolveRun(data);
}

export async function getLoopSolveRunById(id: string): Promise<LoopSolveRun | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_solve_runs')
    .select('*')
    .eq('id', id)
    .limit(1);

  if (error) throw new Error(`Failed to get loop solve run: ${error.message}`);
  if (!data || data.length === 0) return null;
  return mapToLoopSolveRun(data[0]);
}

export async function getLoopSolveRunByIdempotencyKey(
  key: string
): Promise<LoopSolveRun | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_solve_runs')
    .select('*')
    .eq('solve_idempotency_key', key)
    .limit(1);

  if (error) throw new Error(`Failed to get loop solve run by idempotency key: ${error.message}`);
  if (!data || data.length === 0) return null;
  return mapToLoopSolveRun(data[0]);
}

export async function getLatestLoopSolveRun(
  availabilityRequestId: string
): Promise<LoopSolveRun | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_solve_runs')
    .select('*')
    .eq('availability_request_id', availabilityRequestId)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) throw new Error(`Failed to get latest loop solve run: ${error.message}`);
  if (!data || data.length === 0) return null;
  return mapToLoopSolveRun(data[0]);
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
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_solve_runs')
    .update({
      status: result.status,
      result_snapshot: result,
      solutions_count: result.solutions.length,
      solve_duration_ms: metadata.solveDurationMs,
      search_iterations: metadata.searchIterations,
      graph_api_calls: metadata.graphApiCalls,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update loop solve run result: ${error.message}`);
  }
  return mapToLoopSolveRun(data);
}

export async function updateLoopSolveRunError(
  id: string,
  errorMessage: string,
  errorStack?: string
): Promise<LoopSolveRun | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_solve_runs')
    .update({
      status: 'ERROR',
      error_message: errorMessage,
      error_stack: errorStack || null,
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update loop solve run error: ${error.message}`);
  }
  return mapToLoopSolveRun(data);
}

export async function getLoopSolveRunsForOps(
  organizationId: string | null,
  since: Date
): Promise<LoopSolveRun[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('loop_solve_runs')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get loop solve runs for ops: ${error.message}`);
  return (data || []).map(mapToLoopSolveRun);
}

// Loop Bookings
export async function createLoopBooking(
  input: CreateLoopBookingInput
): Promise<LoopBooking> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_bookings')
    .insert({
      organization_id: input.organizationId,
      availability_request_id: input.availabilityRequestId,
      loop_template_id: input.loopTemplateId,
      solve_run_id: input.solveRunId,
      chosen_solution_id: input.chosenSolutionId,
      status: 'PENDING',
      commit_idempotency_key: input.commitIdempotencyKey,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create loop booking: ${error.message}`);
  return mapToLoopBooking(data);
}

export async function getLoopBookingById(id: string): Promise<LoopBooking | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_bookings')
    .select('*')
    .eq('id', id)
    .limit(1);

  if (error) throw new Error(`Failed to get loop booking: ${error.message}`);
  if (!data || data.length === 0) return null;
  return mapToLoopBooking(data[0]);
}

export async function getLoopBookingByIdempotencyKey(
  key: string
): Promise<LoopBooking | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_bookings')
    .select('*')
    .eq('commit_idempotency_key', key)
    .limit(1);

  if (error) throw new Error(`Failed to get loop booking by idempotency key: ${error.message}`);
  if (!data || data.length === 0) return null;
  return mapToLoopBooking(data[0]);
}

export async function getLoopBookingByAvailabilityRequest(
  availabilityRequestId: string
): Promise<LoopBooking | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_bookings')
    .select('*')
    .eq('availability_request_id', availabilityRequestId)
    .eq('status', 'COMMITTED')
    .limit(1);

  if (error) throw new Error(`Failed to get loop booking by availability request: ${error.message}`);
  if (!data || data.length === 0) return null;
  return mapToLoopBooking(data[0]);
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
  const supabase = getSupabaseClient();
  const updates: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (details?.errorMessage !== undefined) updates.error_message = details.errorMessage;
  if (details?.rollbackAttempted !== undefined) updates.rollback_attempted = details.rollbackAttempted;
  if (details?.rollbackDetails !== undefined) updates.rollback_details = details.rollbackDetails;

  const { data, error } = await supabase
    .from('loop_bookings')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to update loop booking status: ${error.message}`);
  }
  return mapToLoopBooking(data);
}

export async function getLoopBookingsForOps(
  organizationId: string | null,
  since: Date
): Promise<LoopBooking[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('loop_bookings')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false });

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Failed to get loop bookings for ops: ${error.message}`);
  return (data || []).map(mapToLoopBooking);
}

// Loop Booking Items
export async function createLoopBookingItem(
  input: CreateLoopBookingItemInput
): Promise<LoopBookingItem> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_booking_items')
    .insert({
      loop_booking_id: input.loopBookingId,
      session_template_id: input.sessionTemplateId,
      booking_id: input.bookingId,
      calendar_event_id: input.calendarEventId,
      status: 'confirmed',
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create loop booking item: ${error.message}`);
  return mapToLoopBookingItem(data);
}

export async function getLoopBookingItems(
  loopBookingId: string
): Promise<LoopBookingItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('loop_booking_items')
    .select('*')
    .eq('loop_booking_id', loopBookingId);

  if (error) throw new Error(`Failed to get loop booking items: ${error.message}`);
  return (data || []).map(mapToLoopBookingItem);
}

// Seed Loop Templates (for development)
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
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00', minGapToNextMinutes: 15 },
  });

  await createLoopSessionTemplate({
    loopTemplateId: standardTemplate.id,
    order: 1,
    name: 'Technical Deep Dive',
    durationMinutes: 60,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00', minGapToNextMinutes: 15 },
  });

  await createLoopSessionTemplate({
    loopTemplateId: standardTemplate.id,
    order: 2,
    name: 'Values Interview',
    durationMinutes: 45,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00' },
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
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00', minGapToNextMinutes: 15 },
  });

  await createLoopSessionTemplate({
    loopTemplateId: lightTemplate.id,
    order: 1,
    name: 'Technical Assessment',
    durationMinutes: 45,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00' },
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
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00', minGapToNextMinutes: 15 },
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 1,
    name: 'System Design',
    durationMinutes: 60,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00', minGapToNextMinutes: 15 },
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 2,
    name: 'Coding Interview',
    durationMinutes: 60,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00', minGapToNextMinutes: 15 },
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 3,
    name: 'Values Interview',
    durationMinutes: 45,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00', minGapToNextMinutes: 15 },
  });

  await createLoopSessionTemplate({
    loopTemplateId: fullTemplate.id,
    order: 4,
    name: 'Executive Interview',
    durationMinutes: 30,
    interviewerPool: { emails: [], requiredCount: 1 },
    constraints: { earliestStartLocal: '09:00', latestEndLocal: '17:00' },
  });
}

// Clear Loop Stores (for testing)
export async function clearLoopStores(): Promise<void> {
  const supabase = getSupabaseClient();
  await supabase.from('loop_booking_items').delete().neq('id', '');
  await supabase.from('loop_bookings').delete().neq('id', '');
  await supabase.from('loop_solve_runs').delete().neq('id', '');
  await supabase.from('loop_session_templates').delete().neq('id', '');
  await supabase.from('loop_templates').delete().neq('id', '');
}

// ============================================
// Reset (for testing) - Truncates all tables
// ============================================

export async function resetDatabase(): Promise<void> {
  const supabase = getSupabaseClient();

  // Delete in order respecting foreign key constraints
  // Loop Autopilot tables first (new in M18)
  await supabase.from('loop_booking_items').delete().neq('id', '');
  await supabase.from('loop_bookings').delete().neq('id', '');
  await supabase.from('loop_solve_runs').delete().neq('id', '');
  await supabase.from('loop_session_templates').delete().neq('id', '');
  await supabase.from('loop_templates').delete().neq('id', '');
  // Existing tables
  await supabase.from('scheduling_recommendations').delete().neq('id', '');
  await supabase.from('interviewer_load_rollups').delete().neq('id', '');
  await supabase.from('interviewer_profiles').delete().neq('id', '');
  await supabase.from('coordinator_notification_preferences').delete().neq('id', '');
  await supabase.from('notification_attempts').delete().neq('id', '');
  await supabase.from('notification_jobs').delete().neq('id', '');
  await supabase.from('candidate_availability_blocks').delete().neq('id', '');
  await supabase.from('availability_requests').delete().neq('id', '');
  await supabase.from('audit_logs').delete().neq('id', '');
  await supabase.from('sync_jobs').delete().neq('id', '');
  await supabase.from('webhook_events').delete().neq('id', '');
  await supabase.from('reconciliation_jobs').delete().neq('id', '');
  await supabase.from('bookings').delete().neq('id', '');
  await supabase.from('scheduling_requests').delete().neq('id', '');
  await supabase.from('interviewer_identities').delete().neq('id', '');
  await supabase.from('tenant_configs').delete().neq('id', '');
}
