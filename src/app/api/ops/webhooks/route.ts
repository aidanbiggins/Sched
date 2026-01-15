/**
 * API Route: /api/ops/webhooks
 *
 * GET - List webhook events with filtering (M6)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getWebhookEventsFiltered } from '@/lib/db';
import { WebhookStatus } from '@/types/scheduling';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Parse filters
    const statusParam = searchParams.get('status');
    const filters: {
      status?: WebhookStatus[];
      provider?: string;
    } = {
      status: statusParam
        ? (statusParam.split(',') as WebhookStatus[])
        : undefined,
      provider: searchParams.get('provider') || undefined,
    };

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await getWebhookEventsFiltered(filters, { page, limit });

    return NextResponse.json({
      events: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  } catch (error) {
    console.error('Error fetching webhook events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch webhook events' },
      { status: 500 }
    );
  }
}
