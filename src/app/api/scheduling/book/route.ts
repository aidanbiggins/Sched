/**
 * API Route: /api/scheduling/book
 *
 * POST - Book a slot (public)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingService } from '@/lib/scheduling';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.token || !body.slotId) {
      return NextResponse.json(
        { error: 'Missing required fields: token, slotId' },
        { status: 400 }
      );
    }

    const service = getSchedulingService();
    const result = await service.bookSlot(body.token, body.slotId);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error booking slot:', error);

    const message = error instanceof Error ? error.message : 'Internal server error';

    // Handle specific errors
    if (message.includes('not found')) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes('expired')) {
      return NextResponse.json({ error: message }, { status: 410 });
    }
    if (message.includes('already been booked') || message.includes('no longer available')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }
    if (message.includes('Cannot book')) {
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
