/**
 * API Route: /api/public/scheduling-requests/:token
 *
 * GET - Get scheduling request details and available slots (public, v2)
 */

import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getSchedulingService } from '@/lib/scheduling';
import { createAuditLog, getSchedulingRequestByTokenHash } from '@/lib/db';
import { hashToken, isTokenExpired } from '@/lib/utils/tokens';
import { AuditLog } from '@/types/scheduling';

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

    // Log the public read (never log the raw token)
    const auditLog: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'slots_viewed',
      actorType: 'candidate',
      actorId: null,
      payload: {
        endpoint: 'public_read',
        timestamp: new Date().toISOString(),
      },
      createdAt: new Date(),
    };
    await createAuditLog(auditLog);

    // Hash the token for lookup
    const tokenHash = hashToken(token);

    // Look up the request
    const schedulingRequest = await getSchedulingRequestByTokenHash(tokenHash);

    if (!schedulingRequest) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    // Check expiry
    if (isTokenExpired(schedulingRequest.expiresAt)) {
      return NextResponse.json(
        { error: 'Scheduling link has expired' },
        { status: 410 }
      );
    }

    // Check status
    if (schedulingRequest.status !== 'pending') {
      return NextResponse.json(
        { error: `Scheduling request is ${schedulingRequest.status}` },
        { status: 409 }
      );
    }

    // Get available slots
    const service = getSchedulingService();
    const slotsResult = await service.getAvailableSlots(token);

    // Log slot computation (count only)
    const slotCountLog: AuditLog = {
      id: uuidv4(),
      requestId: schedulingRequest.id,
      bookingId: null,
      action: 'slots_viewed',
      actorType: 'system',
      actorId: null,
      payload: {
        operation: 'slot_list_computed',
        slotCount: slotsResult.slots.length,
      },
      createdAt: new Date(),
    };
    await createAuditLog(slotCountLog);

    // Return v2 response format
    return NextResponse.json({
      status: schedulingRequest.status,
      durationMinutes: schedulingRequest.durationMinutes,
      interviewerEmail: schedulingRequest.interviewerEmails[0],
      windowStart: schedulingRequest.windowStart.toISOString(),
      windowEnd: schedulingRequest.windowEnd.toISOString(),
      slots: slotsResult.slots.map((slot) => ({
        slotId: slot.slotId,
        startAtUtc: slot.start.toISOString(),
        endAtUtc: slot.end.toISOString(),
        displayStartLocal: slot.displayStart,
        displayEndLocal: slot.displayEnd,
      })),
    });
  } catch (error) {
    console.error('Error getting scheduling request:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('expired')) {
      return NextResponse.json({ error: message }, { status: 410 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
