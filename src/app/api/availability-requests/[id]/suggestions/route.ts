/**
 * API Route: /api/availability-requests/:id/suggestions
 *
 * GET - Get suggested interview times based on candidate and interviewer availability
 */

// Force dynamic rendering - disable Next.js route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getAvailabilityRequestById,
  getCandidateAvailabilityBlocksByRequestId,
} from '@/lib/db';
import { generateSuggestions } from '@/lib/availability';

export async function GET(
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

    // Get the availability request
    const availabilityRequest = await getAvailabilityRequestById(id);

    if (!availabilityRequest) {
      return NextResponse.json(
        { error: 'Availability request not found' },
        { status: 404 }
      );
    }

    // Check if candidate has submitted availability
    if (availabilityRequest.status === 'pending') {
      return NextResponse.json(
        { error: 'Candidate has not submitted availability yet' },
        { status: 400 }
      );
    }

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

    if (availabilityRequest.status === 'expired') {
      return NextResponse.json(
        { error: 'Availability request has expired' },
        { status: 410 }
      );
    }

    // Get candidate availability blocks
    const candidateBlocks = await getCandidateAvailabilityBlocksByRequestId(id);

    if (candidateBlocks.length === 0) {
      return NextResponse.json(
        { error: 'No availability blocks found' },
        { status: 400 }
      );
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const maxSuggestions = parseInt(searchParams.get('limit') || '10', 10);
    const preferEarlier = searchParams.get('preferEarlier') !== 'false';

    // Generate suggestions
    const suggestions = await generateSuggestions(
      availabilityRequest,
      candidateBlocks,
      { maxSuggestions, preferEarlier }
    );

    // Format response
    return NextResponse.json({
      requestId: id,
      candidateName: availabilityRequest.candidateName,
      candidateTimezone: availabilityRequest.candidateTimezone,
      durationMinutes: availabilityRequest.durationMinutes,
      suggestions: suggestions.map((s) => ({
        startAt: s.startAt.toISOString(),
        endAt: s.endAt.toISOString(),
        interviewerEmails: s.interviewerEmails,
        score: s.score,
        rationale: s.rationale,
      })),
    });
  } catch (error) {
    console.error('Error generating suggestions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
