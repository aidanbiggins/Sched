/**
 * API Route: /api/availability-requests/:id/book
 *
 * POST - Book an interview time from a suggestion
 */

// Force dynamic rendering - disable Next.js route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getAvailabilityRequestById,
  getCandidateAvailabilityBlocksByRequestId,
  updateAvailabilityRequest,
  createBooking,
  createAuditLog,
  createSyncJob,
} from '@/lib/db';
import {
  Booking,
  AuditLog,
  SyncJob,
  BookFromSuggestionInput,
  AvailableSlot,
} from '@/types/scheduling';
import { generateSuggestions } from '@/lib/availability';
import { getCalendarClient } from '@/lib/calendar';
import { getGraphCalendarClient } from '@/lib/graph';
import { isStandaloneMode, isAtsEnabled } from '@/lib/config';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { id } = params;
    const body: BookFromSuggestionInput = await request.json();

    // Validate required fields
    if (!body.startAt) {
      return NextResponse.json(
        { error: 'startAt is required' },
        { status: 400 }
      );
    }

    // Get the availability request
    const availabilityRequest = await getAvailabilityRequestById(id);

    if (!availabilityRequest) {
      return NextResponse.json(
        { error: 'Availability request not found' },
        { status: 404 }
      );
    }

    // Check status
    if (availabilityRequest.status === 'booked') {
      return NextResponse.json(
        { error: 'Interview has already been booked' },
        { status: 409 }
      );
    }

    if (availabilityRequest.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Availability request has been cancelled' },
        { status: 409 }
      );
    }

    if (availabilityRequest.status === 'pending') {
      return NextResponse.json(
        { error: 'Candidate has not submitted availability yet' },
        { status: 400 }
      );
    }

    // Parse the requested time
    const requestedStart = new Date(body.startAt);
    const requestedEnd = new Date(requestedStart.getTime() + availabilityRequest.durationMinutes * 60 * 1000);

    if (isNaN(requestedStart.getTime())) {
      return NextResponse.json(
        { error: 'Invalid startAt date' },
        { status: 400 }
      );
    }

    // Get candidate blocks to verify the slot is valid
    const candidateBlocks = await getCandidateAvailabilityBlocksByRequestId(id);

    // Regenerate suggestions to validate the requested slot is still available
    const suggestions = await generateSuggestions(
      availabilityRequest,
      candidateBlocks,
      { maxSuggestions: 100 }
    );

    // Find the matching suggestion
    const matchingSuggestion = suggestions.find(
      (s) => s.startAt.getTime() === requestedStart.getTime()
    );

    if (!matchingSuggestion) {
      return NextResponse.json(
        { error: 'The requested time slot is no longer available' },
        { status: 409 }
      );
    }

    // Create calendar event
    let calendarEventId: string | null = null;
    let iCalUId: string | null = null;
    let conferenceJoinUrl: string | null = null;

    const candidateTimezone = body.candidateTimezone || availabilityRequest.candidateTimezone || 'America/New_York';

    // Create the slot for calendar event creation
    const slot: AvailableSlot = {
      slotId: `${requestedStart.getTime()}-${requestedEnd.getTime()}`,
      start: requestedStart,
      end: requestedEnd,
      displayStart: requestedStart.toISOString(),
      displayEnd: requestedEnd.toISOString(),
    };

    try {
      if (isStandaloneMode() && availabilityRequest.createdBy) {
        // Use personal calendar in standalone mode
        const calendarClient = await getCalendarClient(availabilityRequest.createdBy);

        const attendees = [
          {
            email: availabilityRequest.candidateEmail,
            displayName: availabilityRequest.candidateName,
          },
          ...matchingSuggestion.interviewerEmails.map((email) => ({
            email,
            displayName: email.split('@')[0],
          })),
        ];

        const description = `
Interview: ${availabilityRequest.candidateName} for ${availabilityRequest.reqTitle}

Interview Type: ${availabilityRequest.interviewType}
Duration: ${availabilityRequest.durationMinutes} minutes
${availabilityRequest.applicationId ? `Application ID: ${availabilityRequest.applicationId}` : ''}

This interview was scheduled via Sched (Candidate Availability Mode).
        `.trim();

        const event = await calendarClient.createEvent({
          summary: `Interview: ${availabilityRequest.candidateName} for ${availabilityRequest.reqTitle}`,
          description,
          start: requestedStart,
          end: requestedEnd,
          timeZone: candidateTimezone,
          attendees,
          conferenceData: true,
        });

        calendarEventId = event.id;
        iCalUId = event.iCalUid;
        conferenceJoinUrl = event.conferenceLink;
      } else {
        // Use Graph API in enterprise mode
        const graphClient = getGraphCalendarClient();

        const eventPayload = {
          subject: `Interview: ${availabilityRequest.candidateName} for ${availabilityRequest.reqTitle}`,
          body: {
            contentType: 'HTML' as const,
            content: `
              <p>Interview scheduled for ${availabilityRequest.candidateName}</p>
              <p><strong>Position:</strong> ${availabilityRequest.reqTitle}</p>
              <p><strong>Type:</strong> ${availabilityRequest.interviewType}</p>
              <p><strong>Duration:</strong> ${availabilityRequest.durationMinutes} minutes</p>
              ${availabilityRequest.applicationId ? `<p><strong>Application ID:</strong> ${availabilityRequest.applicationId}</p>` : ''}
              <p><em>Scheduled via Sched (Candidate Availability Mode)</em></p>
            `,
          },
          start: requestedStart,
          end: requestedEnd,
          timeZone: candidateTimezone,
          attendees: [
            {
              email: availabilityRequest.candidateEmail,
              name: availabilityRequest.candidateName,
              type: 'required' as const,
            },
            ...matchingSuggestion.interviewerEmails.map((email) => ({
              email,
              name: email.split('@')[0],
              type: 'required' as const,
            })),
          ],
          isOnlineMeeting: true,
          transactionId: uuidv4(),
        };

        const createdEvent = await graphClient.createEvent(
          availabilityRequest.organizerEmail,
          eventPayload
        );

        calendarEventId = createdEvent.eventId;
        iCalUId = createdEvent.iCalUId;
        conferenceJoinUrl = createdEvent.joinUrl;
      }
    } catch (calendarError) {
      console.error('Error creating calendar event:', calendarError);
      return NextResponse.json(
        { error: 'Failed to create calendar event. Please try again.' },
        { status: 500 }
      );
    }

    // Create booking record
    const now = new Date();
    const booking: Booking = {
      id: uuidv4(),
      requestId: null,  // Not a scheduling_request
      availabilityRequestId: id,  // FK to availability_requests
      scheduledStart: requestedStart,
      scheduledEnd: requestedEnd,
      calendarEventId,
      calendarIcalUid: iCalUId,
      conferenceJoinUrl,
      icimsActivityId: null,
      status: 'confirmed',
      confirmedAt: now,
      cancelledAt: null,
      cancellationReason: null,
      bookedBy: session.user.id,
      bookedAt: now,
      updatedAt: now,
    };

    await createBooking(booking);

    // Update availability request status
    await updateAvailabilityRequest(id, { status: 'booked' });

    // Create audit log
    const auditLog: AuditLog = {
      id: uuidv4(),
      requestId: null,  // Not a scheduling_request
      availabilityRequestId: id,  // FK to availability_requests
      bookingId: booking.id,
      action: 'booked',
      actorType: 'coordinator',
      actorId: session.user.id,
      payload: {
        mode: 'availability_request',
        scheduledStart: requestedStart.toISOString(),
        scheduledEnd: requestedEnd.toISOString(),
        interviewerEmails: matchingSuggestion.interviewerEmails,
        calendarEventId,
        conferenceJoinUrl,
      },
      createdAt: now,
    };
    await createAuditLog(auditLog);

    // Create iCIMS sync job if ATS is enabled and there's an application ID
    if (isAtsEnabled() && availabilityRequest.applicationId) {
      const syncJob: SyncJob = {
        id: uuidv4(),
        type: 'icims_note',
        entityId: id,
        entityType: 'booking',
        attempts: 0,
        maxAttempts: 3,
        status: 'pending',
        lastError: null,
        payload: {
          applicationId: availabilityRequest.applicationId,
          bookingId: booking.id,
          scheduledStart: requestedStart.toISOString(),
          scheduledEnd: requestedEnd.toISOString(),
          mode: 'availability_request',
        },
        runAfter: now,
        createdAt: now,
        updatedAt: now,
      };
      await createSyncJob(syncJob);
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      scheduledStart: requestedStart.toISOString(),
      scheduledEnd: requestedEnd.toISOString(),
      conferenceJoinUrl,
      message: 'Interview successfully booked',
    });
  } catch (error) {
    console.error('Error booking from suggestion:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
