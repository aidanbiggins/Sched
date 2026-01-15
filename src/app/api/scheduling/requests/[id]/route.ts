/**
 * API Route: /api/scheduling/requests/[id]
 *
 * GET - Get a scheduling request by ID (includes sync status)
 * PATCH - Reschedule a booking
 * DELETE - Cancel a booking
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingService } from '@/lib/scheduling';
import { getLatestSyncJobByEntityId, getSyncJobsByEntityId } from '@/lib/db';

interface RouteParams {
  params: { id: string } | Promise<{ id: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    // Handle both sync and async params (Next.js version differences)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    const service = getSchedulingService();

    const schedulingRequest = await service.getRequest(id);
    if (!schedulingRequest) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    const booking = await service.getBooking(id);

    // Get sync status for the request and booking
    const requestSyncJobs = await getSyncJobsByEntityId(id);
    const bookingSyncJobs = booking
      ? await getSyncJobsByEntityId(booking.id)
      : [];

    // Combine and analyze sync status
    const allSyncJobs = [...requestSyncJobs, ...bookingSyncJobs];
    const pendingJobs = allSyncJobs.filter((j) => j.status === 'pending' || j.status === 'processing');
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
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        lastError: job.lastError,
        runAfter: job.runAfter.toISOString(),
        createdAt: job.createdAt.toISOString(),
      })),
    };

    return NextResponse.json({
      request: {
        id: schedulingRequest.id,
        candidateName: schedulingRequest.candidateName,
        candidateEmail: schedulingRequest.candidateEmail,
        reqTitle: schedulingRequest.reqTitle,
        interviewType: schedulingRequest.interviewType,
        durationMinutes: schedulingRequest.durationMinutes,
        interviewerEmails: schedulingRequest.interviewerEmails,
        organizerEmail: schedulingRequest.organizerEmail,
        status: schedulingRequest.status,
        publicToken: schedulingRequest.publicToken, // For coordinator view
        expiresAt: schedulingRequest.expiresAt.toISOString(),
        createdAt: schedulingRequest.createdAt.toISOString(),
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
          }
        : null,
      syncStatus,
    });
  } catch (error) {
    console.error('Error getting scheduling request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    const body = await request.json();

    // Support both legacy (newStart, newEnd) and new (newSlotStartAtUtc) formats
    const newSlotStart = body.newSlotStartAtUtc || body.newStart;

    if (!newSlotStart) {
      return NextResponse.json(
        { error: 'Missing required field: newSlotStartAtUtc (or newStart)' },
        { status: 400 }
      );
    }

    const service = getSchedulingService();
    const result = await service.reschedule(
      id,
      new Date(newSlotStart),
      body.reason
    );

    return NextResponse.json({
      success: true,
      message: 'Booking rescheduled',
      ...result,
    });
  } catch (error) {
    console.error('Error rescheduling booking:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    let status = 500;

    if (message.includes('not found')) {
      status = 404;
    } else if (message.includes('Cannot reschedule') || message.includes('15-minute') || message.includes('outside')) {
      status = 400;
    } else if (message.includes('not available')) {
      status = 409;
    }

    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;
    const body = await request.json();

    if (!body.reason) {
      return NextResponse.json(
        { error: 'Missing required field: reason' },
        { status: 400 }
      );
    }

    const service = getSchedulingService();
    await service.cancel(
      id,
      body.reason,
      body.notifyParticipants ?? true
    );

    return NextResponse.json({ success: true, message: 'Booking cancelled' });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
