/**
 * Select Organization API
 *
 * POST - Set active organization for the current session
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getOrgMembership } from '@/lib/db';
import { cookies } from 'next/headers';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { organizationId } = body;

    if (!organizationId || typeof organizationId !== 'string') {
      return NextResponse.json(
        { error: 'Organization ID is required' },
        { status: 400 }
      );
    }

    // Verify user is a member of this organization
    const membership = await getOrgMembership(organizationId, session.user.id);

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this organization' },
        { status: 403 }
      );
    }

    // Store active org in cookie
    const cookieStore = await cookies();
    cookieStore.set('sched_active_org', organizationId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return NextResponse.json({
      success: true,
      activeOrgId: organizationId,
      activeOrgRole: membership.role,
    });
  } catch (error) {
    console.error('Failed to select organization:', error);
    return NextResponse.json(
      { error: 'Failed to select organization' },
      { status: 500 }
    );
  }
}
