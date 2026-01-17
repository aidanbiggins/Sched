/**
 * API Route: /api/analytics
 *
 * GET - Get scheduling analytics for a time period
 *   Query params:
 *   - period: '7d' | '30d' | '90d' | 'all' (default '30d')
 */

// Force dynamic rendering - disable Next.js route caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getAnalytics } from '@/lib/analytics/AnalyticsService';
import { AnalyticsPeriod } from '@/lib/analytics/types';

const VALID_PERIODS: AnalyticsPeriod[] = ['7d', '30d', '90d', 'all'];

export async function GET(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse period from query params
    const periodParam = searchParams.get('period') || '30d';
    const period: AnalyticsPeriod = VALID_PERIODS.includes(periodParam as AnalyticsPeriod)
      ? (periodParam as AnalyticsPeriod)
      : '30d';

    // Get analytics for the user
    const analytics = await getAnalytics(period, session.user.id);

    return NextResponse.json(analytics);
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}
