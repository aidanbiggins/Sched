/**
 * Ops API: Jobs
 * Returns job status and history for the ops dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { isSuperadmin } from '@/lib/auth/superadmin';
import { getJobRunService, getLockService, JOB_NAMES, JobName, JobStatus } from '@/lib/cron';
import {
  notifyWorkerService,
  syncWorkerService,
  webhookWorkerService,
  reconcileWorkerService,
  capacityWorkerService,
  escalationWorkerService,
} from '@/lib/workers';

// Worker services map
const workerServices: Record<JobName, { getQueueDepth: () => Promise<number> }> = {
  notify: notifyWorkerService,
  sync: syncWorkerService,
  webhook: webhookWorkerService,
  reconcile: reconcileWorkerService,
  capacity: capacityWorkerService,
  escalation: escalationWorkerService,
};

/**
 * GET /api/ops/jobs
 * Returns current status of all jobs
 */
export async function GET(_request: NextRequest): Promise<NextResponse> {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isSuperadmin(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const jobRunService = getJobRunService();
  const lockService = getLockService();

  const jobs: JobStatus[] = await Promise.all(
    JOB_NAMES.map(async (jobName) => {
      const [lastRun, queueDepth, failureRate24h, isLocked] = await Promise.all([
        jobRunService.getLatestByJob(jobName),
        workerServices[jobName].getQueueDepth(),
        jobRunService.getFailureRate24h(jobName),
        lockService.isHeld(jobName),
      ]);

      // Health check:
      // - Healthy if last run completed successfully and failure rate < 50%
      // - Unhealthy if last run failed or failure rate >= 50% or no runs
      const isHealthy = lastRun
        ? lastRun.status === 'completed' && failureRate24h < 0.5
        : true; // Consider healthy if no runs yet

      return {
        jobName,
        lastRun,
        queueDepth,
        failureRate24h,
        isHealthy,
        isLocked,
      };
    })
  );

  // Get recent runs across all jobs
  const recentRuns = await jobRunService.getRecent(20);

  return NextResponse.json({
    jobs,
    recentRuns,
  });
}

/**
 * POST /api/ops/jobs
 * Trigger a manual job run
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isSuperadmin(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { jobName } = body;

  if (!jobName || !JOB_NAMES.includes(jobName)) {
    return NextResponse.json(
      { error: 'Invalid job name', validJobs: JOB_NAMES },
      { status: 400 }
    );
  }

  // Get the cron endpoint URL
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const cronUrl = `${baseUrl}/api/cron/${jobName}`;

  // Trigger the cron endpoint
  const cronSecret = process.env.CRON_SECRET;

  try {
    const response = await fetch(cronUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-trigger-source': 'manual',
        ...(cronSecret && { Authorization: `Bearer ${cronSecret}` }),
      },
    });

    const result = await response.json();
    return NextResponse.json(result, { status: response.status });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Failed to trigger job', message: errorMessage },
      { status: 500 }
    );
  }
}
