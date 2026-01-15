/**
 * API Route: /api/scheduling-requests/[id]/reschedule
 *
 * GET - Get available slots for rescheduling
 * POST - Reschedule a booking to a new time
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingService } from '@/lib/scheduling';

interface RouteParams {
  params: { id: string } | Promise<{ id: string }>;
}

/**
 * GET - Get available slots for rescheduling
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
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

    const slots = await service.getRescheduleSlotsById(id);

    return NextResponse.json({
      request: {
        id: schedulingRequest.id,
        candidateName: schedulingRequest.candidateName,
        reqTitle: schedulingRequest.reqTitle,
        interviewType: schedulingRequest.interviewType,
        durationMinutes: schedulingRequest.durationMinutes,
        status: schedulingRequest.status,
      },
      slots: slots.map(slot => ({
        slotId: slot.slotId,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
        displayStart: slot.displayStart,
        displayEnd: slot.displayEnd,
      })),
      timezone: schedulingRequest.candidateTimezone,
    });
  } catch (error) {
    console.error('Error getting reschedule slots:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    let status = 500;

    if (message.includes('not found')) {
      status = 404;
    } else if (message.includes('Cannot get reschedule slots')) {
      status = 400;
    }

    return NextResponse.json({ error: message }, { status });
  }
}

/**
 * POST - Reschedule a booking to a new time
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;

    const body = await request.json();

    if (!body.newSlotStartAtUtc) {
      return NextResponse.json(
        { error: 'Missing required field: newSlotStartAtUtc' },
        { status: 400 }
      );
    }

    const newSlotStart = new Date(body.newSlotStartAtUtc);

    // Validate the date is parseable
    if (isNaN(newSlotStart.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format for newSlotStartAtUtc' },
        { status: 400 }
      );
    }

    const service = getSchedulingService();
    const result = await service.reschedule(
      id,
      newSlotStart,
      body.reason,
      body.candidateTimezone,
      body.actorId
    );

    return NextResponse.json({
      success: true,
      status: result.status,
      bookingId: result.bookingId,
      startAtUtc: result.startAtUtc.toISOString(),
      endAtUtc: result.endAtUtc.toISOString(),
      calendarEventId: result.calendarEventId,
      joinUrl: result.joinUrl,
    });
  } catch (error) {
    console.error('Error rescheduling booking:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    // Determine appropriate status code
    let status = 500;
    if (message.includes('not found')) {
      status = 404;
    } else if (message.includes('Cannot reschedule') || message.includes('15-minute') || message.includes('outside the scheduling window')) {
      status = 400;
    } else if (message.includes('not available')) {
      status = 409; // Conflict - slot no longer available
    } else if (message.includes('Failed to update calendar event')) {
      status = 502; // Bad Gateway - external service failure
    }

    return NextResponse.json({ error: message }, { status });
  }
}
