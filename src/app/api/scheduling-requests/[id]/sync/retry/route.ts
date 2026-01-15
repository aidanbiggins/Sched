/**
 * API Route: /api/scheduling-requests/[id]/sync/retry
 *
 * POST - Retry failed sync jobs for a scheduling request
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  getSchedulingRequestById,
  getBookingByRequestId,
  getSyncJobsByEntityId,
  updateSyncJob,
  createSyncJob,
} from '@/lib/db';
import { SyncJob, SyncJobStatus } from '@/types/scheduling';

interface RouteParams {
  params: { id: string } | Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Handle both sync and async params (Next.js version differences)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;

    // Verify scheduling request exists
    const schedulingRequest = await getSchedulingRequestById(id);
    if (!schedulingRequest) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    // Get body for optional job ID filter
    let body: { jobId?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK
    }

    const booking = await getBookingByRequestId(id);

    // Get sync jobs for request and booking
    const requestSyncJobs = await getSyncJobsByEntityId(id);
    const bookingSyncJobs = booking
      ? await getSyncJobsByEntityId(booking.id)
      : [];

    const allSyncJobs = [...requestSyncJobs, ...bookingSyncJobs];

    // Find failed jobs to retry
    let failedJobs = allSyncJobs.filter((j) => j.status === 'failed');

    // If specific job ID provided, only retry that one
    if (body.jobId) {
      failedJobs = failedJobs.filter((j) => j.id === body.jobId);
      if (failedJobs.length === 0) {
        return NextResponse.json(
          { error: 'Sync job not found or not in failed state' },
          { status: 404 }
        );
      }
    }

    if (failedJobs.length === 0) {
      return NextResponse.json(
        { error: 'No failed sync jobs to retry' },
        { status: 400 }
      );
    }

    // Reset failed jobs to pending for retry
    const retriedJobs: SyncJob[] = [];
    for (const job of failedJobs) {
      // Create a new retry job instead of resetting the old one
      // This preserves history of the failed attempt
      const newJob: SyncJob = {
        id: uuidv4(),
        type: job.type,
        entityType: job.entityType,
        entityId: job.entityId,
        payload: job.payload,
        status: 'pending' as SyncJobStatus,
        attempts: 0,
        maxAttempts: job.maxAttempts,
        lastError: null,
        runAfter: new Date(), // Run immediately
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await createSyncJob(newJob);
      retriedJobs.push(newJob);
    }

    return NextResponse.json({
      success: true,
      message: `Queued ${retriedJobs.length} sync job(s) for retry`,
      jobs: retriedJobs.map((j) => ({
        id: j.id,
        type: j.type,
        entityType: j.entityType,
        status: j.status,
      })),
    });
  } catch (error) {
    console.error('Error retrying sync jobs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
