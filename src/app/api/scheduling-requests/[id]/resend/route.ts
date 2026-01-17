/**
 * API Route: /api/scheduling-requests/[id]/resend
 *
 * POST - Resend notification for a scheduling request
 *   Body:
 *   - type: 'link' | 'confirmation'
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getSchedulingRequestById, getBookingByRequestId } from '@/lib/db';
import {
  enqueueResendSelfScheduleLink,
  enqueueResendBookingConfirmation,
} from '@/lib/notifications';
import { isEmailEnabled } from '@/lib/config';

interface RouteParams {
  params: { id: string } | Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check if email is enabled
    if (!isEmailEnabled()) {
      return NextResponse.json(
        { error: 'Email notifications are disabled' },
        { status: 400 }
      );
    }

    // Handle both sync and async params
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;

    const body = await request.json();
    const { type } = body;

    if (!type || !['link', 'confirmation'].includes(type)) {
      return NextResponse.json(
        { error: 'Invalid type. Must be "link" or "confirmation"' },
        { status: 400 }
      );
    }

    // Get the request
    const schedulingRequest = await getSchedulingRequestById(id);
    if (!schedulingRequest) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    if (type === 'link') {
      // Resend self-schedule link (only for pending requests)
      if (schedulingRequest.status !== 'pending') {
        return NextResponse.json(
          { error: 'Cannot resend link for non-pending request' },
          { status: 400 }
        );
      }

      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const publicLink = `${baseUrl}/book/${schedulingRequest.publicToken}`;

      const job = await enqueueResendSelfScheduleLink(schedulingRequest, publicLink);

      return NextResponse.json({
        success: true,
        message: 'Scheduling link resend queued',
        jobId: job.id,
      });
    }

    if (type === 'confirmation') {
      // Resend booking confirmation (only for booked/rescheduled requests)
      if (schedulingRequest.status !== 'booked' && schedulingRequest.status !== 'rescheduled') {
        return NextResponse.json(
          { error: 'Cannot resend confirmation for request without booking' },
          { status: 400 }
        );
      }

      const booking = await getBookingByRequestId(id);
      if (!booking) {
        return NextResponse.json(
          { error: 'Booking not found' },
          { status: 404 }
        );
      }

      const job = await enqueueResendBookingConfirmation(schedulingRequest, booking);

      return NextResponse.json({
        success: true,
        message: 'Booking confirmation resend queued',
        jobId: job.id,
      });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error('Error resending notification:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
