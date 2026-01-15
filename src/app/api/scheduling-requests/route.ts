/**
 * API Route: /api/scheduling-requests
 *
 * GET - List scheduling requests with filtering, search, and pagination
 *   Query params:
 *   - status: comma-separated list (pending,booked,cancelled,rescheduled)
 *   - search: search term for candidate email, application ID, or request ID
 *   - ageRange: '0-2d' | '3-7d' | '8-14d' | '15+d'
 *   - needsSync: 'true' to filter requests with pending/failed sync jobs
 *   - interviewerEmail: filter by interviewer email
 *   - page: page number (default 1)
 *   - limit: items per page (default 20)
 *   - sortBy: 'createdAt' | 'status' (default 'createdAt')
 *   - sortOrder: 'asc' | 'desc' (default 'desc')
 *
 * POST - Create a new scheduling request (v2)
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSchedulingService } from '@/lib/scheduling';
import {
  createAuditLog,
  getAllSchedulingRequests,
  getBookingByRequestId,
  getSchedulingRequestsFiltered,
  getSchedulingRequestCounts,
  getLatestSyncJobByEntityId,
  SchedulingRequestFilters,
  PaginationOptions,
} from '@/lib/db';
import { AuditLog } from '@/types/scheduling';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse filters from query params
    const filters: SchedulingRequestFilters = {};

    const statusParam = searchParams.get('status');
    if (statusParam) {
      filters.status = statusParam.split(',').filter(Boolean);
    }

    const search = searchParams.get('search');
    if (search) {
      filters.search = search;
    }

    const ageRange = searchParams.get('ageRange');
    if (ageRange && ['0-2d', '3-7d', '8-14d', '15+d'].includes(ageRange)) {
      filters.ageRange = ageRange;
    }

    const needsSync = searchParams.get('needsSync');
    if (needsSync === 'true') {
      filters.needsSync = true;
    }

    const interviewerEmail = searchParams.get('interviewerEmail');
    if (interviewerEmail) {
      filters.interviewerEmail = interviewerEmail;
    }

    // Parse pagination options
    const pagination: PaginationOptions = {
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '20', 10), 100), // Max 100
      sortBy: (searchParams.get('sortBy') as 'createdAt' | 'status') || 'createdAt',
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') || 'desc',
    };

    // Get filtered and paginated results
    const result = await getSchedulingRequestsFiltered(filters, pagination);

    // Enrich with booking info and sync status
    const enrichedRequests = await Promise.all(
      result.data.map(async (req) => {
        const booking = await getBookingByRequestId(req.id);
        const syncJob = await getLatestSyncJobByEntityId(req.id);

        // Calculate age in days
        const ageMs = Date.now() - req.createdAt.getTime();
        const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));

        return {
          requestId: req.id,
          applicationId: req.applicationId,
          candidateName: req.candidateName,
          candidateEmail: req.candidateEmail,
          reqTitle: req.reqTitle,
          interviewType: req.interviewType,
          interviewerEmails: req.interviewerEmails,
          status: req.status,
          createdAt: req.createdAt.toISOString(),
          ageDays,
          booking: booking
            ? {
                id: booking.id,
                scheduledStart: booking.scheduledStart.toISOString(),
                scheduledEnd: booking.scheduledEnd.toISOString(),
                status: booking.status,
              }
            : null,
          syncStatus: syncJob
            ? {
                status: syncJob.status,
                lastError: syncJob.lastError,
                attempts: syncJob.attempts,
                maxAttempts: syncJob.maxAttempts,
              }
            : null,
        };
      })
    );

    // Get counts for all statuses (for tabs)
    const counts = await getSchedulingRequestCounts();

    return NextResponse.json({
      requests: enrichedRequests,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
      counts,
    });
  } catch (error) {
    console.error('Error listing scheduling requests:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields per v2 spec
    const requiredFields = ['icimsApplicationId', 'candidateEmail', 'interviewerEmail'];
    for (const field of requiredFields) {
      if (!body[field]) {
        return NextResponse.json(
          { error: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Map v2 API body to internal input format
    const input = {
      applicationId: body.icimsApplicationId,
      candidateName: body.candidateName || body.candidateEmail.split('@')[0],
      candidateEmail: body.candidateEmail,
      reqTitle: body.reqTitle || 'Interview',
      interviewType: body.interviewType || 'phone_screen' as const,
      durationMinutes: body.durationMinutes || 60,
      interviewerEmails: [body.interviewerEmail],
      windowStart: body.windowStart || new Date().toISOString(),
      windowEnd: body.windowEnd || new Date(Date.now() + (body.windowDays || 14) * 24 * 60 * 60 * 1000).toISOString(),
      candidateTimezone: body.candidateTimezone || 'America/New_York',
    };

    const service = getSchedulingService();
    const result = await service.createRequest(input);

    // Return v2 response format
    return NextResponse.json(
      {
        id: result.requestId,
        link: result.publicLink,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating scheduling request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
