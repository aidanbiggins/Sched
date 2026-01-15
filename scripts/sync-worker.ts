/**
 * Sync Worker Script
 *
 * Processes pending sync jobs (iCIMS note writebacks) with exponential backoff retry.
 * Run with: npm run scheduler:sync
 *
 * This worker:
 * 1. Fetches pending sync jobs from the database
 * 2. Attempts to process each job
 * 3. On success: marks job as completed
 * 4. On failure: increments attempts, schedules next retry with backoff
 * 5. After max attempts: marks job as failed
 */

import { v4 as uuidv4 } from 'uuid';
import {
  getPendingSyncJobs,
  updateSyncJob,
  createAuditLog,
} from '../src/lib/db';
import {
  getIcimsWritebackService,
  IcimsWritebackService,
} from '../src/lib/icims';
import { AuditLog, SyncJob } from '../src/types/scheduling';

// Configuration
const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 30000; // 30 seconds
const RUN_ONCE = process.argv.includes('--once');

// Backoff intervals in milliseconds (1min, 5min, 15min, 30min, 60min)
const BACKOFF_INTERVALS = [60000, 300000, 900000, 1800000, 3600000];

/**
 * Process a single sync job
 */
async function processJob(
  job: SyncJob,
  writebackService: IcimsWritebackService
): Promise<void> {
  console.log(`[${new Date().toISOString()}] Processing job ${job.id} (attempt ${job.attempts + 1}/${job.maxAttempts})`);

  // Mark as processing
  await updateSyncJob(job.id, { status: 'processing' });

  try {
    const result = await writebackService.retryJob(job);

    if (result.success) {
      // Mark as completed
      await updateSyncJob(job.id, { status: 'completed' });

      // Log success
      await logJobResult(job, 'sync_job_success', null);

      console.log(`[${new Date().toISOString()}] Job ${job.id} completed successfully`);
    } else {
      await handleJobFailure(job, result.error || 'Unknown error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await handleJobFailure(job, errorMessage);
  }
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

    console.log(`[${new Date().toISOString()}] Job ${job.id} FAILED after ${newAttempts} attempts: ${errorMessage}`);
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

    console.log(`[${new Date().toISOString()}] Job ${job.id} failed (attempt ${newAttempts}), retry scheduled for ${nextRunAfter.toISOString()}`);
  }
}

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
 * Main processing loop
 */
async function processPendingJobs(): Promise<number> {
  const writebackService = getIcimsWritebackService();
  const jobs = await getPendingSyncJobs(BATCH_SIZE);

  if (jobs.length === 0) {
    return 0;
  }

  console.log(`[${new Date().toISOString()}] Found ${jobs.length} pending job(s)`);

  for (const job of jobs) {
    await processJob(job, writebackService);
  }

  return jobs.length;
}

/**
 * Run the worker
 */
async function run(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Sync worker started`);
  console.log(`Mode: ${RUN_ONCE ? 'Single run' : 'Continuous polling'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log('');

  if (RUN_ONCE) {
    // Single run mode
    const processed = await processPendingJobs();
    console.log(`[${new Date().toISOString()}] Processed ${processed} job(s). Exiting.`);
    return;
  }

  // Continuous mode
  while (true) {
    try {
      await processPendingJobs();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error processing jobs:`, error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Run if executed directly
run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
