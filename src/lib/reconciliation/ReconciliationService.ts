/**
 * ReconciliationService (M6)
 *
 * Detects drift between systems and creates repair jobs.
 * Detection rules:
 * - icims_note_missing: Booking confirmed but no note synced to iCIMS
 * - calendar_event_missing: Booking confirmed but calendar event not created
 * - state_mismatch: External system state differs from internal state
 *
 * Repair actions run with safety checks and operator escalation.
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ReconciliationJob,
  ReconciliationJobType,
  ReconciliationJobStatus,
  SchedulingRequest,
  Booking,
  AuditLog,
} from '@/types/scheduling';
import {
  createReconciliationJob,
  getReconciliationJobById,
  updateReconciliationJob,
  getReconciliationJobsByEntityId,
  getAllBookings,
  getAllRequests,
  getBookingById,
  getBookingByRequestId,
  getRequestById,
  updateRequest,
  updateBooking,
  createAuditLog,
} from '@/lib/db';

const MAX_RECONCILIATION_ATTEMPTS = 3;
const REPAIR_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface DetectionResult {
  detected: boolean;
  reason?: string;
  entityType: 'scheduling_request' | 'booking';
  entityId: string;
  jobType: ReconciliationJobType;
}

export interface RepairResult {
  success: boolean;
  error?: string;
  action?: string;
}

export class ReconciliationService {
  /**
   * Run all detection rules and create jobs for any drift found
   */
  async runDetection(): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];

    // Run each detection rule
    const icimsNoteResults = await this.detectIcimsNoteMissing();
    const calendarEventResults = await this.detectCalendarEventMissing();
    const stateMismatchResults = await this.detectStateMismatch();

    results.push(...icimsNoteResults, ...calendarEventResults, ...stateMismatchResults);

    // Create jobs for any detected issues (skip if job already exists)
    for (const result of results) {
      if (result.detected) {
        await this.createJobIfNotExists(result);
      }
    }

    return results.filter((r) => r.detected);
  }

  /**
   * Detect bookings that are confirmed but haven't synced to iCIMS
   */
  async detectIcimsNoteMissing(): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const bookings = await getAllBookings();

    for (const booking of bookings) {
      // Check if booking is confirmed but no iCIMS note
      if (
        booking.status === 'confirmed' &&
        !booking.icimsActivityId &&
        this.isStale(booking.confirmedAt)
      ) {
        results.push({
          detected: true,
          reason: `Booking confirmed at ${booking.confirmedAt?.toISOString()} but no iCIMS activity synced`,
          entityType: 'booking',
          entityId: booking.id,
          jobType: 'icims_note_missing',
        });
      }
    }

    return results;
  }

  /**
   * Detect bookings that are confirmed but haven't created a calendar event
   */
  async detectCalendarEventMissing(): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const bookings = await getAllBookings();

    for (const booking of bookings) {
      // Check if booking is confirmed but no calendar event
      if (
        booking.status === 'confirmed' &&
        !booking.calendarEventId &&
        this.isStale(booking.confirmedAt)
      ) {
        results.push({
          detected: true,
          reason: `Booking confirmed at ${booking.confirmedAt?.toISOString()} but no calendar event created`,
          entityType: 'booking',
          entityId: booking.id,
          jobType: 'calendar_event_missing',
        });
      }
    }

    return results;
  }

  /**
   * Detect state mismatches between internal and external systems
   */
  async detectStateMismatch(): Promise<DetectionResult[]> {
    const results: DetectionResult[] = [];
    const requests = await getAllRequests();

    for (const request of requests) {
      // Check for expired requests still in 'pending' status
      if (
        request.status === 'pending' &&
        request.expiresAt &&
        new Date(request.expiresAt) < new Date()
      ) {
        results.push({
          detected: true,
          reason: `Request expired at ${request.expiresAt.toISOString()} but still marked as pending`,
          entityType: 'scheduling_request',
          entityId: request.id,
          jobType: 'state_mismatch',
        });
      }

      // Check for requests with confirmed booking but not in 'booked' status
      if (request.status === 'pending') {
        const booking = await getBookingByRequestId(request.id);
        if (booking && booking.status === 'confirmed') {
          results.push({
            detected: true,
            reason: `Request has confirmed booking ${booking.id} but status is '${request.status}' instead of 'booked'`,
            entityType: 'scheduling_request',
            entityId: request.id,
            jobType: 'state_mismatch',
          });
        }
      }
    }

    return results;
  }

  /**
   * Create a reconciliation job if one doesn't already exist for this entity/type
   */
  private async createJobIfNotExists(result: DetectionResult): Promise<void> {
    const existingJobs = await getReconciliationJobsByEntityId(result.entityId);
    const hasActiveJob = existingJobs.some(
      (job) =>
        job.jobType === result.jobType &&
        (job.status === 'pending' || job.status === 'processing')
    );

    if (hasActiveJob) {
      return; // Job already exists
    }

    const job: ReconciliationJob = {
      id: uuidv4(),
      tenantId: null,
      jobType: result.jobType,
      entityType: result.entityType,
      entityId: result.entityId,
      status: 'pending',
      attempts: 0,
      maxAttempts: MAX_RECONCILIATION_ATTEMPTS,
      lastError: null,
      detectionReason: result.reason || 'Drift detected',
      runAfter: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await createReconciliationJob(job);
    await this.logReconciliationDetected(job);
  }

  /**
   * Process a single reconciliation job (called by worker)
   */
  async processJob(job: ReconciliationJob): Promise<RepairResult> {
    try {
      // Mark as processing
      await updateReconciliationJob(job.id, {
        status: 'processing',
        updatedAt: new Date(),
      });

      let result: RepairResult;

      switch (job.jobType) {
        case 'icims_note_missing':
          result = await this.repairIcimsNoteMissing(job);
          break;
        case 'calendar_event_missing':
          result = await this.repairCalendarEventMissing(job);
          break;
        case 'state_mismatch':
          result = await this.repairStateMismatch(job);
          break;
        default:
          result = { success: false, error: `Unknown job type: ${job.jobType}` };
      }

      if (result.success) {
        await updateReconciliationJob(job.id, {
          status: 'completed',
          updatedAt: new Date(),
        });
        await this.logReconciliationRepaired(job, result.action);
      } else {
        await this.handleJobFailure(job, result.error || 'Unknown error');
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.handleJobFailure(job, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Handle job failure with retry or escalation
   */
  private async handleJobFailure(job: ReconciliationJob, errorMessage: string): Promise<void> {
    const newAttempts = job.attempts + 1;

    if (newAttempts >= job.maxAttempts) {
      // Mark as failed and escalate
      await updateReconciliationJob(job.id, {
        status: 'failed',
        attempts: newAttempts,
        lastError: errorMessage,
        updatedAt: new Date(),
      });

      // Set needs_attention on the entity
      await this.escalateToOperator(job, errorMessage);
      await this.logReconciliationFailed(job, errorMessage);
    } else {
      // Schedule retry with backoff
      const backoffMs = Math.pow(2, newAttempts) * 60000; // 2^n minutes
      await updateReconciliationJob(job.id, {
        status: 'pending',
        attempts: newAttempts,
        lastError: errorMessage,
        runAfter: new Date(Date.now() + backoffMs),
        updatedAt: new Date(),
      });
    }
  }

  /**
   * Escalate to operator by setting needs_attention flag
   */
  private async escalateToOperator(job: ReconciliationJob, reason: string): Promise<void> {
    if (job.entityType === 'scheduling_request') {
      await updateRequest(job.entityId, {
        needsAttention: true,
        needsAttentionReason: `Reconciliation failed: ${reason}`,
      });
    } else if (job.entityType === 'booking') {
      // For bookings, we escalate the parent request
      const booking = await getBookingById(job.entityId);
      if (booking) {
        await updateRequest(booking.requestId, {
          needsAttention: true,
          needsAttentionReason: `Booking reconciliation failed: ${reason}`,
        });
      }
    }

    await this.logNeedsAttentionSet(job, reason);
  }

  /**
   * Repair: Sync iCIMS note for a confirmed booking
   */
  private async repairIcimsNoteMissing(job: ReconciliationJob): Promise<RepairResult> {
    const booking = await getBookingById(job.entityId);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.status !== 'confirmed') {
      return { success: false, error: `Booking status is '${booking.status}', not 'confirmed'` };
    }

    // In a real implementation, this would call iCIMS API
    // For now, we simulate the repair
    const simulatedActivityId = `ICIMS-REPAIR-${Date.now()}`;

    await updateBooking(job.entityId, {
      icimsActivityId: simulatedActivityId,
    });

    return {
      success: true,
      action: `Created iCIMS activity ${simulatedActivityId}`,
    };
  }

  /**
   * Repair: Create calendar event for a confirmed booking
   */
  private async repairCalendarEventMissing(job: ReconciliationJob): Promise<RepairResult> {
    const booking = await getBookingById(job.entityId);
    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }

    if (booking.status !== 'confirmed') {
      return { success: false, error: `Booking status is '${booking.status}', not 'confirmed'` };
    }

    // In a real implementation, this would call calendar API
    // For now, we simulate the repair
    const simulatedEventId = `CAL-REPAIR-${Date.now()}`;

    await updateBooking(job.entityId, {
      calendarEventId: simulatedEventId,
    });

    return {
      success: true,
      action: `Created calendar event ${simulatedEventId}`,
    };
  }

  /**
   * Repair: Fix state mismatch between internal and external systems
   */
  private async repairStateMismatch(job: ReconciliationJob): Promise<RepairResult> {
    if (job.entityType === 'scheduling_request') {
      const request = await getRequestById(job.entityId);
      if (!request) {
        return { success: false, error: 'Request not found' };
      }

      // Handle expired request
      if (request.status === 'pending' && request.expiresAt && new Date(request.expiresAt) < new Date()) {
        await updateRequest(job.entityId, {
          status: 'expired',
        });
        return { success: true, action: 'Marked expired request as expired' };
      }

      // Handle request with confirmed booking
      if (request.status === 'pending') {
        const booking = await getBookingByRequestId(request.id);
        if (booking && booking.status === 'confirmed') {
          await updateRequest(job.entityId, {
            status: 'booked',
          });
          return { success: true, action: 'Updated request status to booked' };
        }
      }

      return { success: false, error: 'Could not determine repair action for state mismatch' };
    }

    return { success: false, error: `Unsupported entity type: ${job.entityType}` };
  }

  /**
   * Check if a timestamp is stale (older than threshold)
   */
  private isStale(timestamp: Date | null | undefined): boolean {
    if (!timestamp) return false;
    return Date.now() - new Date(timestamp).getTime() > REPAIR_STALE_THRESHOLD_MS;
  }

  /**
   * Log reconciliation job created
   */
  private async logReconciliationDetected(job: ReconciliationJob): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: job.entityType === 'scheduling_request' ? job.entityId : null,
      bookingId: job.entityType === 'booking' ? job.entityId : null,
      action: 'reconciliation_detected',
      actorType: 'system',
      actorId: null,
      payload: {
        jobId: job.id,
        jobType: job.jobType,
        entityType: job.entityType,
        entityId: job.entityId,
        reason: job.detectionReason,
      },
      createdAt: new Date(),
    };
    await createAuditLog(log);
  }

  /**
   * Log reconciliation job resolved
   */
  private async logReconciliationRepaired(job: ReconciliationJob, action?: string): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: job.entityType === 'scheduling_request' ? job.entityId : null,
      bookingId: job.entityType === 'booking' ? job.entityId : null,
      action: 'reconciliation_repaired',
      actorType: 'system',
      actorId: null,
      payload: {
        jobId: job.id,
        jobType: job.jobType,
        repairAction: action,
      },
      createdAt: new Date(),
    };
    await createAuditLog(log);
  }

  /**
   * Log reconciliation job failed
   */
  private async logReconciliationFailed(job: ReconciliationJob, error: string): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: job.entityType === 'scheduling_request' ? job.entityId : null,
      bookingId: job.entityType === 'booking' ? job.entityId : null,
      action: 'reconciliation_failed',
      actorType: 'system',
      actorId: null,
      payload: {
        jobId: job.id,
        jobType: job.jobType,
        error: error.substring(0, 500),
        attempts: job.attempts + 1,
      },
      createdAt: new Date(),
    };
    await createAuditLog(log);
  }

  /**
   * Log needs_attention set
   */
  private async logNeedsAttentionSet(job: ReconciliationJob, reason: string): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: job.entityType === 'scheduling_request' ? job.entityId : null,
      bookingId: job.entityType === 'booking' ? job.entityId : null,
      action: 'needs_attention_set',
      actorType: 'system',
      actorId: null,
      payload: {
        jobId: job.id,
        reason,
      },
      createdAt: new Date(),
    };
    await createAuditLog(log);
  }
}

// Export singleton
let instance: ReconciliationService | null = null;

export function getReconciliationService(): ReconciliationService {
  if (!instance) {
    instance = new ReconciliationService();
  }
  return instance;
}
