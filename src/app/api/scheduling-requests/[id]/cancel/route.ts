/**
 * API Route: /api/scheduling-requests/[id]/cancel
 *
 * POST - Cancel a scheduling request
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingService } from '@/lib/scheduling';

interface RouteParams {
  params: { id: string } | Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Handle both sync and async params (Next.js version differences)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;

    const body = await request.json();

    if (!body.reason) {
      return NextResponse.json(
        { error: 'Missing required field: reason' },
        { status: 400 }
      );
    }

    const service = getSchedulingService();
    const result = await service.cancel(
      id,
      body.reason,
      body.notifyParticipants ?? true,
      body.actorId
    );

    return NextResponse.json({
      success: true,
      status: result.status,
      cancelledAt: result.cancelledAt.toISOString(),
      calendarEventId: result.calendarEventId,
    });
  } catch (error) {
    console.error('Error cancelling scheduling request:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    // Determine appropriate status code
    let status = 500;
    if (message.includes('not found')) {
      status = 404;
    } else if (message.includes('already cancelled') || message.includes('Cannot cancel')) {
      status = 400;
    } else if (message.includes('Failed to cancel calendar event')) {
      status = 502; // Bad Gateway - external service failure
    }

    return NextResponse.json({ error: message }, { status });
  }
}
