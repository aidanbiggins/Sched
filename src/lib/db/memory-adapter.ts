/**
 * In-Memory Database for Development
 *
 * This module provides a simple in-memory store for development and testing.
 * In production, this would be replaced with a real database (e.g., Supabase, PostgreSQL).
 */

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
  AvailabilityRequest,
  AvailabilityRequestStatus,
  CandidateAvailabilityBlock,
  NotificationJob,
  NotificationAttempt,
  NotificationStatus,
  NotificationType,
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

// ============================================
// In-Memory Store
// ============================================

interface Store {
  schedulingRequests: Map<string, SchedulingRequest>;
  bookings: Map<string, Booking>;
  auditLogs: AuditLog[];
  webhookEvents: Map<string, WebhookEvent>;
  interviewerIdentities: Map<string, InterviewerIdentity>;
  tenantConfigs: Map<string, TenantIntegrationConfig>;
  syncJobs: Map<string, SyncJob>;
  reconciliationJobs: Map<string, ReconciliationJob>;
  availabilityRequests: Map<string, AvailabilityRequest>;
  candidateAvailabilityBlocks: Map<string, CandidateAvailabilityBlock>;
  notificationJobs: Map<string, NotificationJob>;
  notificationAttempts: Map<string, NotificationAttempt>;
  interviewerProfiles: Map<string, InterviewerProfile>;
  loadRollups: Map<string, InterviewerLoadRollup>;
  recommendations: Map<string, SchedulingRecommendation>;
  coordinatorPreferences: Map<string, CoordinatorNotificationPreferences>;
}

const store: Store = {
  schedulingRequests: new Map(),
  bookings: new Map(),
  auditLogs: [],
  webhookEvents: new Map(),
  interviewerIdentities: new Map(),
  tenantConfigs: new Map(),
  syncJobs: new Map(),
  reconciliationJobs: new Map(),
  availabilityRequests: new Map(),
  candidateAvailabilityBlocks: new Map(),
  notificationJobs: new Map(),
  notificationAttempts: new Map(),
  interviewerProfiles: new Map(),
  loadRollups: new Map(),
  recommendations: new Map(),
  coordinatorPreferences: new Map(),
};

// ============================================
// Scheduling Requests
// ============================================

export async function createSchedulingRequest(request: SchedulingRequest): Promise<SchedulingRequest> {
  store.schedulingRequests.set(request.id, request);
  return request;
}

export async function getSchedulingRequestById(id: string): Promise<SchedulingRequest | null> {
  return store.schedulingRequests.get(id) || null;
}

export async function getSchedulingRequestByTokenHash(tokenHash: string): Promise<SchedulingRequest | null> {
  for (const request of Array.from(store.schedulingRequests.values())) {
    if (request.publicTokenHash === tokenHash) {
      return request;
    }
  }
  return null;
}

export async function updateSchedulingRequest(
  id: string,
  updates: Partial<SchedulingRequest>
): Promise<SchedulingRequest | null> {
  const existing = store.schedulingRequests.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates, updatedAt: new Date() };
  store.schedulingRequests.set(id, updated);
  return updated;
}

export async function getAllSchedulingRequests(): Promise<SchedulingRequest[]> {
  return Array.from(store.schedulingRequests.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

// Alias for reconciliation service
export const getAllRequests = getAllSchedulingRequests;

// Alias for reconciliation service
export const getRequestById = getSchedulingRequestById;

// Alias for reconciliation service
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
  let requests = Array.from(store.schedulingRequests.values());

  // Apply createdBy filter (user scoping)
  if (filters.createdBy) {
    requests = requests.filter((r) => r.createdBy === filters.createdBy);
  }

  // Apply status filter
  if (filters.status && filters.status.length > 0) {
    requests = requests.filter((r) => filters.status!.includes(r.status));
  }

  // Apply search filter (candidate email, application id, request id)
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    requests = requests.filter((r) =>
      r.candidateEmail.toLowerCase().includes(searchLower) ||
      (r.applicationId && r.applicationId.toLowerCase().includes(searchLower)) ||
      r.id.toLowerCase().includes(searchLower)
    );
  }

  // Apply age range filter
  if (filters.ageRange) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    requests = requests.filter((r) => {
      const age = (now - r.createdAt.getTime()) / dayMs;
      switch (filters.ageRange) {
        case '0-2d': return age <= 2;
        case '3-7d': return age > 2 && age <= 7;
        case '8-14d': return age > 7 && age <= 14;
        case '15+d': return age > 14;
        default: return true;
      }
    });
  }

  // Apply interviewer email filter
  if (filters.interviewerEmail) {
    const emailLower = filters.interviewerEmail.toLowerCase();
    requests = requests.filter((r) =>
      r.interviewerEmails.some((e) => e.toLowerCase() === emailLower)
    );
  }

  // Apply needsSync filter (check sync jobs)
  if (filters.needsSync) {
    const requestsWithSyncIssues: string[] = [];
    for (const job of Array.from(store.syncJobs.values())) {
      if (job.status === 'failed' || job.status === 'pending') {
        if (job.entityType === 'scheduling_request') {
          requestsWithSyncIssues.push(job.entityId);
        }
      }
    }
    requests = requests.filter((r) => requestsWithSyncIssues.includes(r.id));
  }

  // Sort
  requests.sort((a, b) => {
    // Special sort: pending first, then by age (oldest first)
    if (sortBy === 'status') {
      const statusOrder: Record<string, number> = { pending: 0, booked: 1, rescheduled: 2, cancelled: 3 };
      const orderA = statusOrder[a.status] ?? 99;
      const orderB = statusOrder[b.status] ?? 99;
      if (orderA !== orderB) return orderA - orderB;
      // Within same status, sort by age (oldest first)
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    // Default: sort by createdAt
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    return sortOrder === 'asc' ? diff : -diff;
  });

  const total = requests.length;
  const totalPages = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const data = requests.slice(offset, offset + limit);

  return { data, total, page, limit, totalPages };
}

export async function getSchedulingRequestCounts(userId?: string): Promise<Record<string, number>> {
  let requests = Array.from(store.schedulingRequests.values());

  // Filter by user if provided
  if (userId) {
    requests = requests.filter((r) => r.createdBy === userId);
  }

  const counts: Record<string, number> = {
    pending: 0,
    booked: 0,
    cancelled: 0,
    rescheduled: 0,
    all: requests.length,
  };
  for (const r of requests) {
    if (counts[r.status] !== undefined) {
      counts[r.status]++;
    }
  }
  return counts;
}

// ============================================
// Bookings
// ============================================

export async function createBooking(booking: Booking): Promise<Booking> {
  store.bookings.set(booking.id, booking);
  return booking;
}

export async function getBookingById(id: string): Promise<Booking | null> {
  return store.bookings.get(id) || null;
}

export async function getBookingByRequestId(requestId: string): Promise<Booking | null> {
  for (const booking of Array.from(store.bookings.values())) {
    if (booking.requestId === requestId) {
      return booking;
    }
  }
  return null;
}

export async function updateBooking(
  id: string,
  updates: Partial<Booking>
): Promise<Booking | null> {
  const existing = store.bookings.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates, updatedAt: new Date() };
  store.bookings.set(id, updated);
  return updated;
}

export async function getAllBookings(): Promise<Booking[]> {
  return Array.from(store.bookings.values());
}

export async function getBookingsInTimeRange(
  start: Date,
  end: Date,
  interviewerEmails?: string[]
): Promise<Booking[]> {
  const bookings: Booking[] = [];

  for (const booking of Array.from(store.bookings.values())) {
    if (booking.status === 'cancelled') continue;
    if (booking.scheduledEnd <= start || booking.scheduledStart >= end) continue;

    if (interviewerEmails && interviewerEmails.length > 0) {
      // Skip if no requestId (availability request booking)
      if (!booking.requestId) continue;
      const request = store.schedulingRequests.get(booking.requestId);
      if (!request) continue;

      const hasOverlap = request.interviewerEmails.some((email) =>
        interviewerEmails.includes(email)
      );
      if (!hasOverlap) continue;
    }

    bookings.push(booking);
  }

  return bookings;
}

// ============================================
// Audit Log
// ============================================

export async function createAuditLog(log: AuditLog): Promise<AuditLog> {
  store.auditLogs.push(log);
  return log;
}

export async function getAuditLogsByRequestId(requestId: string): Promise<AuditLog[]> {
  return store.auditLogs.filter((log) => log.requestId === requestId);
}

export async function getAllAuditLogs(): Promise<AuditLog[]> {
  return [...store.auditLogs].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

// ============================================
// Webhook Events (enhanced for M6)
// ============================================

export async function createWebhookEvent(event: WebhookEvent): Promise<WebhookEvent> {
  store.webhookEvents.set(event.id, event);
  return event;
}

export async function getWebhookEventById(id: string): Promise<WebhookEvent | null> {
  return store.webhookEvents.get(id) || null;
}

export async function getWebhookEventByEventId(eventId: string): Promise<WebhookEvent | null> {
  for (const event of Array.from(store.webhookEvents.values())) {
    if (event.eventId === eventId) {
      return event;
    }
  }
  return null;
}

export async function getWebhookEventByPayloadHash(
  tenantId: string | null,
  provider: string,
  payloadHash: string
): Promise<WebhookEvent | null> {
  for (const event of Array.from(store.webhookEvents.values())) {
    if (
      event.tenantId === tenantId &&
      event.provider === provider &&
      event.payloadHash === payloadHash
    ) {
      return event;
    }
  }
  return null;
}

export async function updateWebhookEvent(
  id: string,
  updates: Partial<WebhookEvent>
): Promise<WebhookEvent | null> {
  const existing = store.webhookEvents.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates, updatedAt: new Date() };
  store.webhookEvents.set(id, updated);
  return updated;
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
  let events = Array.from(store.webhookEvents.values());

  if (filters.status && filters.status.length > 0) {
    events = events.filter((e) => filters.status!.includes(e.status));
  }
  if (filters.provider) {
    events = events.filter((e) => e.provider === filters.provider);
  }
  if (filters.since) {
    events = events.filter((e) => e.createdAt >= filters.since!);
  }

  events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = events.length;
  const offset = (page - 1) * limit;
  const data = events.slice(offset, offset + limit);

  return { data, total, page, limit };
}

export async function getPendingWebhookEvents(limit: number = 10): Promise<WebhookEvent[]> {
  const now = new Date();
  const events: WebhookEvent[] = [];

  for (const event of Array.from(store.webhookEvents.values())) {
    if (event.status === 'received' && event.runAfter <= now) {
      events.push(event);
    }
  }

  return events
    .sort((a, b) => a.runAfter.getTime() - b.runAfter.getTime())
    .slice(0, limit);
}

export async function getWebhookEventCounts(since?: Date): Promise<{
  total: number;
  received: number;
  processing: number;
  processed: number;
  failed: number;
}> {
  let events = Array.from(store.webhookEvents.values());
  if (since) {
    events = events.filter((e) => e.createdAt >= since);
  }

  const counts = { total: 0, received: 0, processing: 0, processed: 0, failed: 0 };
  for (const event of events) {
    counts.total++;
    counts[event.status]++;
  }
  return counts;
}

// ============================================
// Interviewer Identities
// ============================================

export async function createInterviewerIdentity(
  identity: InterviewerIdentity
): Promise<InterviewerIdentity> {
  store.interviewerIdentities.set(identity.id, identity);
  return identity;
}

export async function getInterviewerIdentityByEmail(
  email: string
): Promise<InterviewerIdentity | null> {
  for (const identity of Array.from(store.interviewerIdentities.values())) {
    if (identity.email.toLowerCase() === email.toLowerCase()) {
      return identity;
    }
  }
  return null;
}

// ============================================
// Tenant Config
// ============================================

export async function getTenantConfig(): Promise<TenantIntegrationConfig | null> {
  // For now, return the first config (single-tenant)
  const configs = Array.from(store.tenantConfigs.values());
  return configs[0] || null;
}

export async function setTenantConfig(
  config: TenantIntegrationConfig
): Promise<TenantIntegrationConfig> {
  store.tenantConfigs.set(config.id, config);
  return config;
}

// ============================================
// Sync Jobs
// ============================================

export async function createSyncJob(job: SyncJob): Promise<SyncJob> {
  store.syncJobs.set(job.id, job);
  return job;
}

export async function getSyncJobById(id: string): Promise<SyncJob | null> {
  return store.syncJobs.get(id) || null;
}

export async function updateSyncJob(
  id: string,
  updates: Partial<SyncJob>
): Promise<SyncJob | null> {
  const existing = store.syncJobs.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates, updatedAt: new Date() };
  store.syncJobs.set(id, updated);
  return updated;
}

export async function getPendingSyncJobs(limit: number = 10): Promise<SyncJob[]> {
  const now = new Date();
  const jobs: SyncJob[] = [];

  for (const job of Array.from(store.syncJobs.values())) {
    if (job.status === 'pending' && job.runAfter <= now) {
      jobs.push(job);
    }
  }

  // Sort by runAfter (oldest first) and limit
  return jobs
    .sort((a, b) => a.runAfter.getTime() - b.runAfter.getTime())
    .slice(0, limit);
}

export async function getSyncJobsByEntityId(entityId: string): Promise<SyncJob[]> {
  const jobs: SyncJob[] = [];
  for (const job of Array.from(store.syncJobs.values())) {
    if (job.entityId === entityId) {
      jobs.push(job);
    }
  }
  return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getLatestSyncJobByEntityId(entityId: string): Promise<SyncJob | null> {
  const jobs = await getSyncJobsByEntityId(entityId);
  return jobs[0] || null;
}

export async function getSyncJobCounts(): Promise<{
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  completedLast24h: number;
  failedLast24h: number;
}> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  let pending = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;
  let completedLast24h = 0;
  let failedLast24h = 0;

  for (const job of Array.from(store.syncJobs.values())) {
    switch (job.status) {
      case 'pending':
        pending++;
        break;
      case 'processing':
        processing++;
        break;
      case 'completed':
        completed++;
        if (job.updatedAt >= twentyFourHoursAgo) {
          completedLast24h++;
        }
        break;
      case 'failed':
        failed++;
        if (job.updatedAt >= twentyFourHoursAgo) {
          failedLast24h++;
        }
        break;
    }
  }

  return {
    pending,
    processing,
    completed,
    failed,
    completedLast24h,
    failedLast24h,
  };
}

// ============================================
// Reconciliation Jobs (M6)
// ============================================

export async function createReconciliationJob(job: ReconciliationJob): Promise<ReconciliationJob> {
  store.reconciliationJobs.set(job.id, job);
  return job;
}

export async function getReconciliationJobById(id: string): Promise<ReconciliationJob | null> {
  return store.reconciliationJobs.get(id) || null;
}

export async function updateReconciliationJob(
  id: string,
  updates: Partial<ReconciliationJob>
): Promise<ReconciliationJob | null> {
  const existing = store.reconciliationJobs.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates, updatedAt: new Date() };
  store.reconciliationJobs.set(id, updated);
  return updated;
}

export async function getPendingReconciliationJobs(limit: number = 10): Promise<ReconciliationJob[]> {
  const now = new Date();
  const jobs: ReconciliationJob[] = [];

  for (const job of Array.from(store.reconciliationJobs.values())) {
    if (job.status === 'pending' && job.runAfter <= now) {
      jobs.push(job);
    }
  }

  return jobs
    .sort((a, b) => a.runAfter.getTime() - b.runAfter.getTime())
    .slice(0, limit);
}

export async function getReconciliationJobsByEntityId(entityId: string): Promise<ReconciliationJob[]> {
  const jobs: ReconciliationJob[] = [];
  for (const job of Array.from(store.reconciliationJobs.values())) {
    if (job.entityId === entityId) {
      jobs.push(job);
    }
  }
  return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getReconciliationJobsFiltered(
  filters: {
    status?: ReconciliationJobStatus[];
    jobType?: string;
  },
  pagination: { page?: number; limit?: number } = {}
): Promise<{ data: ReconciliationJob[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 20 } = pagination;
  let jobs = Array.from(store.reconciliationJobs.values());

  if (filters.status && filters.status.length > 0) {
    jobs = jobs.filter((j) => filters.status!.includes(j.status));
  }
  if (filters.jobType) {
    jobs = jobs.filter((j) => j.jobType === filters.jobType);
  }

  jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = jobs.length;
  const offset = (page - 1) * limit;
  const data = jobs.slice(offset, offset + limit);

  return { data, total, page, limit };
}

export async function getReconciliationJobCounts(): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  requires_attention: number;
}> {
  const jobs = Array.from(store.reconciliationJobs.values());
  const counts = {
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    requires_attention: 0,
  };
  for (const job of jobs) {
    counts.total++;
    counts[job.status]++;
  }
  return counts;
}

// ============================================
// Needs Attention Queries (M6)
// ============================================

export async function getRequestsNeedingAttention(
  pagination: { page?: number; limit?: number } = {}
): Promise<{ data: SchedulingRequest[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 20 } = pagination;
  let requests = Array.from(store.schedulingRequests.values()).filter(
    (r) => r.needsAttention === true
  );

  requests.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const total = requests.length;
  const offset = (page - 1) * limit;
  const data = requests.slice(offset, offset + limit);

  return { data, total, page, limit };
}

export async function getNeedsAttentionCount(): Promise<number> {
  let count = 0;
  for (const request of Array.from(store.schedulingRequests.values())) {
    if (request.needsAttention) {
      count++;
    }
  }
  return count;
}

// ============================================
// Availability Requests (Candidate Provides Availability Mode)
// ============================================

export async function createAvailabilityRequest(
  request: AvailabilityRequest
): Promise<AvailabilityRequest> {
  store.availabilityRequests.set(request.id, request);
  return request;
}

export async function getAvailabilityRequestById(
  id: string
): Promise<AvailabilityRequest | null> {
  return store.availabilityRequests.get(id) || null;
}

export async function getAvailabilityRequestByTokenHash(
  tokenHash: string
): Promise<AvailabilityRequest | null> {
  for (const request of Array.from(store.availabilityRequests.values())) {
    if (request.publicTokenHash === tokenHash) {
      return request;
    }
  }
  return null;
}

export async function updateAvailabilityRequest(
  id: string,
  updates: Partial<AvailabilityRequest>
): Promise<AvailabilityRequest | null> {
  const existing = store.availabilityRequests.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates, updatedAt: new Date() };
  store.availabilityRequests.set(id, updated);
  return updated;
}

export async function getAllAvailabilityRequests(): Promise<AvailabilityRequest[]> {
  return Array.from(store.availabilityRequests.values()).sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
  );
}

export async function getAvailabilityRequestsFiltered(
  filters: {
    status?: AvailabilityRequestStatus[];
  },
  pagination: { page?: number; limit?: number } = {}
): Promise<{ data: AvailabilityRequest[]; total: number; page: number; limit: number }> {
  const { page = 1, limit = 20 } = pagination;
  let requests = Array.from(store.availabilityRequests.values());

  if (filters.status && filters.status.length > 0) {
    requests = requests.filter((r) => filters.status!.includes(r.status));
  }

  requests.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = requests.length;
  const offset = (page - 1) * limit;
  const data = requests.slice(offset, offset + limit);

  return { data, total, page, limit };
}

// ============================================
// Candidate Availability Blocks
// ============================================

export async function createCandidateAvailabilityBlock(
  block: CandidateAvailabilityBlock
): Promise<CandidateAvailabilityBlock> {
  store.candidateAvailabilityBlocks.set(block.id, block);
  return block;
}

export async function getCandidateAvailabilityBlocksByRequestId(
  availabilityRequestId: string
): Promise<CandidateAvailabilityBlock[]> {
  const blocks: CandidateAvailabilityBlock[] = [];
  for (const block of Array.from(store.candidateAvailabilityBlocks.values())) {
    if (block.availabilityRequestId === availabilityRequestId) {
      blocks.push(block);
    }
  }
  return blocks.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

export async function deleteCandidateAvailabilityBlocksByRequestId(
  availabilityRequestId: string
): Promise<number> {
  let deleted = 0;
  for (const [id, block] of Array.from(store.candidateAvailabilityBlocks.entries())) {
    if (block.availabilityRequestId === availabilityRequestId) {
      store.candidateAvailabilityBlocks.delete(id);
      deleted++;
    }
  }
  return deleted;
}

// ============================================
// Notification Jobs
// ============================================

export async function createNotificationJob(job: NotificationJob): Promise<NotificationJob> {
  // Check idempotency key
  for (const existing of Array.from(store.notificationJobs.values())) {
    if (existing.idempotencyKey === job.idempotencyKey) {
      return existing; // Return existing job (idempotent)
    }
  }
  store.notificationJobs.set(job.id, job);
  return job;
}

export async function getNotificationJobById(id: string): Promise<NotificationJob | null> {
  return store.notificationJobs.get(id) || null;
}

export async function getNotificationJobByIdempotencyKey(
  idempotencyKey: string
): Promise<NotificationJob | null> {
  for (const job of Array.from(store.notificationJobs.values())) {
    if (job.idempotencyKey === idempotencyKey) {
      return job;
    }
  }
  return null;
}

export async function updateNotificationJob(
  id: string,
  updates: Partial<NotificationJob>
): Promise<NotificationJob | null> {
  const existing = store.notificationJobs.get(id);
  if (!existing) return null;

  const updated = { ...existing, ...updates, updatedAt: new Date() };
  store.notificationJobs.set(id, updated);
  return updated;
}

export async function getPendingNotificationJobs(limit: number = 10): Promise<NotificationJob[]> {
  const now = new Date();
  const pending: NotificationJob[] = [];

  for (const job of Array.from(store.notificationJobs.values())) {
    if (job.status === 'PENDING' && job.runAfter <= now) {
      pending.push(job);
    }
  }

  // Sort by runAfter ascending (oldest first)
  pending.sort((a, b) => a.runAfter.getTime() - b.runAfter.getTime());

  return pending.slice(0, limit);
}

export async function getNotificationJobsByEntityId(
  entityType: string,
  entityId: string
): Promise<NotificationJob[]> {
  const jobs: NotificationJob[] = [];
  for (const job of Array.from(store.notificationJobs.values())) {
    if (job.entityType === entityType && job.entityId === entityId) {
      jobs.push(job);
    }
  }
  return jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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
  const { page = 1, limit = 20 } = pagination;
  let jobs = Array.from(store.notificationJobs.values());

  if (filters.status && filters.status.length > 0) {
    jobs = jobs.filter((j) => filters.status!.includes(j.status));
  }
  if (filters.type && filters.type.length > 0) {
    jobs = jobs.filter((j) => filters.type!.includes(j.type));
  }
  if (filters.entityType) {
    jobs = jobs.filter((j) => j.entityType === filters.entityType);
  }
  if (filters.entityId) {
    jobs = jobs.filter((j) => j.entityId === filters.entityId);
  }

  jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = jobs.length;
  const offset = (page - 1) * limit;
  const data = jobs.slice(offset, offset + limit);

  return { data, total, page, limit };
}

export async function getNotificationJobCounts(): Promise<{
  total: number;
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  canceled: number;
}> {
  const counts = { total: 0, pending: 0, sending: 0, sent: 0, failed: 0, canceled: 0 };

  for (const job of Array.from(store.notificationJobs.values())) {
    counts.total++;
    switch (job.status) {
      case 'PENDING':
        counts.pending++;
        break;
      case 'SENDING':
        counts.sending++;
        break;
      case 'SENT':
        counts.sent++;
        break;
      case 'FAILED':
        counts.failed++;
        break;
      case 'CANCELED':
        counts.canceled++;
        break;
    }
  }

  return counts;
}

export async function cancelPendingNotificationJobsByEntity(
  entityType: string,
  entityId: string,
  types?: NotificationType[]
): Promise<number> {
  let cancelled = 0;
  for (const job of Array.from(store.notificationJobs.values())) {
    if (
      job.entityType === entityType &&
      job.entityId === entityId &&
      job.status === 'PENDING' &&
      (!types || types.includes(job.type))
    ) {
      job.status = 'CANCELED';
      job.updatedAt = new Date();
      store.notificationJobs.set(job.id, job);
      cancelled++;
    }
  }
  return cancelled;
}

// ============================================
// Notification Attempts
// ============================================

export async function createNotificationAttempt(
  attempt: NotificationAttempt
): Promise<NotificationAttempt> {
  store.notificationAttempts.set(attempt.id, attempt);
  return attempt;
}

export async function getNotificationAttemptsByJobId(
  notificationJobId: string
): Promise<NotificationAttempt[]> {
  const attempts: NotificationAttempt[] = [];
  for (const attempt of Array.from(store.notificationAttempts.values())) {
    if (attempt.notificationJobId === notificationJobId) {
      attempts.push(attempt);
    }
  }
  return attempts.sort((a, b) => a.attemptNumber - b.attemptNumber);
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
  const statusCounts: Record<string, number> = {};
  const interviewTypeCounts: Record<string, number> = {};
  const bookingStatusCounts: Record<string, number> = {};
  const cancellationReasons: Record<string, number> = {};

  // Count scheduling requests
  for (const request of Array.from(store.schedulingRequests.values())) {
    // Filter by date range
    if (request.createdAt < start || request.createdAt > end) continue;
    // Filter by user if specified
    if (userId && request.createdBy !== userId) continue;

    // Count by status
    statusCounts[request.status] = (statusCounts[request.status] || 0) + 1;

    // Count by interview type
    interviewTypeCounts[request.interviewType] =
      (interviewTypeCounts[request.interviewType] || 0) + 1;
  }

  // Count bookings and cancellation reasons
  for (const booking of Array.from(store.bookings.values())) {
    // Filter by date range
    if (booking.bookedAt < start || booking.bookedAt > end) continue;

    // If userId filter is set, we need to check if the related request belongs to this user
    if (userId && booking.requestId) {
      const request = store.schedulingRequests.get(booking.requestId);
      if (!request || request.createdBy !== userId) continue;
    }

    // Count by booking status
    bookingStatusCounts[booking.status] =
      (bookingStatusCounts[booking.status] || 0) + 1;

    // Count cancellation reasons
    if (booking.status === 'cancelled') {
      const reason = booking.cancellationReason || 'Not specified';
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
  const timeToScheduleHours: number[] = [];

  for (const booking of Array.from(store.bookings.values())) {
    if (!booking.requestId) continue;

    const request = store.schedulingRequests.get(booking.requestId);
    if (!request) continue;

    // Filter by date range (use request creation date)
    if (request.createdAt < start || request.createdAt > end) continue;

    // Filter by user if specified
    if (userId && request.createdBy !== userId) continue;

    // Calculate time-to-schedule in hours
    const diffMs = booking.bookedAt.getTime() - request.createdAt.getTime();
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
  const actionCounts: Record<string, number> = {};

  for (const log of store.auditLogs) {
    // Filter by date range
    if (log.createdAt < start || log.createdAt > end) continue;

    // Filter by user if specified
    if (userId && log.requestId) {
      const request = store.schedulingRequests.get(log.requestId);
      if (!request || request.createdBy !== userId) continue;
    }

    // Count by action
    actionCounts[log.action] = (actionCounts[log.action] || 0) + 1;
  }

  return actionCounts;
}

// ============================================
// Interviewer Profiles
// ============================================

export async function createInterviewerProfile(input: InterviewerProfileInput): Promise<InterviewerProfile> {
  const id = crypto.randomUUID();
  const now = new Date();
  const profile: InterviewerProfile = {
    id,
    userId: input.userId || null,
    email: input.email,
    organizationId: input.organizationId || null,
    maxInterviewsPerWeek: input.maxInterviewsPerWeek ?? 10,
    maxInterviewsPerDay: input.maxInterviewsPerDay ?? 3,
    maxConcurrentPerDay: input.maxConcurrentPerDay ?? 2,
    bufferMinutes: input.bufferMinutes ?? 15,
    preferredTimes: input.preferredTimes ?? {},
    blackoutDates: input.blackoutDates ?? [],
    interviewTypePreferences: input.interviewTypePreferences ?? [],
    tags: input.tags ?? [],
    skillAreas: input.skillAreas ?? [],
    seniorityLevels: input.seniorityLevels ?? [],
    isActive: input.isActive ?? true,
    lastCapacityOverrideAt: null,
    lastCapacityOverrideBy: null,
    createdAt: now,
    updatedAt: now,
  };
  store.interviewerProfiles.set(id, profile);
  return profile;
}

export async function getInterviewerProfileById(id: string): Promise<InterviewerProfile | null> {
  return store.interviewerProfiles.get(id) || null;
}

export async function getInterviewerProfileByEmail(
  email: string,
  organizationId?: string
): Promise<InterviewerProfile | null> {
  const emailLower = email.toLowerCase();
  for (const profile of Array.from(store.interviewerProfiles.values())) {
    if (profile.email.toLowerCase() === emailLower) {
      if (organizationId && profile.organizationId !== organizationId) continue;
      return profile;
    }
  }
  return null;
}

export async function getInterviewerProfilesByOrg(organizationId: string): Promise<InterviewerProfile[]> {
  return Array.from(store.interviewerProfiles.values())
    .filter(p => p.organizationId === organizationId)
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function getActiveInterviewerProfiles(organizationId?: string): Promise<InterviewerProfile[]> {
  return Array.from(store.interviewerProfiles.values())
    .filter(p => p.isActive && (!organizationId || p.organizationId === organizationId))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function updateInterviewerProfile(
  id: string,
  updates: Partial<InterviewerProfileInput>
): Promise<InterviewerProfile | null> {
  const existing = store.interviewerProfiles.get(id);
  if (!existing) return null;

  const updated: InterviewerProfile = {
    ...existing,
    ...updates,
    updatedAt: new Date(),
  };
  store.interviewerProfiles.set(id, updated);
  return updated;
}

export async function deleteInterviewerProfile(id: string): Promise<boolean> {
  return store.interviewerProfiles.delete(id);
}

// ============================================
// Load Rollups
// ============================================

export async function createLoadRollup(input: LoadRollupInput): Promise<InterviewerLoadRollup> {
  const id = crypto.randomUUID();
  const rollup: InterviewerLoadRollup = {
    id,
    interviewerProfileId: input.interviewerProfileId,
    organizationId: input.organizationId,
    weekStart: input.weekStart,
    weekEnd: input.weekEnd,
    scheduledCount: input.scheduledCount,
    completedCount: input.completedCount,
    cancelledCount: input.cancelledCount,
    rescheduledCount: input.rescheduledCount,
    utilizationPct: input.utilizationPct,
    peakDayCount: input.peakDayCount,
    avgDailyCount: input.avgDailyCount,
    byInterviewType: input.byInterviewType,
    byDayOfWeek: input.byDayOfWeek,
    byHourOfDay: input.byHourOfDay,
    atCapacity: input.atCapacity,
    overCapacity: input.overCapacity,
    computedAt: new Date(),
    computationDurationMs: input.computationDurationMs ?? null,
  };
  store.loadRollups.set(id, rollup);
  return rollup;
}

export async function getLoadRollupById(id: string): Promise<InterviewerLoadRollup | null> {
  return store.loadRollups.get(id) || null;
}

export async function getLoadRollupByProfileAndWeek(
  interviewerProfileId: string,
  weekStart: Date
): Promise<InterviewerLoadRollup | null> {
  const weekStartTime = weekStart.getTime();
  for (const rollup of Array.from(store.loadRollups.values())) {
    if (
      rollup.interviewerProfileId === interviewerProfileId &&
      rollup.weekStart.getTime() === weekStartTime
    ) {
      return rollup;
    }
  }
  return null;
}

export async function getLoadRollupsByOrg(
  organizationId: string,
  weekStart?: Date
): Promise<InterviewerLoadRollup[]> {
  return Array.from(store.loadRollups.values())
    .filter(r => {
      if (r.organizationId !== organizationId) return false;
      if (weekStart && r.weekStart.getTime() !== weekStart.getTime()) return false;
      return true;
    })
    .sort((a, b) => b.weekStart.getTime() - a.weekStart.getTime());
}

export async function upsertLoadRollup(input: LoadRollupInput): Promise<InterviewerLoadRollup> {
  const existing = await getLoadRollupByProfileAndWeek(input.interviewerProfileId, input.weekStart);
  if (existing) {
    const updated: InterviewerLoadRollup = {
      ...existing,
      ...input,
      computedAt: new Date(),
    };
    store.loadRollups.set(existing.id, updated);
    return updated;
  }
  return createLoadRollup(input);
}

export async function getAtCapacityInterviewers(
  organizationId: string,
  weekStart: Date
): Promise<InterviewerLoadRollup[]> {
  return Array.from(store.loadRollups.values())
    .filter(r =>
      r.organizationId === organizationId &&
      r.weekStart.getTime() === weekStart.getTime() &&
      r.atCapacity
    );
}

export async function getOverCapacityInterviewers(
  organizationId: string,
  weekStart: Date
): Promise<InterviewerLoadRollup[]> {
  return Array.from(store.loadRollups.values())
    .filter(r =>
      r.organizationId === organizationId &&
      r.weekStart.getTime() === weekStart.getTime() &&
      r.overCapacity
    );
}

// ============================================
// Scheduling Recommendations
// ============================================

export async function createRecommendation(input: RecommendationInput): Promise<SchedulingRecommendation> {
  const id = crypto.randomUUID();
  const recommendation: SchedulingRecommendation = {
    id,
    organizationId: input.organizationId,
    schedulingRequestId: input.schedulingRequestId || null,
    availabilityRequestId: input.availabilityRequestId || null,
    recommendationType: input.recommendationType,
    priority: input.priority,
    title: input.title,
    description: input.description,
    evidence: input.evidence,
    suggestedAction: input.suggestedAction || null,
    actionData: input.actionData || null,
    status: 'active',
    dismissedAt: null,
    dismissedBy: null,
    dismissedReason: null,
    actedAt: null,
    actedBy: null,
    expiresAt: input.expiresAt || null,
    createdAt: new Date(),
  };
  store.recommendations.set(id, recommendation);
  return recommendation;
}

export async function getRecommendationById(id: string): Promise<SchedulingRecommendation | null> {
  return store.recommendations.get(id) || null;
}

export async function getRecommendationsByOrg(
  organizationId: string,
  status?: RecommendationStatus
): Promise<SchedulingRecommendation[]> {
  return Array.from(store.recommendations.values())
    .filter(r => {
      if (r.organizationId !== organizationId) return false;
      if (status && r.status !== status) return false;
      return true;
    })
    .sort((a, b) => {
      // Sort by priority (critical first), then by date
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
}

export async function getRecommendationsByRequest(
  schedulingRequestId: string
): Promise<SchedulingRecommendation[]> {
  return Array.from(store.recommendations.values())
    .filter(r => r.schedulingRequestId === schedulingRequestId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function getActiveRecommendationsByType(
  organizationId: string,
  recommendationType: string
): Promise<SchedulingRecommendation[]> {
  return Array.from(store.recommendations.values())
    .filter(r =>
      r.organizationId === organizationId &&
      r.recommendationType === recommendationType &&
      r.status === 'active'
    );
}

export async function updateRecommendation(
  id: string,
  updates: Partial<Pick<SchedulingRecommendation, 'status' | 'dismissedAt' | 'dismissedBy' | 'dismissedReason' | 'actedAt' | 'actedBy'>>
): Promise<SchedulingRecommendation | null> {
  const existing = store.recommendations.get(id);
  if (!existing) return null;

  const updated: SchedulingRecommendation = {
    ...existing,
    ...updates,
  };
  store.recommendations.set(id, updated);
  return updated;
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
  const now = new Date();
  let expiredCount = 0;

  for (const [id, rec] of store.recommendations) {
    if (rec.status === 'active' && rec.expiresAt && rec.expiresAt < now) {
      store.recommendations.set(id, { ...rec, status: 'expired' });
      expiredCount++;
    }
  }

  return expiredCount;
}

// ============================================
// Coordinator Notification Preferences (M16)
// ============================================

export async function getCoordinatorPreferences(
  userId: string,
  organizationId: string
): Promise<CoordinatorNotificationPreferences | null> {
  const key = `${userId}:${organizationId}`;
  return store.coordinatorPreferences.get(key) || null;
}

export async function getCoordinatorPreferencesByOrg(
  organizationId: string
): Promise<CoordinatorNotificationPreferences[]> {
  const results: CoordinatorNotificationPreferences[] = [];
  for (const prefs of store.coordinatorPreferences.values()) {
    if (prefs.organizationId === organizationId) {
      results.push(prefs);
    }
  }
  return results;
}

export async function upsertCoordinatorPreferences(
  preferences: CoordinatorNotificationPreferences
): Promise<CoordinatorNotificationPreferences> {
  const key = `${preferences.userId}:${preferences.organizationId}`;
  const existing = store.coordinatorPreferences.get(key);

  if (existing) {
    // Update existing
    const updated = {
      ...existing,
      ...preferences,
      updatedAt: new Date(),
    };
    store.coordinatorPreferences.set(key, updated);
    return updated;
  } else {
    // Create new
    const now = new Date();
    const newPrefs = {
      ...preferences,
      createdAt: preferences.createdAt || now,
      updatedAt: now,
    };
    store.coordinatorPreferences.set(key, newPrefs);
    return newPrefs;
  }
}

export async function deleteCoordinatorPreferences(
  userId: string,
  organizationId: string
): Promise<boolean> {
  const key = `${userId}:${organizationId}`;
  return store.coordinatorPreferences.delete(key);
}

// ============================================
// Reset (for testing)
// ============================================

export function resetDatabase(): void {
  store.schedulingRequests.clear();
  store.bookings.clear();
  store.auditLogs.length = 0;
  store.webhookEvents.clear();
  store.interviewerIdentities.clear();
  store.tenantConfigs.clear();
  store.syncJobs.clear();
  store.reconciliationJobs.clear();
  store.availabilityRequests.clear();
  store.candidateAvailabilityBlocks.clear();
  store.notificationJobs.clear();
  store.notificationAttempts.clear();
  store.interviewerProfiles.clear();
  store.loadRollups.clear();
  store.recommendations.clear();
  store.coordinatorPreferences.clear();
}
