/**
 * API Route: /api/scheduling/slots
 *
 * GET - Get available slots for a scheduling request (public)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingService } from '@/lib/scheduling';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Missing required parameter: token' },
        { status: 400 }
      );
    }

    const service = getSchedulingService();
    const result = await service.getAvailableSlots(token);

    // Convert dates to ISO strings for JSON
    const response = {
      ...result,
      slots: result.slots.map((slot) => ({
        ...slot,
        start: slot.start.toISOString(),
        end: slot.end.toISOString(),
      })),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error getting available slots:', error);

    // Handle specific errors
    const message = error instanceof Error ? error.message : 'Internal server error';

    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('expired')) {
      return NextResponse.json({ error: message }, { status: 410 });
    }
    if (message.includes('is ')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
