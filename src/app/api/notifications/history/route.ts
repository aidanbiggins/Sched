/**
 * API Route: /api/notifications/history
 *
 * GET - Get notification history for a scheduling request
 * Query params: requestId (required)
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getNotificationJobsByEntityId } from '@/lib/db';

// Map notification types to human-readable labels
const typeLabels: Record<string, string> = {
  candidate_availability_request: 'Availability Request',
  candidate_self_schedule_link: 'Booking Link',
  booking_confirmation: 'Booking Confirmation',
  reschedule_confirmation: 'Reschedule Confirmation',
  cancel_notice: 'Cancellation Notice',
  reminder_24h: 'Reminder (24h)',
  reminder_2h: 'Reminder (2h)',
  nudge_reminder: 'Nudge Reminder',
  escalation_no_response: 'Escalation (No Response)',
  escalation_expired: 'Escalation (Expired)',
  coordinator_booking: 'Coordinator Booking Alert',
  coordinator_cancel: 'Coordinator Cancel Alert',
  interviewer_notification: 'Interviewer Notification',
  interviewer_reminder: 'Interviewer Reminder',
};

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestId = searchParams.get('requestId');

    if (!requestId) {
      return NextResponse.json(
        { error: 'Missing required query param: requestId' },
        { status: 400 }
      );
    }

    // Get all notification jobs for this request
    const jobs = await getNotificationJobsByEntityId('scheduling_request', requestId);

    // Format for response
    const history = jobs.map((job) => ({
      id: job.id,
      type: job.type,
      typeLabel: typeLabels[job.type] || job.type,
      toEmail: job.toEmail,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      sentAt: job.sentAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    }));

    // Sort by created date, newest first
    history.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      requestId,
      history,
    });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    return NextResponse.json(
      { error: 'Failed to load notification history' },
      { status: 500 }
    );
  }
}
