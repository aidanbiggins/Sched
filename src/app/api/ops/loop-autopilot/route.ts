/**
 * API Route: /api/ops/loop-autopilot
 *
 * GET - Ops visibility into Loop Autopilot solve runs and bookings
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getLoopSolveRunsForOps, getLoopBookingsForOps, getLoopTemplatesByOrg } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const organizationId = (session.user as { organizationId?: string | null }).organizationId;

    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24', 10);
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Get solve runs
    const solveRuns = await getLoopSolveRunsForOps(organizationId || null, since);

    // Get bookings
    const bookings = await getLoopBookingsForOps(organizationId || null, since);

    // Get templates for reference
    const templates = organizationId
      ? await getLoopTemplatesByOrg(organizationId, false)
      : [];

    // Compute summary stats
    const stats = {
      totalSolveRuns: solveRuns.length,
      solvedCount: solveRuns.filter((r) => r.status === 'SOLVED').length,
      unsatisfiableCount: solveRuns.filter((r) => r.status === 'UNSATISFIABLE').length,
      errorCount: solveRuns.filter((r) => r.status === 'ERROR').length,
      timeoutCount: solveRuns.filter((r) => r.status === 'TIMEOUT').length,
      totalBookings: bookings.length,
      committedCount: bookings.filter((b) => b.status === 'COMMITTED').length,
      failedCount: bookings.filter((b) => b.status === 'FAILED').length,
      pendingCount: bookings.filter((b) => b.status === 'PENDING').length,
      avgSolveDurationMs:
        solveRuns.length > 0
          ? Math.round(
              solveRuns
                .filter((r) => r.solveDurationMs !== null)
                .reduce((sum, r) => sum + (r.solveDurationMs || 0), 0) /
                solveRuns.filter((r) => r.solveDurationMs !== null).length
            )
          : 0,
    };

    return NextResponse.json({
      stats,
      recentSolveRuns: solveRuns.slice(0, 50).map((r) => ({
        id: r.id,
        status: r.status,
        solutionsCount: r.solutionsCount,
        solveDurationMs: r.solveDurationMs,
        searchIterations: r.searchIterations,
        graphApiCalls: r.graphApiCalls,
        errorMessage: r.errorMessage,
        createdAt: r.createdAt.toISOString(),
        loopTemplateId: r.loopTemplateId,
        availabilityRequestId: r.availabilityRequestId,
      })),
      recentBookings: bookings.slice(0, 50).map((b) => ({
        id: b.id,
        status: b.status,
        chosenSolutionId: b.chosenSolutionId,
        rollbackAttempted: b.rollbackAttempted,
        errorMessage: b.errorMessage,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
        loopTemplateId: b.loopTemplateId,
        availabilityRequestId: b.availabilityRequestId,
      })),
      templates: templates.map((t) => ({
        id: t.id,
        name: t.name,
        isActive: t.isActive,
      })),
    });
  } catch (error) {
    console.error('Error in ops loop-autopilot:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
