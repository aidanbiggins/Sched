/**
 * Cron Job Types for M13
 * Types for production job runner
 */

// ============================================
// Job Names
// ============================================

export type JobName = 'notify' | 'sync' | 'webhook' | 'reconcile' | 'capacity';

export const JOB_NAMES: JobName[] = ['notify', 'sync', 'webhook', 'reconcile', 'capacity'];

// ============================================
// Job Lock
// ============================================

export interface JobLock {
  jobName: JobName;
  lockedBy: string;
  lockedAt: Date;
  expiresAt: Date;
}

// ============================================
// Job Run
// ============================================

export type JobRunStatus = 'running' | 'completed' | 'failed' | 'locked';
export type JobTrigger = 'cron' | 'manual' | 'cli';

export interface JobRun {
  id: string;
  jobName: JobName;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  status: JobRunStatus;
  processed: number;
  failed: number;
  skipped: number;
  queueDepthBefore: number | null;
  queueDepthAfter: number | null;
  triggeredBy: JobTrigger;
  instanceId: string;
  errorSummary: string | null;
  errorDetails: Record<string, unknown> | null;
  createdAt: Date;
}

export interface CreateJobRunInput {
  jobName: JobName;
  triggeredBy: JobTrigger;
  instanceId: string;
  queueDepthBefore?: number;
}

export interface UpdateJobRunInput {
  finishedAt: Date;
  durationMs: number;
  status: JobRunStatus;
  processed: number;
  failed: number;
  skipped: number;
  queueDepthAfter?: number;
  errorSummary?: string;
  errorDetails?: Record<string, unknown>;
}

// ============================================
// Cron Response
// ============================================

export interface CronResponse {
  success: boolean;
  job: JobName;
  status: JobRunStatus;
  processed: number;
  failed: number;
  skipped: number;
  queueDepth: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  errors?: Array<{
    itemId: string;
    error: string;
  }>;
  message?: string;
}

// ============================================
// Worker Result
// ============================================

export interface WorkerResult {
  processed: number;
  failed: number;
  skipped: number;
  queueDepth: number;
  errors: Array<{
    itemId: string;
    error: string;
  }>;
}

// ============================================
// Job Status (for ops dashboard)
// ============================================

export interface JobStatus {
  jobName: JobName;
  lastRun: JobRun | null;
  queueDepth: number;
  failureRate24h: number;
  isHealthy: boolean;
  isLocked?: boolean;
}
