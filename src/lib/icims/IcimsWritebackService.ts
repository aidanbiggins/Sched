/**
 * IcimsWritebackService
 *
 * Handles writing notes back to iCIMS for scheduling events.
 * Failures do not block the main flow - they create sync jobs for retry.
 */

import { v4 as uuidv4 } from 'uuid';
import { getIcimsClient, IcimsClient } from './IcimsClient';
import {
  formatLinkCreatedNote,
  formatBookedNote,
  formatCanceledNote,
  formatRescheduledNote,
  LinkCreatedNoteParams,
  BookedNoteParams,
  CanceledNoteParams,
  RescheduledNoteParams,
} from './noteFormatter';
import {
  createAuditLog,
  createSyncJob,
} from '@/lib/db';
import { AuditLog, SyncJob } from '@/types/scheduling';

const MAX_SYNC_ATTEMPTS = 5;

// Backoff intervals in milliseconds (1min, 5min, 15min, 30min, 60min)
const BACKOFF_INTERVALS = [60000, 300000, 900000, 1800000, 3600000];

export type NoteType = 'link_created' | 'booked' | 'cancelled' | 'rescheduled';

interface WritebackResult {
  success: boolean;
  error?: string;
  syncJobId?: string;
}

export class IcimsWritebackService {
  private client: IcimsClient;

  constructor(client?: IcimsClient) {
    this.client = client || getIcimsClient();
  }

  /**
   * Write a "link created" note to iCIMS
   */
  async writeLinkCreatedNote(params: LinkCreatedNoteParams): Promise<WritebackResult> {
    if (!params.applicationId) {
      return { success: true }; // No applicationId, nothing to write
    }

    const noteText = formatLinkCreatedNote(params);
    return this.writeNote(
      params.applicationId,
      'link_created',
      noteText,
      params.schedulingRequestId,
      'scheduling_request',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Write a "booked" note to iCIMS
   */
  async writeBookedNote(params: BookedNoteParams): Promise<WritebackResult> {
    if (!params.applicationId) {
      return { success: true }; // No applicationId, nothing to write
    }

    const noteText = formatBookedNote(params);
    return this.writeNote(
      params.applicationId,
      'booked',
      noteText,
      params.bookingId,
      'booking',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Write a "cancelled" note to iCIMS
   */
  async writeCancelledNote(params: CanceledNoteParams): Promise<WritebackResult> {
    if (!params.applicationId) {
      return { success: true }; // No applicationId, nothing to write
    }

    const noteText = formatCanceledNote(params);
    return this.writeNote(
      params.applicationId,
      'cancelled',
      noteText,
      params.schedulingRequestId,
      'scheduling_request',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Write a "rescheduled" note to iCIMS
   */
  async writeRescheduledNote(params: RescheduledNoteParams): Promise<WritebackResult> {
    if (!params.applicationId) {
      return { success: true }; // No applicationId, nothing to write
    }

    const noteText = formatRescheduledNote(params);
    return this.writeNote(
      params.applicationId,
      'rescheduled',
      noteText,
      params.bookingId,
      'booking',
      params as unknown as Record<string, unknown>
    );
  }

  /**
   * Core note writing logic with audit logging and failure handling
   */
  private async writeNote(
    applicationId: string,
    noteType: NoteType,
    noteText: string,
    entityId: string,
    entityType: 'scheduling_request' | 'booking',
    payload: Record<string, unknown>
  ): Promise<WritebackResult> {
    // Log attempt
    await this.logAttempt(applicationId, noteType, entityId);

    try {
      await this.client.addApplicationNote(applicationId, noteText);

      // Log success
      await this.logSuccess(applicationId, noteType, entityId);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failure
      await this.logFailure(applicationId, noteType, entityId, errorMessage);

      // Create sync job for retry
      const syncJobId = await this.createRetryJob(
        entityId,
        entityType,
        noteType,
        applicationId,
        noteText,
        payload,
        errorMessage
      );

      return {
        success: false,
        error: errorMessage,
        syncJobId,
      };
    }
  }

  /**
   * Retry a failed sync job
   */
  async retryJob(job: SyncJob): Promise<WritebackResult> {
    const { applicationId, noteText, noteType } = job.payload as {
      applicationId: string;
      noteText: string;
      noteType: NoteType;
    };

    // Log retry attempt
    await this.logAttempt(applicationId, noteType, job.entityId);

    try {
      await this.client.addApplicationNote(applicationId, noteText);

      // Log success
      await this.logSuccess(applicationId, noteType, job.entityId);

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failure
      await this.logFailure(applicationId, noteType, job.entityId, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Create a sync job for retrying a failed write
   */
  private async createRetryJob(
    entityId: string,
    entityType: 'scheduling_request' | 'booking',
    noteType: NoteType,
    applicationId: string,
    noteText: string,
    originalPayload: Record<string, unknown>,
    lastError: string
  ): Promise<string> {
    const now = new Date();
    const jobId = uuidv4();

    const job: SyncJob = {
      id: jobId,
      type: 'icims_note',
      entityId,
      entityType,
      attempts: 0,
      maxAttempts: MAX_SYNC_ATTEMPTS,
      status: 'pending',
      lastError,
      payload: {
        applicationId,
        noteText,
        noteType,
        ...originalPayload,
      },
      runAfter: new Date(now.getTime() + BACKOFF_INTERVALS[0]),
      createdAt: now,
      updatedAt: now,
    };

    await createSyncJob(job);

    // Log sync job creation
    const log: AuditLog = {
      id: uuidv4(),
      requestId: entityType === 'scheduling_request' ? entityId : null,
      bookingId: entityType === 'booking' ? entityId : null,
      action: 'sync_job_created',
      actorType: 'system',
      actorId: null,
      payload: {
        syncJobId: jobId,
        noteType,
        applicationId,
        reason: lastError,
      },
      createdAt: now,
    };
    await createAuditLog(log);

    return jobId;
  }

  /**
   * Calculate next run time based on attempt count
   */
  static calculateNextRunAfter(attempts: number): Date {
    const index = Math.min(attempts, BACKOFF_INTERVALS.length - 1);
    return new Date(Date.now() + BACKOFF_INTERVALS[index]);
  }

  /**
   * Log a write attempt
   */
  private async logAttempt(
    applicationId: string,
    noteType: NoteType,
    entityId: string
  ): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'icims_note_attempt',
      actorType: 'system',
      actorId: null,
      payload: {
        applicationId,
        noteType,
        entityId,
      },
      createdAt: new Date(),
    };
    await createAuditLog(log);
  }

  /**
   * Log a successful write
   */
  private async logSuccess(
    applicationId: string,
    noteType: NoteType,
    entityId: string
  ): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'icims_note_success',
      actorType: 'system',
      actorId: null,
      payload: {
        applicationId,
        noteType,
        entityId,
      },
      createdAt: new Date(),
    };
    await createAuditLog(log);
  }

  /**
   * Log a failed write
   */
  private async logFailure(
    applicationId: string,
    noteType: NoteType,
    entityId: string,
    errorSummary: string
  ): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'icims_note_failed',
      actorType: 'system',
      actorId: null,
      payload: {
        applicationId,
        noteType,
        entityId,
        error: errorSummary.substring(0, 500), // Truncate long errors
      },
      createdAt: new Date(),
    };
    await createAuditLog(log);
  }
}

/**
 * Get singleton writeback service instance
 */
let writebackServiceInstance: IcimsWritebackService | null = null;

export function getIcimsWritebackService(): IcimsWritebackService {
  if (!writebackServiceInstance) {
    writebackServiceInstance = new IcimsWritebackService();
  }
  return writebackServiceInstance;
}

/**
 * Reset service instance (for testing)
 */
export function resetIcimsWritebackService(): void {
  writebackServiceInstance = null;
}
