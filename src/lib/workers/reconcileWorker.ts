/**
 * Reconciliation Worker Service
 * Runs detection and processes pending reconciliation jobs
 */

import {
  getPendingReconciliationJobs,
  updateReconciliationJob,
  getReconciliationJobCounts,
} from '../db';
import { getReconciliationService } from '../reconciliation';
import { ReconciliationJob } from '../../types/scheduling';
import { WorkerResult } from '../cron/types';
import { WorkerService, WorkerOptions, ExtendedWorkerResult } from './types';

// Configuration
const DEFAULT_BATCH_SIZE = 10;

/**
 * Process a single reconciliation job
 */
async function processJob(job: ReconciliationJob): Promise<{ success: boolean; error?: string }> {
  // Mark as processing
  await updateReconciliationJob(job.id, { status: 'processing' });

  try {
    const service = getReconciliationService();
    const result = await service.processJob(job);

    if (result.success) {
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Mark as failed since processJob should have handled normal failures
    await updateReconciliationJob(job.id, {
      status: 'failed',
      lastError: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Reconciliation Worker Service
 */
export const reconcileWorkerService: WorkerService & {
  processBatch(options?: WorkerOptions): Promise<ExtendedWorkerResult>;
} = {
  async processBatch(options?: WorkerOptions): Promise<ExtendedWorkerResult> {
    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    const skipDetection = options?.skipDetection ?? false;
    const service = getReconciliationService();

    const result: ExtendedWorkerResult = {
      processed: 0,
      failed: 0,
      skipped: 0,
      queueDepth: 0,
      errors: [],
      detected: 0,
    };

    // Run detection unless skipped
    if (!skipDetection) {
      const detected = await service.runDetection();
      result.detected = detected.length;
    }

    // Process pending jobs
    const jobs = await getPendingReconciliationJobs(batchSize);

    for (const job of jobs) {
      const jobResult = await processJob(job);

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
    const counts = await getReconciliationJobCounts();
    result.queueDepth = counts.pending;

    return result;
  },

  async getQueueDepth(): Promise<number> {
    const counts = await getReconciliationJobCounts();
    return counts.pending;
  },
};
