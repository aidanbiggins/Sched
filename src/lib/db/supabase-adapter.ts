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
} from '@/types/scheduling';
// Database row types for mapping - using inline types for flexibility
// until we generate proper types from a real Supabase project
/* eslint-disable @typescript-eslint/no-explicit-any */
type SchedulingRequestRow = any;
type BookingRow = any;
type AuditLogRow = any;
type SyncJobRow = any;
type WebhookEventRow = any;
type ReconciliationJobRow = any;
type InterviewerIdentityRow = any;
type TenantConfigRow = any;
type AvailabilityRequestRow = any;
type CandidateAvailabilityBlockRow = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ============================================
// Type Mappers (DB Row <-> Domain Type)
// ============================================

function mapToSchedulingRequest(row: SchedulingRequestRow): SchedulingRequest {
  return {
    id: row.id,
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

// ============================================
// Scheduling Requests
// ============================================

export async function createSchedulingRequest(request: SchedulingRequest): Promise<SchedulingRequest> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('scheduling_requests')
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
// Reset (for testing) - Truncates all tables
// ============================================

export async function resetDatabase(): Promise<void> {
  const supabase = getSupabaseClient();

  // Delete in order respecting foreign key constraints
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
