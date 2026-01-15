/**
 * API Route: /api/ops/reconciliation
 *
 * GET - List reconciliation jobs with filtering (M6)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getReconciliationJobsFiltered } from '@/lib/db';
import { ReconciliationJobStatus } from '@/types/scheduling';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    // Parse filters
    const statusParam = searchParams.get('status');
    const jobTypeParam = searchParams.get('jobType');
    const filters: {
      status?: ReconciliationJobStatus[];
      jobType?: string;
    } = {
      status: statusParam
        ? (statusParam.split(',') as ReconciliationJobStatus[])
        : undefined,
      jobType: jobTypeParam || undefined,
    };

    // Pagination
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const result = await getReconciliationJobsFiltered(filters, { page, limit });

    return NextResponse.json({
      jobs: result.data,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
      },
    });
  } catch (error) {
    console.error('Error fetching reconciliation jobs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reconciliation jobs' },
      { status: 500 }
    );
  }
}
