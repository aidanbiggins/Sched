/**
 * API Route: /api/scheduling/requests
 *
 * POST - Create a new scheduling request
 * GET - List all scheduling requests
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingService } from '@/lib/scheduling';
import { getAllSchedulingRequests } from '@/lib/db';
import { CreateSchedulingRequestInput } from '@/types/scheduling';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    const requiredFields = [
      'candidateName',
      'candidateEmail',
      'reqTitle',
      'interviewType',
      'durationMinutes',
      'interviewerEmails',
      'windowStart',
      'windowEnd',
      'candidateTimezone',
    ];

    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate interviewer emails array
    if (!Array.isArray(body.interviewerEmails) || body.interviewerEmails.length === 0) {
      return NextResponse.json(
        { error: 'interviewerEmails must be a non-empty array' },
        { status: 400 }
      );
    }

    const input: CreateSchedulingRequestInput = {
      applicationId: body.applicationId,
      candidateName: body.candidateName,
      candidateEmail: body.candidateEmail,
      reqId: body.reqId,
      reqTitle: body.reqTitle,
      interviewType: body.interviewType,
      durationMinutes: body.durationMinutes,
      interviewerEmails: body.interviewerEmails,
      windowStart: body.windowStart,
      windowEnd: body.windowEnd,
      candidateTimezone: body.candidateTimezone,
    };

    const service = getSchedulingService();
    const result = await service.createRequest(input);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating scheduling request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const requests = await getAllSchedulingRequests();

    // Map to API response format (note: publicTokenHash is not exposed)
    const response = requests.map((req) => ({
      id: req.id,
      candidateName: req.candidateName,
      candidateEmail: req.candidateEmail,
      reqTitle: req.reqTitle,
      interviewType: req.interviewType,
      durationMinutes: req.durationMinutes,
      interviewerEmails: req.interviewerEmails,
      status: req.status,
      expiresAt: req.expiresAt.toISOString(),
      createdAt: req.createdAt.toISOString(),
    }));

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error listing scheduling requests:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
