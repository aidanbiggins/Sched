/**
 * API Route: /api/availability-requests/:id/resend
 *
 * POST - Resend the availability request link to the candidate
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
  updateAvailabilityRequest,
  createAuditLog,
} from '@/lib/db';
import {
  AuditLog,
} from '@/types/scheduling';
import {
  generatePublicToken,
} from '@/lib/utils/tokens';
import { enqueueResendAvailabilityRequest } from '@/lib/notifications';
import { isEmailEnabled } from '@/lib/config';

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
    const body = await request.json();

    // Get the availability request
    const availabilityRequest = await getAvailabilityRequestById(id);

    if (!availabilityRequest) {
      return NextResponse.json(
        { error: 'Availability request not found' },
        { status: 404 }
      );
    }

    // Check status - can only resend for pending or submitted requests
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

    const now = new Date();
    let newToken = availabilityRequest.publicToken;
    let newTokenHash = availabilityRequest.publicTokenHash;
    let newExpiresAt = availabilityRequest.expiresAt;

    // If request is expired or regenerateToken is requested, create new token
    const regenerateToken = body.regenerateToken || availabilityRequest.status === 'expired';

    if (regenerateToken) {
      const { token, tokenHash } = generatePublicToken();
      newToken = token;
      newTokenHash = tokenHash;

      // Extend expiry by another week from now
      const extendDays = body.extendDays || 7;
      newExpiresAt = new Date(now.getTime() + extendDays * 24 * 60 * 60 * 1000);

      // Update the request with new token and reset status if expired
      await updateAvailabilityRequest(id, {
        publicToken: newToken,
        publicTokenHash: newTokenHash,
        expiresAt: newExpiresAt,
        status: availabilityRequest.status === 'expired' ? 'pending' : availabilityRequest.status,
      });
    }

    // Build public link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const publicLink = `${baseUrl}/availability/${newToken}`;

    // Create audit log
    const auditLog: AuditLog = {
      id: uuidv4(),
      requestId: null,  // Not a scheduling_request
      availabilityRequestId: id,  // FK to availability_requests
      bookingId: null,
      action: 'link_created',
      actorType: 'coordinator',
      actorId: session.user.id,
      payload: {
        operation: 'resend_link',
        tokenRegenerated: regenerateToken,
        expiresAt: newExpiresAt.toISOString(),
        previousStatus: availabilityRequest.status,
      },
      createdAt: now,
    };
    await createAuditLog(auditLog);

    // Enqueue email notification if enabled
    let emailQueued = false;
    if (isEmailEnabled()) {
      try {
        // Need to get the updated request with the new token if regenerated
        const updatedRequest = regenerateToken
          ? await getAvailabilityRequestById(id)
          : availabilityRequest;

        if (updatedRequest) {
          await enqueueResendAvailabilityRequest(updatedRequest, publicLink);
          emailQueued = true;
        }
      } catch (emailError) {
        console.error('Failed to enqueue availability request email:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      publicLink,
      expiresAt: newExpiresAt.toISOString(),
      tokenRegenerated: regenerateToken,
      emailQueued,
      message: regenerateToken
        ? 'New link generated' + (emailQueued ? ' and email queued.' : '. Please share with the candidate.')
        : 'Link ready' + (emailQueued ? ' and email queued.' : '. Please share with the candidate.'),
    });
  } catch (error) {
    console.error('Error resending availability request:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
