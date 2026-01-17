/**
 * Sync Worker Service
 * Processes pending sync jobs (iCIMS note writebacks)
 */

import { v4 as uuidv4 } from 'uuid';
import {
  getPendingSyncJobs,
  updateSyncJob,
  createAuditLog,
  getSyncJobCounts,
} from '../db';
import {
  getIcimsWritebackService,
  IcimsWritebackService,
} from '../icims';
import { AuditLog, SyncJob } from '../../types/scheduling';
import { WorkerResult } from '../cron/types';
import { WorkerService, WorkerOptions } from './types';

// Configuration
const DEFAULT_BATCH_SIZE = 10;

// Backoff intervals in milliseconds (1min, 5min, 15min, 30min, 60min)
const BACKOFF_INTERVALS = [60000, 300000, 900000, 1800000, 3600000];

/**
 * Log job result to audit log
 */
async function logJobResult(
  job: SyncJob,
  action: 'sync_job_success' | 'sync_job_failed',
  errorMessage: string | null
): Promise<void> {
  const log: AuditLog = {
    id: uuidv4(),
    requestId: job.entityType === 'scheduling_request' ? job.entityId : null,
    bookingId: job.entityType === 'booking' ? job.entityId : null,
    action,
    actorType: 'system',
    actorId: null,
    payload: {
      syncJobId: job.id,
      type: job.type,
      attempts: job.attempts + 1,
      ...(errorMessage && { error: errorMessage.substring(0, 500) }),
    },
    createdAt: new Date(),
  };

  await createAuditLog(log);
}

/**
 * Handle a failed job attempt
 */
async function handleJobFailure(job: SyncJob, errorMessage: string): Promise<void> {
  const newAttempts = job.attempts + 1;

  if (newAttempts >= job.maxAttempts) {
    // Max attempts reached - mark as failed
    await updateSyncJob(job.id, {
      status: 'failed',
      attempts: newAttempts,
      lastError: errorMessage,
    });

    // Log failure
    await logJobResult(job, 'sync_job_failed', errorMessage);
  } else {
    // Schedule next retry with backoff
    const backoffIndex = Math.min(newAttempts, BACKOFF_INTERVALS.length - 1);
    const nextRunAfter = new Date(Date.now() + BACKOFF_INTERVALS[backoffIndex]);

    await updateSyncJob(job.id, {
      status: 'pending',
      attempts: newAttempts,
      lastError: errorMessage,
      runAfter: nextRunAfter,
    });
  }
}

/**
 * Process a single sync job
 */
async function processJob(
  job: SyncJob,
  writebackService: IcimsWritebackService
): Promise<{ success: boolean; error?: string }> {
  // Mark as processing
  await updateSyncJob(job.id, { status: 'processing' });

  try {
    const result = await writebackService.retryJob(job);

    if (result.success) {
      // Mark as completed
      await updateSyncJob(job.id, { status: 'completed' });

      // Log success
      await logJobResult(job, 'sync_job_success', null);

      return { success: true };
    } else {
      await handleJobFailure(job, result.error || 'Unknown error');
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await handleJobFailure(job, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Sync Worker Service
 */
export const syncWorkerService: WorkerService = {
  async processBatch(options?: WorkerOptions): Promise<WorkerResult> {
    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    const writebackService = getIcimsWritebackService();
    const jobs = await getPendingSyncJobs(batchSize);

    const result: WorkerResult = {
      processed: 0,
      failed: 0,
      skipped: 0,
      queueDepth: 0,
      errors: [],
    };

    for (const job of jobs) {
      const jobResult = await processJob(job, writebackService);

      if (jobResult.success) {
        result.processed++;
      } else {
        result.failed++;
        result.errors.push({
          itemId: job.id,
          error: jobResult.error || 'Unknown error',
        });
      }
    }

    // Get remaining queue depth
    const counts = await getSyncJobCounts();
    result.queueDepth = counts.pending;

    return result;
  },

  async getQueueDepth(): Promise<number> {
    const counts = await getSyncJobCounts();
    return counts.pending;
  },
};
