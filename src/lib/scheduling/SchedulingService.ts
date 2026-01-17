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
  InterviewerAvailability,
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
import { isAtsEnabled, isStandaloneMode, isEmailEnabled } from '@/lib/config';
import { getCalendarClient, CalendarClient, FreeBusyResponse } from '@/lib/calendar';
import {
  enqueueSelfScheduleLinkNotification,
  enqueueBookingConfirmationNotification,
  enqueueRescheduleConfirmationNotification,
  enqueueCancelNoticeNotification,
  enqueueReminderNotifications,
  cancelPendingReminders,
} from '@/lib/notifications';

const DEFAULT_ORGANIZER_EMAIL = process.env.GRAPH_ORGANIZER_EMAIL || 'scheduling@example.com';

// Default working hours for standalone mode (9am-5pm local time, Mon-Fri)
const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '17:00',
  timeZone: 'America/New_York',
  daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
};

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
   * Get interviewer availability using either personal calendar or enterprise Graph
   */
  private async getInterviewerAvailability(
    interviewerEmails: string[],
    windowStart: Date,
    windowEnd: Date,
    createdByUserId: string | null
  ): Promise<InterviewerAvailability[]> {
    // In standalone mode, use the creator's personal calendar
    if (isStandaloneMode() && createdByUserId) {
      try {
        const calendarClient = await getCalendarClient(createdByUserId);
        const freeBusyResponses = await calendarClient.getFreeBusy({
          emails: interviewerEmails,
          startTime: windowStart,
          endTime: windowEnd,
        });

        // Convert FreeBusyResponse to InterviewerAvailability
        return freeBusyResponses.map((response) => ({
          email: response.email,
          busyIntervals: response.busyIntervals.map((interval) => ({
            start: interval.start,
            end: interval.end,
            status: 'busy' as const,
            isPrivate: false,
          })),
          workingHours: DEFAULT_WORKING_HOURS,
        }));
      } catch (error) {
        console.error('Error fetching availability from personal calendar:', error);
        throw new Error('Could not fetch calendar availability. Please ensure your calendar is connected.');
      }
    }

    // Enterprise mode: use Graph API
    return this.graphClient.getSchedule(
      interviewerEmails,
      windowStart,
      windowEnd,
      15
    );
  }

  /**
   * Create a calendar event using either personal calendar or enterprise Graph
   */
  private async createCalendarEvent(
    request: SchedulingRequest,
    slot: AvailableSlot
  ): Promise<{ eventId: string; iCalUId: string | null; joinUrl: string | null }> {
    // In standalone mode, use the creator's personal calendar
    if (isStandaloneMode() && request.createdBy) {
      try {
        const calendarClient = await getCalendarClient(request.createdBy);

        const attendees = [
          {
            email: request.candidateEmail,
            displayName: request.candidateName,
          },
          ...request.interviewerEmails.map((email) => ({
            email,
            displayName: email.split('@')[0],
          })),
        ];

        const description = `
Interview: ${request.candidateName} for ${request.reqTitle}

Interview Type: ${request.interviewType}
Duration: ${request.durationMinutes} minutes
${request.applicationId ? `Application ID: ${request.applicationId}` : ''}

This interview was scheduled via Sched.
        `.trim();

        const event = await calendarClient.createEvent({
          summary: `Interview: ${request.candidateName} for ${request.reqTitle}`,
          description,
          start: slot.start,
          end: slot.end,
          timeZone: request.candidateTimezone,
          attendees,
          conferenceData: true,
        });

        return {
          eventId: event.id,
          iCalUId: event.iCalUid,
          joinUrl: event.conferenceLink,
        };
      } catch (error) {
        console.error('Error creating event via personal calendar:', error);
        throw new Error('Could not create calendar event. Please ensure your calendar is connected.');
      }
    }

    // Enterprise mode: use Graph API
    const eventPayload = this.buildEventPayload(request, slot);
    const createdEvent = await this.graphClient.createEvent(
      request.organizerEmail,
      eventPayload
    );

    return {
      eventId: createdEvent.eventId,
      iCalUId: createdEvent.iCalUId,
      joinUrl: createdEvent.joinUrl,
    };
  }

  /**
   * Update a calendar event using either personal calendar or enterprise Graph
   */
  private async updateCalendarEvent(
    request: SchedulingRequest,
    eventId: string,
    newStart: Date,
    newEnd: Date,
    timeZone: string
  ): Promise<void> {
    // In standalone mode, use the creator's personal calendar
    if (isStandaloneMode() && request.createdBy) {
      try {
        const calendarClient = await getCalendarClient(request.createdBy);
        await calendarClient.updateEvent(eventId, {
          start: newStart,
          end: newEnd,
          timeZone,
        });
        return;
      } catch (error) {
        console.error('Error updating event via personal calendar:', error);
        throw new Error('Could not update calendar event. Please ensure your calendar is connected.');
      }
    }

    // Enterprise mode: use Graph API
    await this.graphClient.updateEvent(
      request.organizerEmail,
      eventId,
      {
        start: newStart,
        end: newEnd,
        timeZone,
      }
    );
  }

  /**
   * Cancel a calendar event using either personal calendar or enterprise Graph
   */
  private async cancelCalendarEvent(
    request: SchedulingRequest,
    eventId: string,
    cancelMessage?: string
  ): Promise<void> {
    // In standalone mode, use the creator's personal calendar
    if (isStandaloneMode() && request.createdBy) {
      try {
        const calendarClient = await getCalendarClient(request.createdBy);
        await calendarClient.deleteEvent(eventId, true);
        return;
      } catch (error) {
        console.error('Error canceling event via personal calendar:', error);
        throw new Error('Could not cancel calendar event. Please ensure your calendar is connected.');
      }
    }

    // Enterprise mode: use Graph API
    await this.graphClient.cancelEvent(
      request.organizerEmail,
      eventId,
      cancelMessage
    );
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
      organizationId: input.organizationId || null,
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

    // Write iCIMS note (only in enterprise mode, failures don't block)
    if (isAtsEnabled()) {
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
    }

    // Enqueue email notification (failures don't block)
    if (isEmailEnabled()) {
      try {
        await enqueueSelfScheduleLinkNotification(request, publicLink);
      } catch (error) {
        console.error('[SchedulingService] Failed to enqueue self-schedule link notification:', error);
      }
    }

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

    // Fetch availability using the appropriate calendar client
    const availability = await this.getInterviewerAvailability(
      request.interviewerEmails,
      request.windowStart,
      request.windowEnd,
      request.createdBy
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
    const availability = await this.getInterviewerAvailability(
      request.interviewerEmails,
      request.windowStart,
      request.windowEnd,
      request.createdBy
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

    // Create calendar event using the appropriate client
    const createdEvent = await this.createCalendarEvent(request, selectedSlot);

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

    // Write iCIMS note (only in enterprise mode, failures don't block)
    if (isAtsEnabled()) {
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
    }

    // Enqueue booking confirmation and reminder notifications (failures don't block)
    if (isEmailEnabled()) {
      try {
        await enqueueBookingConfirmationNotification(request, booking);
        await enqueueReminderNotifications(request, booking);
      } catch (error) {
        console.error('[SchedulingService] Failed to enqueue booking notifications:', error);
      }
    }

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
    const availability = await this.getInterviewerAvailability(
      request.interviewerEmails,
      request.windowStart,
      request.windowEnd,
      request.createdBy
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
        await this.updateCalendarEvent(request, booking.calendarEventId, newSlotStartAtUtc, newEnd, tz);
      } catch (calendarError) {
        await this.logAction('rescheduled', requestId, booking.id, 'system', null, {
          error: calendarError instanceof Error ? calendarError.message : 'Unknown calendar error',
          calendarUpdateFailed: true,
        });
        throw new Error(`Failed to update calendar event: ${calendarError instanceof Error ? calendarError.message : 'Unknown error'}`);
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

    // Write iCIMS note (only in enterprise mode, failures don't block)
    if (isAtsEnabled()) {
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
    }

    // Enqueue reschedule notification and new reminders (failures don't block)
    if (isEmailEnabled()) {
      try {
        // Cancel old reminders
        await cancelPendingReminders(booking.id);
        // Get updated booking with new times
        const updatedBooking = await getBookingByRequestId(requestId);
        if (updatedBooking) {
          await enqueueRescheduleConfirmationNotification(
            request,
            updatedBooking,
            oldStart,
            oldEnd,
            reason || null
          );
          // Schedule new reminders for the new time
          await enqueueReminderNotifications(request, updatedBooking);
        }
      } catch (error) {
        console.error('[SchedulingService] Failed to enqueue reschedule notifications:', error);
      }
    }

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

    // Allow cancellation for pending, booked, or rescheduled requests
    if (request.status !== 'pending' && request.status !== 'booked' && request.status !== 'rescheduled') {
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
        await this.cancelCalendarEvent(request, booking.calendarEventId, cancelMessage);
      } catch (calendarError) {
        // Log failure but don't block if calendar fails
        await this.logAction('cancelled', requestId, booking?.id || null, 'system', null, {
          error: calendarError instanceof Error ? calendarError.message : 'Unknown calendar error',
          calendarCancelFailed: true,
        });
        throw new Error(`Failed to cancel calendar event: ${calendarError instanceof Error ? calendarError.message : 'Unknown error'}`);
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

    // Write iCIMS note (only in enterprise mode, failures don't block)
    if (isAtsEnabled()) {
      await this.writebackService.writeCancelledNote({
        schedulingRequestId: requestId,
        bookingId: booking?.id || null,
        applicationId: request.applicationId,
        interviewerEmails: request.interviewerEmails,
        organizerEmail: request.organizerEmail,
        reason,
        cancelledBy: actorId || 'coordinator',
      });
    }

    // Enqueue cancel notification and cancel pending reminders (failures don't block)
    if (isEmailEnabled()) {
      try {
        // Cancel pending reminders for this booking
        if (booking) {
          await cancelPendingReminders(booking.id);
        }
        // Send cancellation notice
        await enqueueCancelNoticeNotification(request, reason, actorId || 'coordinator');
      } catch (error) {
        console.error('[SchedulingService] Failed to enqueue cancel notifications:', error);
      }
    }

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

    // Fetch availability using the appropriate calendar client
    const availability = await this.getInterviewerAvailability(
      request.interviewerEmails,
      request.windowStart,
      request.windowEnd,
      request.createdBy
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
