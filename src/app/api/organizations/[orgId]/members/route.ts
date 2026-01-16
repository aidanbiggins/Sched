/**
 * Organization Members API
 *
 * GET - List members of an organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getOrgMembership, getOrgMembers } from '@/lib/db';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await params;

    // Debug logging
    console.log('Members API - orgId:', orgId, 'userId:', session.user.id);

    // Check user is member of the organization
    const membership = await getOrgMembership(orgId, session.user.id);
    console.log('Members API - membership found:', !!membership, membership);

    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 }
      );
    }

    const members = await getOrgMembers(orgId);

    // In a real app, we'd join with users table to get user details
    // For now, return the members with placeholder user info
    const membersWithUsers = members.map(member => ({
      ...member,
      user: member.userId === session.user?.id
        ? {
            name: session.user.name || 'You',
            email: session.user.email || '',
            image: session.user.image,
          }
        : {
            name: 'Team Member',
            email: member.userId,
          },
    }));

    return NextResponse.json({ members: membersWithUsers });
  } catch (error) {
    console.error('Failed to fetch members:', error);
    return NextResponse.json(
      { error: 'Failed to fetch members' },
      { status: 500 }
    );
  }
}
