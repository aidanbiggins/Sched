/**
 * API Route: /api/notifications/resend
 *
 * POST - Resend a notification for a scheduling request
 * Body: { requestId, notificationType }
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getSchedulingRequestById,
  getBookingByRequestId,
  getNotificationJobsByEntityId,
  createNotificationJob,
} from '@/lib/db';
import { NotificationType, NotificationJob } from '@/types/scheduling';

// Resend limits per type per day
const RESEND_LIMIT = 3;
const RESEND_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { requestId, notificationType } = body;

    if (!requestId || !notificationType) {
      return NextResponse.json(
        { error: 'Missing required fields: requestId, notificationType' },
        { status: 400 }
      );
    }

    // Validate notification type
    const validTypes: NotificationType[] = [
      'candidate_self_schedule_link',
      'booking_confirmation',
      'nudge_reminder',
    ];
    if (!validTypes.includes(notificationType)) {
      return NextResponse.json(
        { error: 'Invalid notification type for resend' },
        { status: 400 }
      );
    }

    // Get the scheduling request
    const schedulingRequest = await getSchedulingRequestById(requestId);
    if (!schedulingRequest) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    // Check resend rate limit
    const existingJobs = await getNotificationJobsByEntityId('scheduling_request', requestId);
    const recentResends = existingJobs.filter(
      (job) =>
        job.type === notificationType &&
        job.idempotencyKey.includes(':resend:') &&
        new Date(job.createdAt).getTime() > Date.now() - RESEND_WINDOW_MS
    );

    if (recentResends.length >= RESEND_LIMIT) {
      return NextResponse.json(
        { error: `Maximum ${RESEND_LIMIT} resends per day reached for this notification type` },
        { status: 429 }
      );
    }

    // Get booking if needed
    const booking = await getBookingByRequestId(requestId);

    // Build payload based on type
    let payload: Record<string, unknown> = {
      candidateName: schedulingRequest.candidateName,
      candidateEmail: schedulingRequest.candidateEmail,
      candidateTimezone: schedulingRequest.candidateTimezone || 'America/New_York',
      reqTitle: schedulingRequest.reqTitle,
      interviewType: schedulingRequest.interviewType,
      durationMinutes: schedulingRequest.durationMinutes,
    };

    if (notificationType === 'candidate_self_schedule_link') {
      payload = {
        ...payload,
        publicLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/book/${schedulingRequest.publicToken}`,
        expiresAt: schedulingRequest.expiresAt.toISOString(),
      };
    } else if (notificationType === 'booking_confirmation' && booking) {
      payload = {
        ...payload,
        scheduledStartUtc: booking.scheduledStart.toISOString(),
        scheduledEndUtc: booking.scheduledEnd.toISOString(),
        scheduledStartLocal: booking.scheduledStart.toISOString(), // Will be formatted by template
        scheduledEndLocal: booking.scheduledEnd.toISOString(),
        conferenceJoinUrl: booking.conferenceJoinUrl,
        interviewerEmails: schedulingRequest.interviewerEmails,
        calendarEventId: booking.calendarEventId,
      };
    } else if (notificationType === 'nudge_reminder') {
      const daysSinceCreation = Math.floor(
        (Date.now() - new Date(schedulingRequest.createdAt).getTime()) / (24 * 60 * 60 * 1000)
      );
      payload = {
        ...payload,
        publicLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/book/${schedulingRequest.publicToken}`,
        requestType: 'booking',
        daysSinceRequest: daysSinceCreation,
        isUrgent: daysSinceCreation >= 4,
      };
    }

    // Create new notification job with unique resend key
    const resendCount = recentResends.length + 1;
    const now = new Date();
    const job: NotificationJob = {
      id: uuidv4(),
      tenantId: schedulingRequest.organizationId,
      type: notificationType as NotificationType,
      entityType: 'scheduling_request',
      entityId: requestId,
      idempotencyKey: `${notificationType}:scheduling_request:${requestId}:resend:${Date.now()}`,
      toEmail: schedulingRequest.candidateEmail,
      payloadJson: payload,
      status: 'PENDING',
      attempts: 0,
      maxAttempts: 3,
      runAfter: now,
      lastError: null,
      sentAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await createNotificationJob(job);

    return NextResponse.json({
      success: true,
      message: `${notificationType} resent successfully`,
      resendCount,
      remainingResends: RESEND_LIMIT - resendCount,
    });
  } catch (error) {
    console.error('Error resending notification:', error);
    return NextResponse.json(
      { error: 'Failed to resend notification' },
      { status: 500 }
    );
  }
}
