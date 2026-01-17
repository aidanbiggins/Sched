/**
 * API Route: /api/scheduling-requests/[id]
 *
 * GET - Get a scheduling request by ID with timeline and sync status
 */

// Force dynamic rendering - disable Next.js route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { verifyResourceOwnership } from '@/lib/auth/guards';
import { getSchedulingService } from '@/lib/scheduling';
import {
  getAuditLogsByRequestId,
  getBookingByRequestId,
  getSyncJobsByEntityId,
} from '@/lib/db';

interface RouteParams {
  params: { id: string } | Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Handle both sync and async params (Next.js version differences)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;

    console.log(`[API] GET /api/scheduling-requests/${id} - fetching fresh data`);

    const service = getSchedulingService();
    const schedulingRequest = await service.getRequest(id);

    console.log(`[API] Request ${id} status: ${schedulingRequest?.status}`);

    if (!schedulingRequest) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    // Verify user can access this resource (belongs to their org)
    if (!verifyResourceOwnership(session, schedulingRequest.organizationId)) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    const booking = await getBookingByRequestId(id);

    // Get audit logs for timeline
    const auditLogs = await getAuditLogsByRequestId(id);
    const timeline = auditLogs.map((log) => ({
      id: log.id,
      action: log.action,
      actorId: log.actorId,
      payload: log.payload,
      createdAt: log.createdAt.toISOString(),
    }));

    // Get sync jobs for this request and its booking
    const requestSyncJobs = await getSyncJobsByEntityId(id);
    const bookingSyncJobs = booking
      ? await getSyncJobsByEntityId(booking.id)
      : [];

    const allSyncJobs = [...requestSyncJobs, ...bookingSyncJobs];
    const pendingJobs = allSyncJobs.filter(
      (j) => j.status === 'pending' || j.status === 'processing'
    );
    const failedJobs = allSyncJobs.filter((j) => j.status === 'failed');

    // Build sync status summary
    const syncStatus = {
      hasPendingSync: pendingJobs.length > 0,
      hasFailedSync: failedJobs.length > 0,
      pendingCount: pendingJobs.length,
      failedCount: failedJobs.length,
      jobs: allSyncJobs.map((job) => ({
        id: job.id,
        type: job.type,
        entityType: job.entityType,
        entityId: job.entityId,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        lastError: job.lastError,
        runAfter: job.runAfter.toISOString(),
        createdAt: job.createdAt.toISOString(),
        updatedAt: job.updatedAt?.toISOString(),
      })),
    };

    // Calculate age
    const ageMs = Date.now() - schedulingRequest.createdAt.getTime();
    const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

    const response = NextResponse.json({
      request: {
        id: schedulingRequest.id,
        applicationId: schedulingRequest.applicationId,
        candidateName: schedulingRequest.candidateName,
        candidateEmail: schedulingRequest.candidateEmail,
        reqTitle: schedulingRequest.reqTitle,
        interviewType: schedulingRequest.interviewType,
        durationMinutes: schedulingRequest.durationMinutes,
        interviewerEmails: schedulingRequest.interviewerEmails,
        organizerEmail: schedulingRequest.organizerEmail,
        status: schedulingRequest.status,
        publicToken: schedulingRequest.publicToken,
        expiresAt: schedulingRequest.expiresAt.toISOString(),
        createdAt: schedulingRequest.createdAt.toISOString(),
        updatedAt: schedulingRequest.updatedAt?.toISOString(),
        ageDays,
      },
      booking: booking
        ? {
            id: booking.id,
            scheduledStart: booking.scheduledStart.toISOString(),
            scheduledEnd: booking.scheduledEnd.toISOString(),
            calendarEventId: booking.calendarEventId,
            calendarIcalUid: booking.calendarIcalUid,
            conferenceJoinUrl: booking.conferenceJoinUrl,
            status: booking.status,
            bookedAt: booking.bookedAt.toISOString(),
            updatedAt: booking.updatedAt?.toISOString(),
          }
        : null,
      timeline,
      syncStatus,
    });

    // Add cache-control headers to prevent any caching
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    console.error('Error getting scheduling request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
