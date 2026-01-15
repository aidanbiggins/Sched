/**
 * API Route: /api/webhooks/icims
 *
 * POST - Receive webhook events from iCIMS (M6 Enhanced)
 *
 * Features:
 * - HMAC signature verification
 * - Idempotent storage (by eventId or payload hash)
 * - Fast acknowledgment (stores and returns, processes async)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWebhookService, WebhookPayload } from '@/lib/webhook';

export async function POST(request: NextRequest) {
  try {
    // Get the signature from header
    const signature = request.headers.get('x-icims-signature') || '';

    // Get raw body for signature verification
    const rawBody = await request.text();

    // Parse the body
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON payload', code: 'INVALID_JSON' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (!body.eventType) {
      return NextResponse.json(
        { error: 'Missing required field: eventType', code: 'MISSING_FIELD' },
        { status: 400 }
      );
    }

    const payload: WebhookPayload = {
      eventId: body.eventId as string | undefined,
      eventType: body.eventType as string,
      timestamp: (body.timestamp as string) || new Date().toISOString(),
      data: (body.data as Record<string, unknown>) || {},
    };

    const service = getWebhookService();
    const result = await service.receiveWebhook(payload, signature, rawBody);

    // Always return 200 for fast response (even if signature invalid)
    // The result indicates the actual status
    return NextResponse.json({
      received: true,
      webhookId: result.webhookId,
      eventId: result.eventId,
      isDuplicate: result.isDuplicate,
      verified: result.verified,
      message: result.message,
    });
  } catch (error) {
    console.error('Error processing webhook:', error);

    // Still return 200 to prevent webhook retries for parsing errors
    return NextResponse.json({
      received: false,
      error: error instanceof Error ? error.message : 'Parse error',
      code: 'INTERNAL_ERROR',
    });
  }
}
