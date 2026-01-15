/**
 * SchedulingService
 *
 * Main orchestration layer for scheduling operations.
 * Coordinates between Graph API, iCIMS, database, and slot generation.
 */

import { v4 as uuidv4 } from 'uuid';
import { DateTime } from 'luxon';
import {
  SchedulingRequest,
  Booking,
  AuditLog,
  CreateSchedulingRequestInput,
  CreateSchedulingRequestOutput,
  GetSlotsOutput,
  BookSlotOutput,
  AvailableSlot,
  CreateEventPayload,
} from '@/types/scheduling';
import {
  createSchedulingRequest as dbCreateRequest,
  getSchedulingRequestById,
  getSchedulingRequestByTokenHash,
  updateSchedulingRequest,
  createBooking as dbCreateBooking,
  getBookingByRequestId,
  updateBooking,
  getBookingsInTimeRange,
  createAuditLog,
} from '@/lib/db';
import {
  generatePublicToken,
  hashToken,
  calculateTokenExpiry,
  isTokenExpired,
} from '@/lib/utils/tokens';
import { getGraphCalendarClient, GraphCalendarClient } from '@/lib/graph';
import { getIcimsClient, IcimsClient, getIcimsWritebackService, IcimsWritebackService } from '@/lib/icims';
import {
  generateAvailableSlots,
  findSlotById,
} from './SlotGenerationService';

const DEFAULT_ORGANIZER_EMAIL = process.env.GRAPH_ORGANIZER_EMAIL || 'scheduling@example.com';

export class SchedulingService {
  private graphClient: GraphCalendarClient;
  private icimsClient: IcimsClient;
  private writebackService: IcimsWritebackService;

  constructor(
    graphClient?: GraphCalendarClient,
    icimsClient?: IcimsClient,
    writebackService?: IcimsWritebackService
  ) {
    this.graphClient = graphClient || getGraphCalendarClient();
    this.icimsClient = icimsClient || getIcimsClient();
    this.writebackService = writebackService || getIcimsWritebackService();
  }

  /**
   * Create a new scheduling request
   */
  async createRequest(
    input: CreateSchedulingRequestInput,
    createdBy?: string
  ): Promise<CreateSchedulingRequestOutput> {
    const id = uuidv4();
    const { token, tokenHash } = generatePublicToken();
    const expiresAt = calculateTokenExpiry();

    const request: SchedulingRequest = {
      id,
      applicationId: input.applicationId || null,
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      reqId: input.reqId || null,
      reqTitle: input.reqTitle,
      interviewType: input.interviewType,
      durationMinutes: input.durationMinutes,
      interviewerEmails: input.interviewerEmails,
      organizerEmail: DEFAULT_ORGANIZER_EMAIL,
      calendarProvider: 'microsoft_graph',
      graphTenantId: process.env.GRAPH_TENANT_ID || null,
      windowStart: new Date(input.windowStart),
      windowEnd: new Date(input.windowEnd),
      candidateTimezone: input.candidateTimezone,
      publicToken: token,
      publicTokenHash: tokenHash,
      expiresAt,
      status: 'pending',
      needsAttention: false,
      needsAttentionReason: null,
      createdBy: createdBy || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await dbCreateRequest(request);

    // Log the creation (never log raw token)
    await this.logAction('link_created', request.id, null, 'coordinator', createdBy || null, {
      expiresAt: expiresAt.toISOString(),
      candidateName: input.candidateName,
      reqTitle: input.reqTitle,
    });

    const publicLink = this.getPublicLink(token);

    // Write iCIMS note (failures don't block the main flow)
    await this.writebackService.writeLinkCreatedNote({
      schedulingRequestId: id,
      applicationId: input.applicationId || null,
      publicLink,
      interviewerEmails: input.interviewerEmails,
      organizerEmail: DEFAULT_ORGANIZER_EMAIL,
      interviewType: input.interviewType,
      durationMinutes: input.durationMinutes,
      windowStart: new Date(input.windowStart),
      windowEnd: new Date(input.windowEnd),
      candidateTimezone: input.candidateTimezone,
    });

    return {
      requestId: id,
      publicLink,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * Get available slots for a scheduling request
   * @param token - The raw public token from the URL
   */
  async getAvailableSlots(token: string): Promise<GetSlotsOutput> {
    // Hash the token to look up the request
    const tokenHash = hashToken(token);
    const request = await getSchedulingRequestByTokenHash(tokenHash);

    if (!request) {
      throw new Error('Scheduling request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Scheduling request is ${request.status}`);
    }

    if (isTokenExpired(request.expiresAt)) {
      throw new Error('Scheduling link has expired');
    }

    // Fetch busy intervals from Graph
    const availability = await this.graphClient.getSchedule(
      request.interviewerEmails,
      request.windowStart,
      request.windowEnd,
      15
    );

    // Get existing bookings for collision detection
    const existingBookings = await getBookingsInTimeRange(
      request.windowStart,
      request.windowEnd,
      request.interviewerEmails
    );

    // Generate slots
    const slots = generateAvailableSlots(request, availability, existingBookings);

    // Log the view
    await this.logAction('slots_viewed', request.id, null, 'candidate', null, {
      slotsCount: slots.length,
    });

    return {
      request: {
        candidateName: request.candidateName,
        reqTitle: request.reqTitle,
        interviewType: request.interviewType,
        durationMinutes: request.durationMinutes,
      },
      slots,
      timezone: request.candidateTimezone,
    };
  }

  /**
   * Book a slot
   * @param token - The raw public token from the URL
   */
  async bookSlot(token: string, slotId: string): Promise<BookSlotOutput> {
    // Hash the token to look up the request
    const tokenHash = hashToken(token);
    const request = await getSchedulingRequestByTokenHash(tokenHash);

    if (!request) {
      throw new Error('Scheduling request not found');
    }

    if (request.status !== 'pending') {
      throw new Error(`Cannot book: request is ${request.status}`);
    }

    if (isTokenExpired(request.expiresAt)) {
      throw new Error('Scheduling link has expired');
    }

    // Check if already booked (race condition protection)
    const existingBooking = await getBookingByRequestId(request.id);
    if (existingBooking) {
      throw new Error('This interview has already been booked');
    }

    // Re-fetch availability to ensure slot is still valid
    const availability = await this.graphClient.getSchedule(
      request.interviewerEmails,
      request.windowStart,
      request.windowEnd,
      15
    );

    const existingBookings = await getBookingsInTimeRange(
      request.windowStart,
      request.windowEnd,
      request.interviewerEmails
    );

    const slots = generateAvailableSlots(request, availability, existingBookings);
    const selectedSlot = findSlotById(slots, slotId);

    if (!selectedSlot) {
      throw new Error('Selected slot is no longer available');
    }

    // Create calendar event
    const eventPayload = this.buildEventPayload(request, selectedSlot);
    const createdEvent = await this.graphClient.createEvent(
      request.organizerEmail,
      eventPayload
    );

    // Create booking record
    const bookingId = uuidv4();
    const now = new Date();
    const booking: Booking = {
      id: bookingId,
      requestId: request.id,
      scheduledStart: selectedSlot.start,
      scheduledEnd: selectedSlot.end,
      calendarEventId: createdEvent.eventId,
      calendarIcalUid: createdEvent.iCalUId,
      conferenceJoinUrl: createdEvent.joinUrl,
      icimsActivityId: null,
      status: 'confirmed',
      confirmedAt: now,
      cancelledAt: null,
      cancellationReason: null,
      bookedBy: 'candidate',
      bookedAt: now,
      updatedAt: now,
    };

    await dbCreateBooking(booking);

    // Update request status
    await updateSchedulingRequest(request.id, { status: 'booked' });

    // Log the booking
    await this.logAction('booked', request.id, bookingId, 'candidate', null, {
      slotId,
      scheduledStart: selectedSlot.start.toISOString(),
      scheduledEnd: selectedSlot.end.toISOString(),
      calendarEventId: createdEvent.eventId,
      conferenceJoinUrl: createdEvent.joinUrl,
    });

    // Write iCIMS note (failures don't block the main flow)
    await this.writebackService.writeBookedNote({
      schedulingRequestId: request.id,
      bookingId,
      applicationId: request.applicationId,
      interviewerEmails: request.interviewerEmails,
      organizerEmail: request.organizerEmail,
      scheduledStartUtc: booking.scheduledStart,
      scheduledEndUtc: booking.scheduledEnd,
      candidateTimezone: request.candidateTimezone,
      calendarEventId: booking.calendarEventId,
      joinUrl: booking.conferenceJoinUrl,
    });

    return {
      success: true,
      booking: {
        id: bookingId,
        scheduledStart: booking.scheduledStart.toISOString(),
        scheduledEnd: booking.scheduledEnd.toISOString(),
        conferenceJoinUrl: booking.conferenceJoinUrl,
      },
      message: 'Interview booked successfully',
    };
  }

  /**
   * Reschedule a booking with slot validation
   * @param newSlotStartAtUtc - Must be 15-minute aligned and within a valid slot
   * @param candidateTimezone - Optional timezone override
   */
  async reschedule(
    requestId: string,
    newSlotStartAtUtc: Date,
    reason?: string,
    candidateTimezone?: string,
    actorId?: string
  ): Promise<{
    status: string;
    bookingId: string;
    startAtUtc: Date;
    endAtUtc: Date;
    calendarEventId: string | null;
    joinUrl: string | null;
  }> {
    const request = await getSchedulingRequestById(requestId);
    if (!request) {
      throw new Error('Scheduling request not found');
    }

    if (request.status !== 'booked' && request.status !== 'rescheduled') {
      throw new Error(`Cannot reschedule: request status is ${request.status}`);
    }

    const booking = await getBookingByRequestId(requestId);
    if (!booking) {
      throw new Error('No booking found for this request');
    }

    if (booking.status === 'cancelled') {
      throw new Error('Cannot reschedule a cancelled booking');
    }

    // Validate 15-minute alignment
    const minutes = newSlotStartAtUtc.getUTCMinutes();
    if (minutes % 15 !== 0) {
      throw new Error('New start time must be aligned to 15-minute intervals');
    }

    // Calculate new end time based on request duration
    const newEnd = new Date(newSlotStartAtUtc.getTime() + request.durationMinutes * 60 * 1000);

    // Validate the new slot is within the scheduling window
    if (newSlotStartAtUtc < request.windowStart || newEnd > request.windowEnd) {
      throw new Error('New time slot is outside the scheduling window');
    }

    // Validate the slot is actually available by checking availability
    const availability = await this.graphClient.getSchedule(
      request.interviewerEmails,
      request.windowStart,
      request.windowEnd,
      15
    );

    // Get existing bookings but exclude the current booking
    const existingBookings = (await getBookingsInTimeRange(
      request.windowStart,
      request.windowEnd,
      request.interviewerEmails
    )).filter(b => b.id !== booking.id);

    // Generate available slots
    const slots = generateAvailableSlots(request, availability, existingBookings);

    // Check if the requested time is in an available slot
    const matchingSlot = slots.find(slot =>
      slot.start.getTime() === newSlotStartAtUtc.getTime()
    );

    if (!matchingSlot) {
      throw new Error('Selected time slot is not available');
    }

    const oldStart = booking.scheduledStart;
    const oldEnd = booking.scheduledEnd;
    const tz = candidateTimezone || request.candidateTimezone;

    // Update calendar event
    if (booking.calendarEventId) {
      try {
        await this.graphClient.updateEvent(
          request.organizerEmail,
          booking.calendarEventId,
          {
            start: newSlotStartAtUtc,
            end: newEnd,
            timeZone: tz,
          }
        );
      } catch (graphError) {
        await this.logAction('rescheduled', requestId, booking.id, 'system', null, {
          error: graphError instanceof Error ? graphError.message : 'Unknown Graph error',
          graphUpdateFailed: true,
        });
        throw new Error(`Failed to update calendar event: ${graphError instanceof Error ? graphError.message : 'Unknown error'}`);
      }
    }

    // Update booking
    await updateBooking(booking.id, {
      scheduledStart: newSlotStartAtUtc,
      scheduledEnd: newEnd,
      status: 'rescheduled',
    });

    // Update request status
    await updateSchedulingRequest(requestId, { status: 'rescheduled' });

    // Log the reschedule
    await this.logAction('rescheduled', requestId, booking.id, 'coordinator', actorId || null, {
      oldStart: oldStart.toISOString(),
      oldEnd: oldEnd.toISOString(),
      newStart: newSlotStartAtUtc.toISOString(),
      newEnd: newEnd.toISOString(),
      reason,
    });

    // Write iCIMS note (failures don't block the main flow)
    await this.writebackService.writeRescheduledNote({
      schedulingRequestId: requestId,
      bookingId: booking.id,
      applicationId: request.applicationId,
      interviewerEmails: request.interviewerEmails,
      organizerEmail: request.organizerEmail,
      oldStartUtc: oldStart,
      oldEndUtc: oldEnd,
      newStartUtc: newSlotStartAtUtc,
      newEndUtc: newEnd,
      candidateTimezone: tz,
      calendarEventId: booking.calendarEventId,
      reason: reason || null,
    });

    return {
      status: 'rescheduled',
      bookingId: booking.id,
      startAtUtc: newSlotStartAtUtc,
      endAtUtc: newEnd,
      calendarEventId: booking.calendarEventId,
      joinUrl: booking.conferenceJoinUrl,
    };
  }

  /**
   * Cancel a scheduling request (works for both pending and booked)
   * Returns info about what was cancelled
   */
  async cancel(
    requestId: string,
    reason: string,
    notifyParticipants: boolean = true,
    actorId?: string
  ): Promise<{ status: string; cancelledAt: Date; calendarEventId: string | null }> {
    const request = await getSchedulingRequestById(requestId);
    if (!request) {
      throw new Error('Scheduling request not found');
    }

    if (request.status === 'cancelled') {
      throw new Error('Request is already cancelled');
    }

    if (request.status !== 'pending' && request.status !== 'booked') {
      throw new Error(`Cannot cancel request with status: ${request.status}`);
    }

    const booking = await getBookingByRequestId(requestId);
    const cancelledAt = new Date();
    let calendarEventId: string | null = null;

    // Cancel calendar event if booking exists with calendar event
    if (booking && booking.calendarEventId && booking.status !== 'cancelled') {
      calendarEventId = booking.calendarEventId;
      const cancelMessage = notifyParticipants
        ? `Interview cancelled. Reason: ${reason}`
        : undefined;

      try {
        await this.graphClient.cancelEvent(
          request.organizerEmail,
          booking.calendarEventId,
          cancelMessage
        );
      } catch (graphError) {
        // Log failure but don't block if Graph fails
        await this.logAction('cancelled', requestId, booking?.id || null, 'system', null, {
          error: graphError instanceof Error ? graphError.message : 'Unknown Graph error',
          graphCancelFailed: true,
        });
        throw new Error(`Failed to cancel calendar event: ${graphError instanceof Error ? graphError.message : 'Unknown error'}`);
      }

      // Update booking status
      await updateBooking(booking.id, {
        status: 'cancelled',
        cancelledAt,
        cancellationReason: reason,
      });
    }

    // Update request status
    await updateSchedulingRequest(requestId, { status: 'cancelled' });

    // Log the cancellation
    await this.logAction('cancelled', requestId, booking?.id || null, 'coordinator', actorId || null, {
      reason,
      notifyParticipants,
      calendarEventId,
      previousStatus: request.status,
    });

    // Write iCIMS note (failures don't block the main flow)
    await this.writebackService.writeCancelledNote({
      schedulingRequestId: requestId,
      bookingId: booking?.id || null,
      applicationId: request.applicationId,
      interviewerEmails: request.interviewerEmails,
      organizerEmail: request.organizerEmail,
      reason,
      cancelledBy: actorId || 'coordinator',
    });

    return { status: 'cancelled', cancelledAt, calendarEventId };
  }

  /**
   * Get available slots for rescheduling (excludes the current booking)
   */
  async getRescheduleSlotsById(requestId: string): Promise<AvailableSlot[]> {
    const request = await getSchedulingRequestById(requestId);
    if (!request) {
      throw new Error('Scheduling request not found');
    }

    if (request.status !== 'booked' && request.status !== 'rescheduled') {
      throw new Error(`Cannot get reschedule slots: request status is ${request.status}`);
    }

    const booking = await getBookingByRequestId(requestId);
    if (!booking) {
      throw new Error('No booking found for this request');
    }

    // Fetch busy intervals from Graph
    const availability = await this.graphClient.getSchedule(
      request.interviewerEmails,
      request.windowStart,
      request.windowEnd,
      15
    );

    // Get existing bookings but exclude the current booking
    const existingBookings = (await getBookingsInTimeRange(
      request.windowStart,
      request.windowEnd,
      request.interviewerEmails
    )).filter(b => b.id !== booking.id);

    // Generate slots
    return generateAvailableSlots(request, availability, existingBookings);
  }

  /**
   * Get a scheduling request by ID
   */
  async getRequest(requestId: string): Promise<SchedulingRequest | null> {
    return getSchedulingRequestById(requestId);
  }

  /**
   * Get booking for a request
   */
  async getBooking(requestId: string): Promise<Booking | null> {
    return getBookingByRequestId(requestId);
  }

  // ============================================
  // Private helpers
  // ============================================

  private getPublicLink(token: string): string {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    return `${baseUrl}/book/${token}`;
  }

  private buildEventPayload(
    request: SchedulingRequest,
    slot: AvailableSlot
  ): CreateEventPayload {
    const attendees = [
      {
        email: request.candidateEmail,
        name: request.candidateName,
        type: 'required' as const,
      },
      ...request.interviewerEmails.map((email) => ({
        email,
        name: email.split('@')[0],
        type: 'required' as const,
      })),
    ];

    const bodyContent = `
      <h2>Interview: ${request.candidateName} for ${request.reqTitle}</h2>
      <p><strong>Interview Type:</strong> ${request.interviewType}</p>
      <p><strong>Duration:</strong> ${request.durationMinutes} minutes</p>
      ${request.applicationId ? `<p><strong>Application ID:</strong> ${request.applicationId}</p>` : ''}
      <hr>
      <p>This interview was scheduled via the Scheduling Tool.</p>
    `;

    return {
      subject: `Interview: ${request.candidateName} for ${request.reqTitle}`,
      body: {
        contentType: 'HTML',
        content: bodyContent,
      },
      start: slot.start,
      end: slot.end,
      timeZone: request.candidateTimezone,
      attendees,
      isOnlineMeeting: true,
      transactionId: uuidv4(),
    };
  }

  private buildBookingNote(request: SchedulingRequest, booking: Booking): string {
    const timeUtc = booking.scheduledStart.toISOString();
    const timeLocal = DateTime.fromJSDate(booking.scheduledStart)
      .setZone(request.candidateTimezone)
      .toFormat("LLL d, yyyy 'at' h:mm a ZZZZ");

    return [
      `Interview scheduled:`,
      `- Time: ${timeLocal} (${timeUtc})`,
      `- Interviewers: ${request.interviewerEmails.join(', ')}`,
      `- Organizer: ${request.organizerEmail}`,
      `- Booking ID: ${booking.id}`,
      `- Calendar Event ID: ${booking.calendarEventId}`,
      booking.conferenceJoinUrl ? `- Join URL: ${booking.conferenceJoinUrl}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async logAction(
    action: AuditLog['action'],
    requestId: string | null,
    bookingId: string | null,
    actorType: AuditLog['actorType'],
    actorId: string | null,
    payload: Record<string, unknown>
  ): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId,
      bookingId,
      action,
      actorType,
      actorId,
      payload,
      createdAt: new Date(),
    };

    await createAuditLog(log);
  }
}

// Export singleton instance
let instance: SchedulingService | null = null;

export function getSchedulingService(): SchedulingService {
  if (!instance) {
    instance = new SchedulingService();
  }
  return instance;
}

export function resetSchedulingService(): void {
  instance = null;
}
