/**
 * Ops API: Audit Logs
 * Returns audit log entries for the ops dashboard
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { isSuperadmin } from '@/lib/auth/superadmin';
import { getAllAuditLogs } from '@/lib/db';

/**
 * GET /api/ops/audit
 * Returns audit logs with filtering
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check authentication
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !isSuperadmin(session.user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const limit = parseInt(searchParams.get('limit') || '100', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  try {
    // Get all audit logs (superadmin sees all)
    const allLogs = await getAllAuditLogs();

    // Filter by action if specified
    let filteredLogs = allLogs;
    if (action) {
      filteredLogs = allLogs.filter(log => log.action === action);
    }

    // Sort by createdAt descending
    filteredLogs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Paginate
    const paginatedLogs = filteredLogs.slice(offset, offset + limit);

    // Map to response format
    const logs = paginatedLogs.map(log => ({
      id: log.id,
      action: log.action,
      actorType: log.actorType,
      actorId: log.actorId,
      requestId: log.requestId,
      bookingId: log.bookingId,
      payload: log.payload,
      createdAt: log.createdAt.toISOString(),
    }));

    // Get unique actions for filter dropdown
    const actions = [...new Set(allLogs.map(log => log.action))].sort();

    return NextResponse.json({
      logs,
      total: filteredLogs.length,
      limit,
      offset,
      actions,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit logs' },
      { status: 500 }
    );
  }
}
