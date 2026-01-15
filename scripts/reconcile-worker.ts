/**
 * Reconciliation Worker Script (M6)
 *
 * Runs detection and processes pending reconciliation jobs.
 * Run with: npm run scheduler:reconcile
 *
 * This worker:
 * 1. Runs detection rules to find drift
 * 2. Creates jobs for detected issues
 * 3. Processes pending jobs with repair actions
 * 4. Handles failures with retry and escalation
 */

import {
  getPendingReconciliationJobs,
  updateReconciliationJob,
} from '../src/lib/db';
import { getReconciliationService } from '../src/lib/reconciliation';
import { ReconciliationJob } from '../src/types/scheduling';

// Configuration
const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 60000; // 1 minute
const RUN_ONCE = process.argv.includes('--once');
const SKIP_DETECTION = process.argv.includes('--skip-detection');

/**
 * Process a single reconciliation job
 */
async function processJob(job: ReconciliationJob): Promise<void> {
  console.log(`[${new Date().toISOString()}] Processing reconciliation job ${job.id}`);
  console.log(`  Type: ${job.jobType}`);
  console.log(`  Entity: ${job.entityType}/${job.entityId}`);
  console.log(`  Attempt: ${job.attempts + 1}/${job.maxAttempts}`);
  console.log(`  Reason: ${job.detectionReason}`);

  // Mark as processing
  await updateReconciliationJob(job.id, { status: 'processing' });

  try {
    const service = getReconciliationService();
    const result = await service.processJob(job);

    if (result.success) {
      console.log(`[${new Date().toISOString()}] Job ${job.id} resolved: ${result.action}`);
    } else {
      console.log(`[${new Date().toISOString()}] Job ${job.id} failed: ${result.error}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${new Date().toISOString()}] Error processing job ${job.id}:`, errorMessage);

    // Mark as failed since processJob should have handled this
    await updateReconciliationJob(job.id, {
      status: 'failed',
      lastError: errorMessage,
    });
  }
}

/**
 * Run detection and process pending jobs
 */
async function runCycle(): Promise<{ detected: number; processed: number }> {
  const service = getReconciliationService();

  // Run detection (unless skipped)
  let detectedCount = 0;
  if (!SKIP_DETECTION) {
    console.log(`[${new Date().toISOString()}] Running detection rules...`);
    const detected = await service.runDetection();
    detectedCount = detected.length;

    if (detectedCount > 0) {
      console.log(`[${new Date().toISOString()}] Detected ${detectedCount} issue(s):`);
      for (const result of detected) {
        console.log(`  - ${result.jobType}: ${result.entityType}/${result.entityId}`);
        console.log(`    Reason: ${result.reason}`);
      }
    } else {
      console.log(`[${new Date().toISOString()}] No issues detected`);
    }
  }

  // Process pending jobs
  const jobs = await getPendingReconciliationJobs(BATCH_SIZE);

  if (jobs.length === 0) {
    console.log(`[${new Date().toISOString()}] No pending reconciliation jobs`);
    return { detected: detectedCount, processed: 0 };
  }

  console.log(`[${new Date().toISOString()}] Found ${jobs.length} pending job(s)`);

  for (const job of jobs) {
    await processJob(job);
  }

  return { detected: detectedCount, processed: jobs.length };
}

/**
 * Run the worker
 */
async function run(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Reconciliation worker started`);
  console.log(`Mode: ${RUN_ONCE ? 'Single run' : 'Continuous polling'}`);
  console.log(`Detection: ${SKIP_DETECTION ? 'Skipped' : 'Enabled'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log('');

  if (RUN_ONCE) {
    // Single run mode
    const { detected, processed } = await runCycle();
    console.log(`[${new Date().toISOString()}] Detected ${detected} issue(s), processed ${processed} job(s). Exiting.`);
    return;
  }

  // Continuous mode
  while (true) {
    try {
      await runCycle();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error in reconciliation cycle:`, error);
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
