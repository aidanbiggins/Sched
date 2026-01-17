/**
 * API: Load Rollups
 * M15: Capacity Planning
 *
 * GET /api/capacity/load - Get load data for interviewers
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getLoadRollupsByOrg,
  getInterviewerProfilesByOrg,
  getAtCapacityInterviewers,
  getOverCapacityInterviewers,
} from '@/lib/db';
import { getWeekStart, getWeekEnd } from '@/lib/capacity';

/**
 * GET /api/capacity/load
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const weekParam = searchParams.get('week'); // ISO date string for week

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Missing organizationId parameter' },
      { status: 400 }
    );
  }

  try {
    // Determine week window
    const targetDate = weekParam ? new Date(weekParam) : new Date();
    const weekStart = getWeekStart(targetDate);
    const weekEnd = getWeekEnd(targetDate);

    // Get profiles and rollups
    const profiles = await getInterviewerProfilesByOrg(organizationId);
    const rollups = await getLoadRollupsByOrg(organizationId, weekStart);

    // Get capacity alerts
    const atCapacity = await getAtCapacityInterviewers(organizationId, weekStart);
    const overCapacity = await getOverCapacityInterviewers(organizationId, weekStart);

    // Build rollup map for easier lookup
    const rollupByProfile = new Map(
      rollups.map((r) => [r.interviewerProfileId, r])
    );

    // Calculate overview metrics
    const activeProfiles = profiles.filter((p) => p.isActive);
    const utilizationValues = rollups.map((r) => r.utilizationPct);
    const avgUtilization = utilizationValues.length > 0
      ? utilizationValues.reduce((a, b) => a + b, 0) / utilizationValues.length
      : 0;
    const totalScheduled = rollups.reduce((sum, r) => sum + r.scheduledCount, 0);

    // Build interviewer summaries
    const interviewerSummaries = activeProfiles.map((profile) => {
      const rollup = rollupByProfile.get(profile.id);

      let status: 'ok' | 'warning' | 'critical' = 'ok';
      if (rollup?.overCapacity) {
        status = 'critical';
      } else if (rollup?.atCapacity) {
        status = 'warning';
      }

      return {
        id: profile.id,
        email: profile.email,
        maxPerWeek: profile.maxInterviewsPerWeek,
        maxPerDay: profile.maxInterviewsPerDay,
        scheduled: rollup?.scheduledCount ?? 0,
        utilization: rollup?.utilizationPct ?? 0,
        peakDay: rollup?.peakDayCount ?? 0,
        status,
        isActive: profile.isActive,
        hasRollup: !!rollup,
      };
    });

    return NextResponse.json({
      weekStart: weekStart.toISOString(),
      weekEnd: weekEnd.toISOString(),
      overview: {
        totalInterviewers: activeProfiles.length,
        avgUtilization: Math.round(avgUtilization),
        atCapacityCount: atCapacity.length,
        overCapacityCount: overCapacity.length,
        totalScheduledThisWeek: totalScheduled,
      },
      interviewers: interviewerSummaries,
      rollups,
    });
  } catch (error) {
    console.error('Failed to fetch load data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch load data' },
      { status: 500 }
    );
  }
}
