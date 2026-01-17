/**
 * API Route: /api/candidate-portal/:token
 *
 * GET - Get all interviews for a candidate by their portal token
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import {
  getSchedulingRequestByTokenHash,
  getAllSchedulingRequests,
  getBookingByRequestId,
} from '@/lib/db';
import { hashToken } from '@/lib/utils/tokens';

// Display status includes 'completed' for past interviews (not in DB schema)
type PortalDisplayStatus = 'pending' | 'booked' | 'rescheduled' | 'cancelled' | 'expired' | 'completed';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    // Hash the token to find the request
    const tokenHash = hashToken(token);

    // First, find the request by token to get the candidate email
    const initialRequest = await getSchedulingRequestByTokenHash(tokenHash);

    if (!initialRequest) {
      return NextResponse.json(
        { error: 'Invalid or expired portal link' },
        { status: 404 }
      );
    }

    const { candidateEmail, candidateName } = initialRequest;

    // Get all scheduling requests and filter by candidate email
    const allRequests = await getAllSchedulingRequests();
    const candidateRequests = allRequests.filter(
      (r) => r.candidateEmail.toLowerCase() === candidateEmail.toLowerCase()
    );

    // Build interview list with booking details
    const interviews = await Promise.all(
      candidateRequests.map(async (request) => {
        const booking = await getBookingByRequestId(request.id);

        // Determine effective status (display status may include 'completed')
        let effectiveStatus: PortalDisplayStatus = request.status;
        if (booking) {
          if (booking.status === 'cancelled') {
            effectiveStatus = 'cancelled';
          } else if (
            booking.scheduledStart &&
            new Date(booking.scheduledStart) < new Date()
          ) {
            effectiveStatus = 'completed';
          }
        }

        return {
          id: request.id,
          requestId: request.id,
          candidateName: request.candidateName,
          candidateEmail: request.candidateEmail,
          reqTitle: request.reqTitle,
          interviewType: request.interviewType,
          status: effectiveStatus,
          durationMinutes: request.durationMinutes,
          scheduledStart: booking?.scheduledStart?.toISOString() || null,
          scheduledEnd: booking?.scheduledEnd?.toISOString() || null,
          conferenceJoinUrl: booking?.conferenceJoinUrl || null,
          publicToken: request.publicToken,
          createdAt: request.createdAt.toISOString(),
        };
      })
    );

    // Sort by created date, newest first
    interviews.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({
      candidateName,
      candidateEmail,
      interviews,
    });
  } catch (error) {
    console.error('Error fetching candidate portal:', error);
    return NextResponse.json(
      { error: 'Failed to load interviews' },
      { status: 500 }
    );
  }
}
