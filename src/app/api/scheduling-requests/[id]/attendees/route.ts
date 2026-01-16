/**
 * API Route: /api/scheduling-requests/[id]/attendees
 *
 * GET - Get attendee response status for a booking's calendar event
 */

// Force dynamic rendering - disable Next.js route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getSchedulingRequestById, getBookingByRequestId } from '@/lib/db';
import { getCalendarClient } from '@/lib/calendar';

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

    // Get the scheduling request
    const schedulingRequest = await getSchedulingRequestById(id);
    if (!schedulingRequest) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    // Check that the request belongs to the user
    if (schedulingRequest.createdBy !== session.user.id) {
      return NextResponse.json(
        { error: 'Not authorized to view this request' },
        { status: 403 }
      );
    }

    // Get the booking
    const booking = await getBookingByRequestId(id);
    if (!booking || !booking.calendarEventId) {
      return NextResponse.json(
        { error: 'No calendar event found for this booking' },
        { status: 404 }
      );
    }

    // Get the calendar client
    const calendarClient = await getCalendarClient(session.user.id);

    // Fetch event details from the calendar
    const eventDetails = await calendarClient.getEvent(booking.calendarEventId);

    // Debug logging
    console.log('[Attendees API] Raw event details:', JSON.stringify(eventDetails, null, 2));

    const response = NextResponse.json({
      eventId: eventDetails.id,
      summary: eventDetails.summary,
      attendees: eventDetails.attendees.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: a.responseStatus,
        isOrganizer: a.organizer || false,
      })),
    });

    // Add cache-control headers to prevent any caching
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.headers.set('Pragma', 'no-cache');
    response.headers.set('Expires', '0');

    return response;
  } catch (error) {
    console.error('Error getting attendee status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
