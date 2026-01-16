/**
 * Single Invite Management API
 *
 * DELETE - Revoke/delete an invite
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getOrgMembership, revokeInvite, getInviteById } from '@/lib/db';

interface RouteParams {
  params: Promise<{ orgId: string; inviteId: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId, inviteId } = await params;

    // Check user is admin of the organization
    const membership = await getOrgMembership(orgId, session.user.id);
    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can revoke invites' },
        { status: 403 }
      );
    }

    // Verify invite belongs to this org
    const invite = await getInviteById(inviteId);
    if (!invite || invite.organizationId !== orgId) {
      return NextResponse.json(
        { error: 'Invite not found' },
        { status: 404 }
      );
    }

    const revokedInvite = await revokeInvite(inviteId);

    if (!revokedInvite) {
      return NextResponse.json(
        { error: 'Failed to revoke invite or invite already used' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to revoke invite:', error);
    return NextResponse.json(
      { error: 'Failed to revoke invite' },
      { status: 500 }
    );
  }
}
