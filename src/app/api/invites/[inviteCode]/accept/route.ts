/**
 * Accept Invite API
 *
 * POST - Accept an invite and join the organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { acceptInvite, getOrgMembership, getInviteByCode } from '@/lib/db';

interface RouteParams {
  params: Promise<{ inviteCode: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { inviteCode } = await params;

    // Get invite to check organization
    const invite = await getInviteByCode(inviteCode);
    if (!invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    // Check if user is already a member
    const existingMembership = await getOrgMembership(
      invite.organizationId,
      session.user.id
    );
    if (existingMembership) {
      return NextResponse.json(
        { error: 'You are already a member of this organization' },
        { status: 400 }
      );
    }

    // Accept the invite
    const result = await acceptInvite({
      inviteCode,
      userId: session.user.id,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to accept invite' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      organizationId: invite.organizationId,
    });
  } catch (error) {
    console.error('Failed to accept invite:', error);
    return NextResponse.json(
      { error: 'Failed to accept invite' },
      { status: 500 }
    );
  }
}
