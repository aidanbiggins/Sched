/**
 * API: Recommendations
 * M15: Capacity Planning
 *
 * GET /api/capacity/recommendations - List active recommendations
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getRecommendationsByOrg } from '@/lib/db';
import type { RecommendationStatus } from '@/types/capacity';

/**
 * GET /api/capacity/recommendations
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');
  const statusParam = searchParams.get('status') || 'active';
  const status = statusParam as RecommendationStatus;

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Missing organizationId parameter' },
      { status: 400 }
    );
  }

  try {
    const recommendations = await getRecommendationsByOrg(organizationId, status);

    // Group by priority for easier display
    const byPriority = {
      critical: recommendations.filter((r) => r.priority === 'critical'),
      high: recommendations.filter((r) => r.priority === 'high'),
      medium: recommendations.filter((r) => r.priority === 'medium'),
      low: recommendations.filter((r) => r.priority === 'low'),
    };

    return NextResponse.json({
      recommendations,
      byPriority,
      count: recommendations.length,
    });
  } catch (error) {
    console.error('Failed to fetch recommendations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recommendations' },
      { status: 500 }
    );
  }
}
