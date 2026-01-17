/**
 * Database Factory
 *
 * Switches between in-memory and Supabase database adapters based on DB_MODE.
 * - DB_MODE=memory (default): Uses in-memory storage for development
 * - DB_MODE=supabase: Uses Supabase PostgreSQL for production
 *
 * All functions maintain the same interface regardless of the adapter.
 */

import * as memoryAdapter from './memory-adapter';
import * as supabaseAdapter from './supabase-adapter';
import * as loopMemoryAdapter from './loop-adapter';

// Determine which adapter to use
const isSupabase = process.env.DB_MODE === 'supabase';

// Re-export types that are defined in the adapters
export type {
  SchedulingRequestFilters,
  PaginationOptions,
  PaginatedResult,
  AnalyticsDataResult,
} from './memory-adapter';

// ============================================
// Scheduling Requests
// ============================================

export const createSchedulingRequest = isSupabase
  ? supabaseAdapter.createSchedulingRequest
  : memoryAdapter.createSchedulingRequest;

export const getSchedulingRequestById = isSupabase
  ? supabaseAdapter.getSchedulingRequestById
  : memoryAdapter.getSchedulingRequestById;

export const getSchedulingRequestByTokenHash = isSupabase
  ? supabaseAdapter.getSchedulingRequestByTokenHash
  : memoryAdapter.getSchedulingRequestByTokenHash;

export const updateSchedulingRequest = isSupabase
  ? supabaseAdapter.updateSchedulingRequest
  : memoryAdapter.updateSchedulingRequest;

export const getAllSchedulingRequests = isSupabase
  ? supabaseAdapter.getAllSchedulingRequests
  : memoryAdapter.getAllSchedulingRequests;

export const getSchedulingRequestsFiltered = isSupabase
  ? supabaseAdapter.getSchedulingRequestsFiltered
  : memoryAdapter.getSchedulingRequestsFiltered;

export const getSchedulingRequestCounts = isSupabase
  ? supabaseAdapter.getSchedulingRequestCounts
  : memoryAdapter.getSchedulingRequestCounts;

// Aliases for reconciliation service
export const getAllRequests = isSupabase
  ? supabaseAdapter.getAllRequests
  : memoryAdapter.getAllRequests;

export const getRequestById = isSupabase
  ? supabaseAdapter.getRequestById
  : memoryAdapter.getRequestById;

export const updateRequest = isSupabase
  ? supabaseAdapter.updateRequest
  : memoryAdapter.updateRequest;

// ============================================
// Bookings
// ============================================

export const createBooking = isSupabase
  ? supabaseAdapter.createBooking
  : memoryAdapter.createBooking;

export const getBookingById = isSupabase
  ? supabaseAdapter.getBookingById
  : memoryAdapter.getBookingById;

export const getBookingByRequestId = isSupabase
  ? supabaseAdapter.getBookingByRequestId
  : memoryAdapter.getBookingByRequestId;

export const updateBooking = isSupabase
  ? supabaseAdapter.updateBooking
  : memoryAdapter.updateBooking;

export const getAllBookings = isSupabase
  ? supabaseAdapter.getAllBookings
  : memoryAdapter.getAllBookings;

export const getBookingsInTimeRange = isSupabase
  ? supabaseAdapter.getBookingsInTimeRange
  : memoryAdapter.getBookingsInTimeRange;

// ============================================
// Audit Log
// ============================================

export const createAuditLog = isSupabase
  ? supabaseAdapter.createAuditLog
  : memoryAdapter.createAuditLog;

export const getAuditLogsByRequestId = isSupabase
  ? supabaseAdapter.getAuditLogsByRequestId
  : memoryAdapter.getAuditLogsByRequestId;

export const getAllAuditLogs = isSupabase
  ? supabaseAdapter.getAllAuditLogs
  : memoryAdapter.getAllAuditLogs;

// ============================================
// Webhook Events
// ============================================

export const createWebhookEvent = isSupabase
  ? supabaseAdapter.createWebhookEvent
  : memoryAdapter.createWebhookEvent;

export const getWebhookEventById = isSupabase
  ? supabaseAdapter.getWebhookEventById
  : memoryAdapter.getWebhookEventById;

export const getWebhookEventByEventId = isSupabase
  ? supabaseAdapter.getWebhookEventByEventId
  : memoryAdapter.getWebhookEventByEventId;

export const getWebhookEventByPayloadHash = isSupabase
  ? supabaseAdapter.getWebhookEventByPayloadHash
  : memoryAdapter.getWebhookEventByPayloadHash;

export const updateWebhookEvent = isSupabase
  ? supabaseAdapter.updateWebhookEvent
  : memoryAdapter.updateWebhookEvent;

export const getWebhookEventsFiltered = isSupabase
  ? supabaseAdapter.getWebhookEventsFiltered
  : memoryAdapter.getWebhookEventsFiltered;

export const getPendingWebhookEvents = isSupabase
  ? supabaseAdapter.getPendingWebhookEvents
  : memoryAdapter.getPendingWebhookEvents;

export const getWebhookEventCounts = isSupabase
  ? supabaseAdapter.getWebhookEventCounts
  : memoryAdapter.getWebhookEventCounts;

// ============================================
// Interviewer Identities
// ============================================

export const createInterviewerIdentity = isSupabase
  ? supabaseAdapter.createInterviewerIdentity
  : memoryAdapter.createInterviewerIdentity;

export const getInterviewerIdentityByEmail = isSupabase
  ? supabaseAdapter.getInterviewerIdentityByEmail
  : memoryAdapter.getInterviewerIdentityByEmail;

// ============================================
// Tenant Config
// ============================================

export const getTenantConfig = isSupabase
  ? supabaseAdapter.getTenantConfig
  : memoryAdapter.getTenantConfig;

export const setTenantConfig = isSupabase
  ? supabaseAdapter.setTenantConfig
  : memoryAdapter.setTenantConfig;

// ============================================
// Sync Jobs
// ============================================

export const createSyncJob = isSupabase
  ? supabaseAdapter.createSyncJob
  : memoryAdapter.createSyncJob;

export const getSyncJobById = isSupabase
  ? supabaseAdapter.getSyncJobById
  : memoryAdapter.getSyncJobById;

export const updateSyncJob = isSupabase
  ? supabaseAdapter.updateSyncJob
  : memoryAdapter.updateSyncJob;

export const getPendingSyncJobs = isSupabase
  ? supabaseAdapter.getPendingSyncJobs
  : memoryAdapter.getPendingSyncJobs;

export const getSyncJobsByEntityId = isSupabase
  ? supabaseAdapter.getSyncJobsByEntityId
  : memoryAdapter.getSyncJobsByEntityId;

export const getLatestSyncJobByEntityId = isSupabase
  ? supabaseAdapter.getLatestSyncJobByEntityId
  : memoryAdapter.getLatestSyncJobByEntityId;

export const getSyncJobCounts = isSupabase
  ? supabaseAdapter.getSyncJobCounts
  : memoryAdapter.getSyncJobCounts;

// ============================================
// Reconciliation Jobs
// ============================================

export const createReconciliationJob = isSupabase
  ? supabaseAdapter.createReconciliationJob
  : memoryAdapter.createReconciliationJob;

export const getReconciliationJobById = isSupabase
  ? supabaseAdapter.getReconciliationJobById
  : memoryAdapter.getReconciliationJobById;

export const updateReconciliationJob = isSupabase
  ? supabaseAdapter.updateReconciliationJob
  : memoryAdapter.updateReconciliationJob;

export const getPendingReconciliationJobs = isSupabase
  ? supabaseAdapter.getPendingReconciliationJobs
  : memoryAdapter.getPendingReconciliationJobs;

export const getReconciliationJobsByEntityId = isSupabase
  ? supabaseAdapter.getReconciliationJobsByEntityId
  : memoryAdapter.getReconciliationJobsByEntityId;

export const getReconciliationJobsFiltered = isSupabase
  ? supabaseAdapter.getReconciliationJobsFiltered
  : memoryAdapter.getReconciliationJobsFiltered;

export const getReconciliationJobCounts = isSupabase
  ? supabaseAdapter.getReconciliationJobCounts
  : memoryAdapter.getReconciliationJobCounts;

// ============================================
// Needs Attention Queries
// ============================================

export const getRequestsNeedingAttention = isSupabase
  ? supabaseAdapter.getRequestsNeedingAttention
  : memoryAdapter.getRequestsNeedingAttention;

export const getNeedsAttentionCount = isSupabase
  ? supabaseAdapter.getNeedsAttentionCount
  : memoryAdapter.getNeedsAttentionCount;

// ============================================
// Availability Requests (Candidate Provides Availability Mode)
// ============================================

export const createAvailabilityRequest = isSupabase
  ? supabaseAdapter.createAvailabilityRequest
  : memoryAdapter.createAvailabilityRequest;

export const getAvailabilityRequestById = isSupabase
  ? supabaseAdapter.getAvailabilityRequestById
  : memoryAdapter.getAvailabilityRequestById;

export const getAvailabilityRequestByTokenHash = isSupabase
  ? supabaseAdapter.getAvailabilityRequestByTokenHash
  : memoryAdapter.getAvailabilityRequestByTokenHash;

export const updateAvailabilityRequest = isSupabase
  ? supabaseAdapter.updateAvailabilityRequest
  : memoryAdapter.updateAvailabilityRequest;

export const getAllAvailabilityRequests = isSupabase
  ? supabaseAdapter.getAllAvailabilityRequests
  : memoryAdapter.getAllAvailabilityRequests;

export const getAvailabilityRequestsFiltered = isSupabase
  ? supabaseAdapter.getAvailabilityRequestsFiltered
  : memoryAdapter.getAvailabilityRequestsFiltered;

// ============================================
// Candidate Availability Blocks
// ============================================

export const createCandidateAvailabilityBlock = isSupabase
  ? supabaseAdapter.createCandidateAvailabilityBlock
  : memoryAdapter.createCandidateAvailabilityBlock;

export const getCandidateAvailabilityBlocksByRequestId = isSupabase
  ? supabaseAdapter.getCandidateAvailabilityBlocksByRequestId
  : memoryAdapter.getCandidateAvailabilityBlocksByRequestId;

export const deleteCandidateAvailabilityBlocksByRequestId = isSupabase
  ? supabaseAdapter.deleteCandidateAvailabilityBlocksByRequestId
  : memoryAdapter.deleteCandidateAvailabilityBlocksByRequestId;

// ============================================
// Notification Jobs
// ============================================

export const createNotificationJob = isSupabase
  ? supabaseAdapter.createNotificationJob
  : memoryAdapter.createNotificationJob;

export const getNotificationJobById = isSupabase
  ? supabaseAdapter.getNotificationJobById
  : memoryAdapter.getNotificationJobById;

export const getNotificationJobByIdempotencyKey = isSupabase
  ? supabaseAdapter.getNotificationJobByIdempotencyKey
  : memoryAdapter.getNotificationJobByIdempotencyKey;

export const updateNotificationJob = isSupabase
  ? supabaseAdapter.updateNotificationJob
  : memoryAdapter.updateNotificationJob;

export const getPendingNotificationJobs = isSupabase
  ? supabaseAdapter.getPendingNotificationJobs
  : memoryAdapter.getPendingNotificationJobs;

export const getNotificationJobsByEntityId = isSupabase
  ? supabaseAdapter.getNotificationJobsByEntityId
  : memoryAdapter.getNotificationJobsByEntityId;

export const getNotificationJobsFiltered = isSupabase
  ? supabaseAdapter.getNotificationJobsFiltered
  : memoryAdapter.getNotificationJobsFiltered;

export const getNotificationJobCounts = isSupabase
  ? supabaseAdapter.getNotificationJobCounts
  : memoryAdapter.getNotificationJobCounts;

export const cancelPendingNotificationJobsByEntity = isSupabase
  ? supabaseAdapter.cancelPendingNotificationJobsByEntity
  : memoryAdapter.cancelPendingNotificationJobsByEntity;

// ============================================
// Notification Attempts
// ============================================

export const createNotificationAttempt = isSupabase
  ? supabaseAdapter.createNotificationAttempt
  : memoryAdapter.createNotificationAttempt;

export const getNotificationAttemptsByJobId = isSupabase
  ? supabaseAdapter.getNotificationAttemptsByJobId
  : memoryAdapter.getNotificationAttemptsByJobId;

// ============================================
// Reset (for testing)
// ============================================

export const resetDatabase = isSupabase
  ? supabaseAdapter.resetDatabase
  : memoryAdapter.resetDatabase;

// ============================================
// Analytics (M12)
// ============================================

export const getAnalyticsData = isSupabase
  ? supabaseAdapter.getAnalyticsData
  : memoryAdapter.getAnalyticsData;

export const getTimeToScheduleData = isSupabase
  ? supabaseAdapter.getTimeToScheduleData
  : memoryAdapter.getTimeToScheduleData;

export const getAuditActionCounts = isSupabase
  ? supabaseAdapter.getAuditActionCounts
  : memoryAdapter.getAuditActionCounts;

// ============================================
// Utility: Check which adapter is active
// ============================================

export function getDatabaseMode(): 'memory' | 'supabase' {
  return isSupabase ? 'supabase' : 'memory';
}

// ============================================
// Organizations (memory-only for now)
// ============================================

export {
  generateSlug,
  isSlugAvailable,
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
  deleteOrganization,
  getUserOrganizations,
  getOrgMembership,
  addOrgMember,
  updateOrgMemberRole,
  removeOrgMember,
  getOrgMembers,
  getOrgMemberCount,
  resetOrganizationStores,
} from './organizations';

// ============================================
// Organization Invites (memory-only for now)
// ============================================

export {
  generateInviteCode,
  createInvite,
  getInviteById,
  getInviteByCode,
  getInviteWithOrg,
  getOrgInvites,
  getPendingInvites,
  getInvitesByEmail,
  acceptInvite,
  revokeInvite,
  deleteInvite,
  hasPendingInvite,
  cleanupExpiredInvites,
  resetInvitesStore,
} from './invites';

// ============================================
// Interviewer Profiles (M15 Capacity Planning)
// ============================================

export const createInterviewerProfile = isSupabase
  ? supabaseAdapter.createInterviewerProfile
  : memoryAdapter.createInterviewerProfile;

export const getInterviewerProfileById = isSupabase
  ? supabaseAdapter.getInterviewerProfileById
  : memoryAdapter.getInterviewerProfileById;

export const getInterviewerProfileByEmail = isSupabase
  ? supabaseAdapter.getInterviewerProfileByEmail
  : memoryAdapter.getInterviewerProfileByEmail;

export const getInterviewerProfilesByOrg = isSupabase
  ? supabaseAdapter.getInterviewerProfilesByOrg
  : memoryAdapter.getInterviewerProfilesByOrg;

export const getActiveInterviewerProfiles = isSupabase
  ? supabaseAdapter.getActiveInterviewerProfiles
  : memoryAdapter.getActiveInterviewerProfiles;

export const updateInterviewerProfile = isSupabase
  ? supabaseAdapter.updateInterviewerProfile
  : memoryAdapter.updateInterviewerProfile;

export const deleteInterviewerProfile = isSupabase
  ? supabaseAdapter.deleteInterviewerProfile
  : memoryAdapter.deleteInterviewerProfile;

// ============================================
// Load Rollups (M15 Capacity Planning)
// ============================================

export const createLoadRollup = isSupabase
  ? supabaseAdapter.createLoadRollup
  : memoryAdapter.createLoadRollup;

export const getLoadRollupById = isSupabase
  ? supabaseAdapter.getLoadRollupById
  : memoryAdapter.getLoadRollupById;

export const getLoadRollupByProfileAndWeek = isSupabase
  ? supabaseAdapter.getLoadRollupByProfileAndWeek
  : memoryAdapter.getLoadRollupByProfileAndWeek;

export const getLoadRollupsByOrg = isSupabase
  ? supabaseAdapter.getLoadRollupsByOrg
  : memoryAdapter.getLoadRollupsByOrg;

export const upsertLoadRollup = isSupabase
  ? supabaseAdapter.upsertLoadRollup
  : memoryAdapter.upsertLoadRollup;

export const getAtCapacityInterviewers = isSupabase
  ? supabaseAdapter.getAtCapacityInterviewers
  : memoryAdapter.getAtCapacityInterviewers;

export const getOverCapacityInterviewers = isSupabase
  ? supabaseAdapter.getOverCapacityInterviewers
  : memoryAdapter.getOverCapacityInterviewers;

// ============================================
// Scheduling Recommendations (M15 Capacity Planning)
// ============================================

export const createRecommendation = isSupabase
  ? supabaseAdapter.createRecommendation
  : memoryAdapter.createRecommendation;

export const getRecommendationById = isSupabase
  ? supabaseAdapter.getRecommendationById
  : memoryAdapter.getRecommendationById;

export const getRecommendationsByOrg = isSupabase
  ? supabaseAdapter.getRecommendationsByOrg
  : memoryAdapter.getRecommendationsByOrg;

export const getRecommendationsByRequest = isSupabase
  ? supabaseAdapter.getRecommendationsByRequest
  : memoryAdapter.getRecommendationsByRequest;

export const getActiveRecommendationsByType = isSupabase
  ? supabaseAdapter.getActiveRecommendationsByType
  : memoryAdapter.getActiveRecommendationsByType;

export const updateRecommendation = isSupabase
  ? supabaseAdapter.updateRecommendation
  : memoryAdapter.updateRecommendation;

export const dismissRecommendation = isSupabase
  ? supabaseAdapter.dismissRecommendation
  : memoryAdapter.dismissRecommendation;

export const markRecommendationActed = isSupabase
  ? supabaseAdapter.markRecommendationActed
  : memoryAdapter.markRecommendationActed;

export const expireOldRecommendations = isSupabase
  ? supabaseAdapter.expireOldRecommendations
  : memoryAdapter.expireOldRecommendations;

// ============================================
// Coordinator Notification Preferences (M16)
// ============================================

export const getCoordinatorPreferences = isSupabase
  ? supabaseAdapter.getCoordinatorPreferences
  : memoryAdapter.getCoordinatorPreferences;

export const getCoordinatorPreferencesByOrg = isSupabase
  ? supabaseAdapter.getCoordinatorPreferencesByOrg
  : memoryAdapter.getCoordinatorPreferencesByOrg;

export const upsertCoordinatorPreferences = isSupabase
  ? supabaseAdapter.upsertCoordinatorPreferences
  : memoryAdapter.upsertCoordinatorPreferences;

export const deleteCoordinatorPreferences = isSupabase
  ? supabaseAdapter.deleteCoordinatorPreferences
  : memoryAdapter.deleteCoordinatorPreferences;

// ============================================
// Loop Autopilot (M18)
// ============================================

// Loop Templates
export const createLoopTemplate = isSupabase
  ? supabaseAdapter.createLoopTemplate
  : loopMemoryAdapter.createLoopTemplate;

export const getLoopTemplateById = isSupabase
  ? supabaseAdapter.getLoopTemplateById
  : loopMemoryAdapter.getLoopTemplateById;

export const getLoopTemplatesByOrg = isSupabase
  ? supabaseAdapter.getLoopTemplatesByOrg
  : loopMemoryAdapter.getLoopTemplatesByOrg;

export const getLoopTemplateWithSessions = isSupabase
  ? supabaseAdapter.getLoopTemplateWithSessions
  : loopMemoryAdapter.getLoopTemplateWithSessions;

export const updateLoopTemplate = isSupabase
  ? supabaseAdapter.updateLoopTemplate
  : loopMemoryAdapter.updateLoopTemplate;

export const deleteLoopTemplate = isSupabase
  ? supabaseAdapter.deleteLoopTemplate
  : loopMemoryAdapter.deleteLoopTemplate;

// Loop Session Templates
export const createLoopSessionTemplate = isSupabase
  ? supabaseAdapter.createLoopSessionTemplate
  : loopMemoryAdapter.createLoopSessionTemplate;

export const getLoopSessionTemplatesByTemplateId = isSupabase
  ? supabaseAdapter.getLoopSessionTemplatesByTemplateId
  : loopMemoryAdapter.getLoopSessionTemplatesByTemplateId;

export const deleteLoopSessionTemplate = isSupabase
  ? supabaseAdapter.deleteLoopSessionTemplate
  : loopMemoryAdapter.deleteLoopSessionTemplate;

// Loop Solve Runs
export const createLoopSolveRun = isSupabase
  ? supabaseAdapter.createLoopSolveRun
  : loopMemoryAdapter.createLoopSolveRun;

export const getLoopSolveRunById = isSupabase
  ? supabaseAdapter.getLoopSolveRunById
  : loopMemoryAdapter.getLoopSolveRunById;

export const getLoopSolveRunByIdempotencyKey = isSupabase
  ? supabaseAdapter.getLoopSolveRunByIdempotencyKey
  : loopMemoryAdapter.getLoopSolveRunByIdempotencyKey;

export const getLatestLoopSolveRun = isSupabase
  ? supabaseAdapter.getLatestLoopSolveRun
  : loopMemoryAdapter.getLatestLoopSolveRun;

export const updateLoopSolveRunResult = isSupabase
  ? supabaseAdapter.updateLoopSolveRunResult
  : loopMemoryAdapter.updateLoopSolveRunResult;

export const updateLoopSolveRunError = isSupabase
  ? supabaseAdapter.updateLoopSolveRunError
  : loopMemoryAdapter.updateLoopSolveRunError;

export const getLoopSolveRunsForOps = isSupabase
  ? supabaseAdapter.getLoopSolveRunsForOps
  : loopMemoryAdapter.getLoopSolveRunsForOps;

// Loop Bookings
export const createLoopBooking = isSupabase
  ? supabaseAdapter.createLoopBooking
  : loopMemoryAdapter.createLoopBooking;

export const getLoopBookingById = isSupabase
  ? supabaseAdapter.getLoopBookingById
  : loopMemoryAdapter.getLoopBookingById;

export const getLoopBookingByIdempotencyKey = isSupabase
  ? supabaseAdapter.getLoopBookingByIdempotencyKey
  : loopMemoryAdapter.getLoopBookingByIdempotencyKey;

export const getLoopBookingByAvailabilityRequest = isSupabase
  ? supabaseAdapter.getLoopBookingByAvailabilityRequest
  : loopMemoryAdapter.getLoopBookingByAvailabilityRequest;

export const updateLoopBookingStatus = isSupabase
  ? supabaseAdapter.updateLoopBookingStatus
  : loopMemoryAdapter.updateLoopBookingStatus;

export const getLoopBookingsForOps = isSupabase
  ? supabaseAdapter.getLoopBookingsForOps
  : loopMemoryAdapter.getLoopBookingsForOps;

// Loop Booking Items
export const createLoopBookingItem = isSupabase
  ? supabaseAdapter.createLoopBookingItem
  : loopMemoryAdapter.createLoopBookingItem;

export const getLoopBookingItems = isSupabase
  ? supabaseAdapter.getLoopBookingItems
  : loopMemoryAdapter.getLoopBookingItems;

// Seeding and Clear
export const seedLoopTemplates = isSupabase
  ? supabaseAdapter.seedLoopTemplates
  : loopMemoryAdapter.seedLoopTemplates;

export const clearLoopStores = isSupabase
  ? supabaseAdapter.clearLoopStores
  : loopMemoryAdapter.clearLoopStores;
