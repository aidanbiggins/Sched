/**
 * API Route: /api/public/book
 *
 * POST - Book a slot (public, v2)
 *
 * Body: { token, slotStartAtUtc, candidateTimezone, candidateName? }
 * Returns: { bookingId, startAtUtc, endAtUtc, interviewerEmail, organizerEmail, calendarEventId, joinUrl? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSchedulingService } from '@/lib/scheduling';
import {
  getSchedulingRequestByTokenHash,
  getBookingByRequestId,
  getBookingsInTimeRange,
  createAuditLog
} from '@/lib/db';
import { hashToken, isTokenExpired } from '@/lib/utils/tokens';
import { AuditLog } from '@/types/scheduling';

export async function POST(request: NextRequest) {
  const auditPayload: Record<string, unknown> = {
    endpoint: 'public_book',
    timestamp: new Date().toISOString(),
  };

  try {
    const body = await request.json();

    // Validate required fields
    if (!body.token) {
      return NextResponse.json(
        { error: 'Missing required field: token' },
        { status: 400 }
      );
    }
    if (!body.slotStartAtUtc) {
      return NextResponse.json(
        { error: 'Missing required field: slotStartAtUtc' },
        { status: 400 }
      );
    }
    if (!body.candidateTimezone) {
      return NextResponse.json(
        { error: 'Missing required field: candidateTimezone' },
        { status: 400 }
      );
    }

    // Validate slotStartAtUtc is aligned to 15-minute increments
    const slotStart = new Date(body.slotStartAtUtc);
    if (isNaN(slotStart.getTime())) {
      return NextResponse.json(
        { error: 'Invalid slotStartAtUtc format' },
        { status: 400 }
      );
    }

    if (slotStart.getMinutes() % 15 !== 0 || slotStart.getSeconds() !== 0) {
      await logBookingFailure('validation', 'slot_not_aligned', auditPayload);
      return NextResponse.json(
        { error: 'slotStartAtUtc must be aligned to 15-minute increments' },
        { status: 400 }
      );
    }

    // Log booking attempt (no raw token)
    const attemptLog: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'booked',
      actorType: 'candidate',
      actorId: null,
      payload: {
        ...auditPayload,
        operation: 'booking_attempt',
        slotStartAtUtc: body.slotStartAtUtc,
        candidateTimezone: body.candidateTimezone,
      },
      createdAt: new Date(),
    };
    await createAuditLog(attemptLog);

    // Hash token and look up request
    const tokenHash = hashToken(body.token);
    const schedulingRequest = await getSchedulingRequestByTokenHash(tokenHash);

    if (!schedulingRequest) {
      await logBookingFailure('validation', 'request_not_found', auditPayload);
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    auditPayload.requestId = schedulingRequest.id;

    // Check token expiry
    if (isTokenExpired(schedulingRequest.expiresAt)) {
      await logBookingFailure('validation', 'token_expired', auditPayload, schedulingRequest.id);
      return NextResponse.json(
        { error: 'Scheduling link has expired' },
        { status: 410 }
      );
    }

    // Check request status is PENDING
    if (schedulingRequest.status !== 'pending') {
      await logBookingFailure('validation', `request_status_${schedulingRequest.status}`, auditPayload, schedulingRequest.id);
      return NextResponse.json(
        { error: `Cannot book: request is ${schedulingRequest.status}` },
        { status: 409 }
      );
    }

    // Concurrency check 1: Check if already booked
    const existingBooking = await getBookingByRequestId(schedulingRequest.id);
    if (existingBooking) {
      await logBookingFailure('conflict', 'already_booked', auditPayload, schedulingRequest.id);
      return NextResponse.json(
        { error: 'This interview has already been booked' },
        { status: 409 }
      );
    }

    // Calculate slot end time
    const slotEnd = new Date(slotStart.getTime() + schedulingRequest.durationMinutes * 60 * 1000);

    // Concurrency check 2: Check for overlapping bookings for this interviewer
    const overlappingBookings = await getBookingsInTimeRange(
      slotStart,
      slotEnd,
      schedulingRequest.interviewerEmails
    );

    if (overlappingBookings.length > 0) {
      await logBookingFailure('conflict', 'interviewer_overlap', auditPayload, schedulingRequest.id);
      return NextResponse.json(
        { error: 'Selected time slot is no longer available due to a scheduling conflict' },
        { status: 409 }
      );
    }

    // Use the service to book the slot (it will revalidate and create calendar event)
    const service = getSchedulingService();

    // We need to find the slotId that matches the slotStartAtUtc
    const slotsResult = await service.getAvailableSlots(body.token);
    const matchingSlot = slotsResult.slots.find(
      slot => new Date(slot.start).getTime() === slotStart.getTime()
    );

    if (!matchingSlot) {
      await logBookingFailure('validation', 'slot_not_available', auditPayload, schedulingRequest.id);
      return NextResponse.json(
        { error: 'Selected time slot is not available' },
        { status: 409 }
      );
    }

    // Book the slot
    const result = await service.bookSlot(body.token, matchingSlot.slotId);

    // Log successful booking
    const successLog: AuditLog = {
      id: uuidv4(),
      requestId: schedulingRequest.id,
      bookingId: result.booking.id,
      action: 'booked',
      actorType: 'candidate',
      actorId: null,
      payload: {
        operation: 'booking_succeeded',
        bookingId: result.booking.id,
        calendarEventId: result.booking.conferenceJoinUrl ? 'created' : 'none',
      },
      createdAt: new Date(),
    };
    await createAuditLog(successLog);

    // Return v2 response format
    return NextResponse.json({
      bookingId: result.booking.id,
      startAtUtc: result.booking.scheduledStart,
      endAtUtc: result.booking.scheduledEnd,
      interviewerEmail: schedulingRequest.interviewerEmails[0],
      organizerEmail: schedulingRequest.organizerEmail,
      calendarEventId: result.booking.id, // Calendar event ID is internal
      joinUrl: result.booking.conferenceJoinUrl,
    }, { status: 201 });

  } catch (error) {
    console.error('Error booking slot:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';
    const isGraphError = message.includes('Graph') || message.includes('calendar');

    await logBookingFailure(
      isGraphError ? 'graph_error' : 'validation',
      message,
      auditPayload
    );

    // Handle specific errors
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('expired')) {
      return NextResponse.json({ error: message }, { status: 410 });
    }
    if (message.includes('already been booked') || message.includes('no longer available') || message.includes('not available')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes('Cannot book')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json(
      { error: 'Unable to complete booking. Please try again.' },
      { status: 500 }
    );
  }
}

async function logBookingFailure(
  category: 'validation' | 'conflict' | 'graph_error',
  reason: string,
  payload: Record<string, unknown>,
  requestId?: string
): Promise<void> {
  const log: AuditLog = {
    id: uuidv4(),
    requestId: requestId || null,
    bookingId: null,
    action: 'booked',
    actorType: 'candidate',
    actorId: null,
    payload: {
      ...payload,
      operation: 'booking_failed',
      failureCategory: category,
      failureReason: reason,
    },
    createdAt: new Date(),
  };
  await createAuditLog(log);
}
