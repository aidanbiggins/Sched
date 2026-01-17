/**
 * Worker Types
 * Shared types for all worker services
 */

import { WorkerResult } from '../cron/types';

/**
 * Options for running a worker batch
 */
export interface WorkerOptions {
  /** Maximum items to process in this batch */
  batchSize?: number;
  /** Skip certain pre-processing steps (e.g., detection for reconcile) */
  skipDetection?: boolean;
}

/**
 * Extended result with additional worker context
 */
export interface ExtendedWorkerResult extends WorkerResult {
  /** Number of items detected (for reconciliation) */
  detected?: number;
}

/**
 * Worker service interface - all workers implement this
 */
export interface WorkerService {
  /** Process a batch of pending items */
  processBatch(options?: WorkerOptions): Promise<WorkerResult>;
  /** Get the current queue depth (pending items) */
  getQueueDepth(): Promise<number>;
}
