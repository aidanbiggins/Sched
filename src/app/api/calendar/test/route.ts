/**
 * Calendar Test Endpoint
 *
 * Tests the calendar connection by doing a free/busy query.
 * GET /api/calendar/test
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getCalendarClient, getUserCalendarConnections } from '@/lib/calendar';

export async function GET() {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Get calendar connections
    const connections = await getUserCalendarConnections(session.user.id);
    if (connections.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No calendar connections found',
        connections: [],
      });
    }

    // Try to get a calendar client and do a free/busy query
    const client = await getCalendarClient(session.user.id);

    // Query free/busy for the next 24 hours
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const freeBusy = await client.getFreeBusy({
      emails: [session.user.email],
      startTime: now,
      endTime: tomorrow,
    });

    return NextResponse.json({
      success: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      },
      connections,
      freeBusy,
      message: 'Calendar connection working!',
    });
  } catch (error) {
    console.error('Calendar test error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
