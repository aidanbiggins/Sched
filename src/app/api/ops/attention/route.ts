/**
 * API Route: /api/ops/attention
 *
 * GET - List requests needing operator attention (M6)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getRequestsNeedingAttention } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await getRequestsNeedingAttention({ page, limit });

    return NextResponse.json({
      requests: result.data.map((r) => ({
        id: r.id,
        candidateName: r.candidateName,
        candidateEmail: r.candidateEmail,
        reqTitle: r.reqTitle,
        status: r.status,
        needsAttentionReason: r.needsAttentionReason,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      })),
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  } catch (error) {
    console.error('Error fetching attention requests:', error);
    return NextResponse.json(
      { error: 'Failed to fetch attention requests' },
      { status: 500 }
    );
  }
}
