/**
 * API Route: /api/public/availability/:token
 *
 * GET - Get availability request details (public, no auth required)
 * POST - Submit candidate availability blocks
 */

// Force dynamic rendering - disable Next.js route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import {
  getAvailabilityRequestByTokenHash,
  updateAvailabilityRequest,
  createCandidateAvailabilityBlock,
  getCandidateAvailabilityBlocksByRequestId,
  deleteCandidateAvailabilityBlocksByRequestId,
  createAuditLog,
} from '@/lib/db';
import { hashToken, isTokenExpired } from '@/lib/utils/tokens';
import {
  AuditLog,
  CandidateAvailabilityBlock,
  SubmitAvailabilityInput,
} from '@/types/scheduling';
import {
  validateAndNormalizeBlocks,
  ValidationResult,
} from '@/lib/availability/blockValidation';

export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Hash the token for lookup
    const tokenHash = hashToken(token);

    // Look up the request
    const availabilityRequest = await getAvailabilityRequestByTokenHash(tokenHash);

    if (!availabilityRequest) {
      return NextResponse.json(
        { error: 'Availability request not found' },
        { status: 404 }
      );
    }

    // Check expiry
    if (isTokenExpired(availabilityRequest.expiresAt)) {
      // Update status to expired if not already
      if (availabilityRequest.status === 'pending') {
        await updateAvailabilityRequest(availabilityRequest.id, { status: 'expired' });
      }
      return NextResponse.json(
        { error: 'Availability request has expired' },
        { status: 410 }
      );
    }

    // Check status - only pending or submitted requests can be viewed
    if (availabilityRequest.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Availability request has been cancelled' },
        { status: 409 }
      );
    }

    if (availabilityRequest.status === 'booked') {
      return NextResponse.json(
        { error: 'Interview has already been booked' },
        { status: 409 }
      );
    }

    // Get any existing availability blocks (for resubmission case)
    const existingBlocks = await getCandidateAvailabilityBlocksByRequestId(
      availabilityRequest.id
    );

    // Log the view
    const auditLog: AuditLog = {
      id: uuidv4(),
      requestId: null,  // Not a scheduling_request
      availabilityRequestId: availabilityRequest.id,  // FK to availability_requests
      bookingId: null,
      action: 'slots_viewed',
      actorType: 'candidate',
      actorId: null,
      payload: {
        endpoint: 'availability_request_view',
        status: availabilityRequest.status,
        hasExistingBlocks: existingBlocks.length > 0,
      },
      createdAt: new Date(),
    };
    await createAuditLog(auditLog);

    // Return availability request details
    return NextResponse.json({
      id: availabilityRequest.id,
      status: availabilityRequest.status,
      candidateName: availabilityRequest.candidateName,
      reqTitle: availabilityRequest.reqTitle,
      interviewType: availabilityRequest.interviewType,
      durationMinutes: availabilityRequest.durationMinutes,
      windowStart: availabilityRequest.windowStart.toISOString(),
      windowEnd: availabilityRequest.windowEnd.toISOString(),
      expiresAt: availabilityRequest.expiresAt.toISOString(),
      candidateTimezone: availabilityRequest.candidateTimezone,
      minTotalMinutes: availabilityRequest.minTotalMinutes,
      minBlocks: availabilityRequest.minBlocks,
      existingBlocks: existingBlocks.map((block) => ({
        id: block.id,
        startAt: block.startAt.toISOString(),
        endAt: block.endAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error getting availability request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;

    if (!token) {
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      );
    }

    // Hash the token for lookup
    const tokenHash = hashToken(token);

    // Look up the request
    const availabilityRequest = await getAvailabilityRequestByTokenHash(tokenHash);

    if (!availabilityRequest) {
      return NextResponse.json(
        { error: 'Availability request not found' },
        { status: 404 }
      );
    }

    // Check expiry
    if (isTokenExpired(availabilityRequest.expiresAt)) {
      if (availabilityRequest.status === 'pending') {
        await updateAvailabilityRequest(availabilityRequest.id, { status: 'expired' });
      }
      return NextResponse.json(
        { error: 'Availability request has expired' },
        { status: 410 }
      );
    }

    // Check status - only pending or submitted requests can accept new blocks
    if (availabilityRequest.status === 'cancelled') {
      return NextResponse.json(
        { error: 'Availability request has been cancelled' },
        { status: 409 }
      );
    }

    if (availabilityRequest.status === 'booked') {
      return NextResponse.json(
        { error: 'Interview has already been booked' },
        { status: 409 }
      );
    }

    const body: SubmitAvailabilityInput = await request.json();

    // Validate required fields
    if (!body.candidateTimezone) {
      return NextResponse.json(
        { error: 'candidateTimezone is required' },
        { status: 400 }
      );
    }

    if (!body.blocks || !Array.isArray(body.blocks) || body.blocks.length === 0) {
      return NextResponse.json(
        { error: 'At least one availability block is required' },
        { status: 400 }
      );
    }

    // Validate and normalize blocks
    const validationResult: ValidationResult = validateAndNormalizeBlocks(
      body.blocks,
      {
        windowStart: availabilityRequest.windowStart,
        windowEnd: availabilityRequest.windowEnd,
        minTotalMinutes: availabilityRequest.minTotalMinutes,
        minBlocks: availabilityRequest.minBlocks,
        durationMinutes: availabilityRequest.durationMinutes,
      }
    );

    if (!validationResult.valid) {
      return NextResponse.json(
        {
          error: 'Invalid availability blocks',
          details: validationResult.errors,
        },
        { status: 400 }
      );
    }

    // Delete any existing blocks (for resubmission)
    await deleteCandidateAvailabilityBlocksByRequestId(availabilityRequest.id);

    // Create new blocks
    const now = new Date();
    const createdBlocks: CandidateAvailabilityBlock[] = [];

    for (const block of validationResult.normalizedBlocks) {
      const newBlock: CandidateAvailabilityBlock = {
        id: uuidv4(),
        availabilityRequestId: availabilityRequest.id,
        startAt: block.startAt,
        endAt: block.endAt,
        createdAt: now,
      };
      await createCandidateAvailabilityBlock(newBlock);
      createdBlocks.push(newBlock);
    }

    // Update request status to submitted and set timezone
    await updateAvailabilityRequest(availabilityRequest.id, {
      status: 'submitted',
      candidateTimezone: body.candidateTimezone,
    });

    // Log the submission
    const auditLog: AuditLog = {
      id: uuidv4(),
      requestId: null,  // Not a scheduling_request
      availabilityRequestId: availabilityRequest.id,  // FK to availability_requests
      bookingId: null,
      action: 'slots_viewed', // Using existing action type for now
      actorType: 'candidate',
      actorId: null,
      payload: {
        operation: 'availability_submitted',
        blockCount: createdBlocks.length,
        totalMinutes: validationResult.totalMinutes,
        candidateTimezone: body.candidateTimezone,
      },
      createdAt: now,
    };
    await createAuditLog(auditLog);

    return NextResponse.json({
      success: true,
      message: 'Availability submitted successfully',
      blocksCount: createdBlocks.length,
      totalMinutes: validationResult.totalMinutes,
    });
  } catch (error) {
    console.error('Error submitting availability:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
