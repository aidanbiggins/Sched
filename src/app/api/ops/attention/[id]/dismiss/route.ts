/**
 * API Route: /api/ops/attention/[id]/dismiss
 *
 * POST - Dismiss attention flag on a request (M6)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingRequestById, updateSchedulingRequest, createAuditLog } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Parse body for optional reason
    let body: { reason?: string } = {};
    try {
      body = await request.json();
    } catch {
      // No body is fine
    }

    const existing = await getSchedulingRequestById(id);
    if (!existing) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }

    if (!existing.needsAttention) {
      return NextResponse.json(
        { error: 'Request does not need attention' },
        { status: 400 }
      );
    }

    // Clear attention flag
    await updateSchedulingRequest(id, {
      needsAttention: false,
      needsAttentionReason: null,
    });

    // Log the dismissal
    await createAuditLog({
      id: uuidv4(),
      requestId: id,
      bookingId: null,
      action: 'needs_attention_set',
      actorType: 'coordinator',
      actorId: null,
      payload: {
        action: 'dismissed',
        previousReason: existing.needsAttentionReason,
        dismissalReason: body.reason || 'Manually dismissed',
      },
      createdAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: 'Attention flag dismissed',
    });
  } catch (error) {
    console.error('Error dismissing attention:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss attention' },
      { status: 500 }
    );
  }
}
