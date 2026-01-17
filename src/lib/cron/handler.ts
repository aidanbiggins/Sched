/**
 * Cron Handler
 * Shared handler logic for cron endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { verifyCronAuth, getMaskedAuth } from './auth';
import { getLockService } from './locks';
import { getJobRunService } from './jobRuns';
import { JobName, JobTrigger, CronResponse, WorkerResult } from './types';
import { WorkerService } from '../workers/types';

/**
 * Create a cron handler for a specific job
 */
export function createCronHandler(
  jobName: JobName,
  workerService: WorkerService
) {
  return async function handler(request: NextRequest): Promise<NextResponse> {
    const startTime = Date.now();
    const instanceId = uuidv4();

    // Determine trigger source
    const triggeredBy: JobTrigger = request.headers.get('x-vercel-cron') === '1'
      ? 'cron'
      : request.headers.get('x-trigger-source') === 'cli'
        ? 'cli'
        : 'manual';

    console.log(`[Cron:${jobName}] Starting (instance: ${instanceId.slice(0, 8)}, trigger: ${triggeredBy})`);

    // Verify authentication
    if (!verifyCronAuth(request)) {
      console.warn(`[Cron:${jobName}] Unauthorized request (auth: ${getMaskedAuth(request)})`);
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Invalid or missing cron authentication' },
        { status: 401 }
      );
    }

    const lockService = getLockService();
    const jobRunService = getJobRunService();

    // Get initial queue depth
    const queueDepthBefore = await workerService.getQueueDepth();

    // Try to acquire lock
    const lockAcquired = await lockService.acquire(jobName, instanceId);

    if (!lockAcquired) {
      const holder = await lockService.getHolder(jobName);
      console.log(`[Cron:${jobName}] Lock held by ${holder?.lockedBy?.slice(0, 8) || 'unknown'}, skipping`);

      // Record as locked (skipped)
      const jobRun = await jobRunService.create({
        jobName,
        triggeredBy,
        instanceId,
        queueDepthBefore,
      });

      await jobRunService.update(jobRun.id, {
        finishedAt: new Date(),
        durationMs: Date.now() - startTime,
        status: 'locked',
        processed: 0,
        failed: 0,
        skipped: 0,
        queueDepthAfter: queueDepthBefore,
      });

      const response: CronResponse = {
        success: false,
        job: jobName,
        status: 'locked',
        processed: 0,
        failed: 0,
        skipped: 0,
        queueDepth: queueDepthBefore,
        startedAt: new Date(startTime).toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startTime,
        message: `Lock held by another instance (${holder?.lockedBy?.slice(0, 8) || 'unknown'})`,
      };

      return NextResponse.json(response, { status: 200 });
    }

    // Create job run record
    const jobRun = await jobRunService.create({
      jobName,
      triggeredBy,
      instanceId,
      queueDepthBefore,
    });

    try {
      // Process batch
      const result: WorkerResult = await workerService.processBatch();

      const finishedAt = new Date();
      const durationMs = Date.now() - startTime;

      // Update job run
      await jobRunService.update(jobRun.id, {
        finishedAt,
        durationMs,
        status: result.failed > 0 && result.processed === 0 ? 'failed' : 'completed',
        processed: result.processed,
        failed: result.failed,
        skipped: result.skipped,
        queueDepthAfter: result.queueDepth,
        errorSummary: result.errors.length > 0 ? `${result.errors.length} errors` : undefined,
        errorDetails: result.errors.length > 0 ? { errors: result.errors.slice(0, 10) } : undefined,
      });

      console.log(
        `[Cron:${jobName}] Completed: processed=${result.processed}, failed=${result.failed}, ` +
        `queue=${result.queueDepth}, duration=${durationMs}ms`
      );

      const response: CronResponse = {
        success: result.failed === 0 || result.processed > 0,
        job: jobName,
        status: result.failed > 0 && result.processed === 0 ? 'failed' : 'completed',
        processed: result.processed,
        failed: result.failed,
        skipped: result.skipped,
        queueDepth: result.queueDepth,
        startedAt: new Date(startTime).toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        errors: result.errors.slice(0, 10),
      };

      return NextResponse.json(response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const finishedAt = new Date();
      const durationMs = Date.now() - startTime;

      console.error(`[Cron:${jobName}] Error:`, errorMessage);

      // Update job run as failed
      await jobRunService.update(jobRun.id, {
        finishedAt,
        durationMs,
        status: 'failed',
        processed: 0,
        failed: 0,
        skipped: 0,
        queueDepthAfter: queueDepthBefore,
        errorSummary: errorMessage,
        errorDetails: { error: errorMessage, stack: error instanceof Error ? error.stack : undefined },
      });

      const response: CronResponse = {
        success: false,
        job: jobName,
        status: 'failed',
        processed: 0,
        failed: 0,
        skipped: 0,
        queueDepth: queueDepthBefore,
        startedAt: new Date(startTime).toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs,
        message: errorMessage,
      };

      return NextResponse.json(response, { status: 500 });
    } finally {
      // Always release lock
      await lockService.release(jobName, instanceId);
    }
  };
}
