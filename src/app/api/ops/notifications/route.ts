/**
 * API Route: /api/ops/notifications
 *
 * GET - List notification jobs with filtering
 *   Query params:
 *   - status: comma-separated list (PENDING,SENDING,SENT,FAILED,CANCELED)
 *   - type: comma-separated list
 *   - page: page number (default 1)
 *   - limit: items per page (default 20)
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getNotificationJobsFiltered,
  getNotificationJobCounts,
} from '@/lib/db';
import { NotificationStatus, NotificationType } from '@/types/scheduling';

// Superadmin check (same pattern as other ops endpoints)
function isSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const superadmins = (process.env.SUPERADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase());
  return superadmins.includes(email.toLowerCase());
}

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check superadmin
    if (!isSuperadmin(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // Parse filters
    const filters: {
      status?: NotificationStatus[];
      type?: NotificationType[];
    } = {};

    const statusParam = searchParams.get('status');
    if (statusParam) {
      filters.status = statusParam.split(',').filter(Boolean) as NotificationStatus[];
    }

    const typeParam = searchParams.get('type');
    if (typeParam) {
      filters.type = typeParam.split(',').filter(Boolean) as NotificationType[];
    }

    // Parse pagination
    const pagination = {
      page: parseInt(searchParams.get('page') || '1', 10),
      limit: Math.min(parseInt(searchParams.get('limit') || '20', 10), 100),
    };

    // Get filtered jobs and counts (gracefully handle if table doesn't exist)
    let result: { data: Array<{ id: string; type: string; entityType: string; entityId: string; toEmail: string; status: string; attempts: number; maxAttempts: number; lastError: string | null; runAfter: Date; sentAt: Date | null; createdAt: Date }>; page: number; limit: number; total: number } = { data: [], page: 1, limit: pagination.limit, total: 0 };
    let counts = { pending: 0, sending: 0, sent: 0, failed: 0, canceled: 0 };
    try {
      const [fetchedResult, fetchedCounts] = await Promise.all([
        getNotificationJobsFiltered(filters, pagination),
        getNotificationJobCounts(),
      ]);
      result = fetchedResult;
      counts = fetchedCounts;
    } catch (dbError) {
      console.warn('Could not fetch notifications (table may not exist):', dbError);
    }

    // Format response
    const formattedJobs = result.data.map((job) => ({
      id: job.id,
      type: job.type,
      entityType: job.entityType,
      entityId: job.entityId,
      toEmail: job.toEmail,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      lastError: job.lastError,
      runAfter: job.runAfter.toISOString(),
      sentAt: job.sentAt?.toISOString() || null,
      createdAt: job.createdAt.toISOString(),
    }));

    return NextResponse.json({
      jobs: formattedJobs,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / result.limit),
      },
      counts,
    });
  } catch (error) {
    console.error('Error listing notification jobs:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
