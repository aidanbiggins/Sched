/**
 * API: Dismiss Recommendation
 * M15: Capacity Planning
 *
 * POST /api/capacity/recommendations/[id]/dismiss - Dismiss a recommendation
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { dismissRecommendation } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/capacity/recommendations/[id]/dismiss
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const reason = body.reason || null;

    const recommendation = await dismissRecommendation(
      id,
      session.user.id,
      reason
    );

    if (!recommendation) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ recommendation });
  } catch (error) {
    console.error('Failed to dismiss recommendation:', error);
    return NextResponse.json(
      { error: 'Failed to dismiss recommendation' },
      { status: 500 }
    );
  }
}
