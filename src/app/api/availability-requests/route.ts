/**
 * API Route: /api/availability-requests
 *
 * GET - List availability requests with filtering and pagination
 *   Query params:
 *   - status: comma-separated list (pending,submitted,booked,cancelled,expired)
 *   - page: page number (default 1)
 *   - limit: items per page (default 20)
 *
 * POST - Create a new availability request (candidate provides availability mode)
 */

// Force dynamic rendering - disable Next.js route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  createAvailabilityRequest as dbCreateAvailabilityRequest,
  getAvailabilityRequestsFiltered,
  createAuditLog,
} from '@/lib/db';
import { enqueueAvailabilityRequestNotification } from '@/lib/notifications';
import { isEmailEnabled } from '@/lib/config';
import {
  AvailabilityRequest,
  AvailabilityRequestStatus,
  AuditLog,
  CreateAvailabilityRequestInput,
} from '@/types/scheduling';
import {
  generatePublicToken,
  calculateTokenExpiry,
} from '@/lib/utils/tokens';

const DEFAULT_ORGANIZER_EMAIL = process.env.GRAPH_ORGANIZER_EMAIL || 'scheduling@example.com';

// Default requirements for availability submission
const DEFAULT_MIN_TOTAL_MINUTES = 180; // 3 hours
const DEFAULT_MIN_BLOCKS = 5;

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse filters from query params
    const filters: { status?: AvailabilityRequestStatus[] } = {};

    const statusParam = searchParams.get('status');
    if (statusParam) {
      filters.status = statusParam.split(',').filter(Boolean) as AvailabilityRequestStatus[];
    }

    // Parse pagination options
    const pagination = {
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '20', 10), 100),
    };

    // Get filtered and paginated results
    const result = await getAvailabilityRequestsFiltered(filters, pagination);

    // Format response
    const formattedRequests = result.data.map((req) => ({
      id: req.id,
      applicationId: req.applicationId,
      candidateName: req.candidateName,
      candidateEmail: req.candidateEmail,
      reqTitle: req.reqTitle,
      interviewType: req.interviewType,
      durationMinutes: req.durationMinutes,
      interviewerEmails: req.interviewerEmails,
      status: req.status,
      candidateTimezone: req.candidateTimezone,
      windowStart: req.windowStart.toISOString(),
      windowEnd: req.windowEnd.toISOString(),
      expiresAt: req.expiresAt.toISOString(),
      minTotalMinutes: req.minTotalMinutes,
      minBlocks: req.minBlocks,
      createdAt: req.createdAt.toISOString(),
    }));

    return NextResponse.json({
      requests: formattedRequests,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
    });
  } catch (error) {
    console.error('Error listing availability requests:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();

    // Validate required fields
    const requiredFields = ['candidateEmail', 'interviewerEmails'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate interviewerEmails is an array
    const interviewerEmails = Array.isArray(body.interviewerEmails)
      ? body.interviewerEmails
      : [body.interviewerEmails];

    if (interviewerEmails.length === 0) {
      return NextResponse.json(
        { error: 'At least one interviewer email is required' },
        { status: 400 }
      );
    }

    // Calculate window dates
    const windowDays = body.windowDays || 14;
    const deadlineDays = body.deadlineDays || 7;
    const now = new Date();
    const windowStart = new Date(now);
    const windowEnd = new Date(now.getTime() + windowDays * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(now.getTime() + deadlineDays * 24 * 60 * 60 * 1000);

    // Generate token
    const { token, tokenHash } = generatePublicToken();

    const id = uuidv4();

    const availabilityRequest: AvailabilityRequest = {
      id,
      applicationId: body.applicationId || null,
      candidateName: body.candidateName || body.candidateEmail.split('@')[0],
      candidateEmail: body.candidateEmail,
      reqId: body.reqId || null,
      reqTitle: body.reqTitle || 'Interview',
      interviewType: body.interviewType || 'phone_screen',
      durationMinutes: body.durationMinutes || 60,
      interviewerEmails,
      organizerEmail: DEFAULT_ORGANIZER_EMAIL,
      calendarProvider: 'microsoft_graph',
      graphTenantId: process.env.GRAPH_TENANT_ID || null,
      windowStart,
      windowEnd,
      publicToken: token,
      publicTokenHash: tokenHash,
      expiresAt,
      candidateTimezone: null, // Set when candidate submits
      status: 'pending',
      minTotalMinutes: body.minTotalMinutes || DEFAULT_MIN_TOTAL_MINUTES,
      minBlocks: body.minBlocks || DEFAULT_MIN_BLOCKS,
      createdBy: session.user.id,
      createdAt: now,
      updatedAt: now,
    };

    await dbCreateAvailabilityRequest(availabilityRequest);

    // Log the creation
    const auditLog: AuditLog = {
      id: uuidv4(),
      requestId: null,  // Not a scheduling_request
      availabilityRequestId: id,  // FK to availability_requests
      bookingId: null,
      action: 'link_created',
      actorType: 'coordinator',
      actorId: session.user.id,
      payload: {
        mode: 'availability_request',
        expiresAt: expiresAt.toISOString(),
        candidateName: availabilityRequest.candidateName,
        reqTitle: availabilityRequest.reqTitle,
      },
      createdAt: now,
    };
    await createAuditLog(auditLog);

    // Build public link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const publicLink = `${baseUrl}/availability/${token}`;

    // Enqueue email notification (failures don't block)
    if (isEmailEnabled()) {
      try {
        await enqueueAvailabilityRequestNotification(availabilityRequest, publicLink);
      } catch (error) {
        console.error('Failed to enqueue availability request notification:', error);
      }
    }

    return NextResponse.json(
      {
        id,
        publicLink,
        expiresAt: expiresAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating availability request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
