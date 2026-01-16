/**
 * Get Invite Details API
 *
 * GET - Fetch invite details by code (public endpoint, no auth required to view)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getInviteWithOrg } from '@/lib/db';

interface RouteParams {
  params: Promise<{ inviteCode: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { inviteCode } = await params;

    const invite = await getInviteWithOrg(inviteCode);

    if (!invite) {
      return NextResponse.json(
        { error: 'Invite not found' },
        { status: 404 }
      );
    }

    // Check if expired
    if (invite.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'This invite has expired' },
        { status: 410 }
      );
    }

    // Check if already used
    if (invite.status !== 'pending') {
      return NextResponse.json(
        { error: `This invite has already been ${invite.status}` },
        { status: 410 }
      );
    }

    // Return invite details (without sensitive data)
    return NextResponse.json({
      invite: {
        organizationName: invite.organizationName,
        organizationSlug: invite.organizationSlug,
        role: invite.role,
        expiresAt: invite.expiresAt.toISOString(),
        status: invite.status,
      },
    });
  } catch (error) {
    console.error('Failed to fetch invite:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invite' },
      { status: 500 }
    );
  }
}
