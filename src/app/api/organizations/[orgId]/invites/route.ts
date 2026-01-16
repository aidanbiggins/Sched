/**
 * Organization Invites API
 *
 * POST - Create invite(s)
 * GET - List invites for organization
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  createInvite,
  getOrgInvites,
  getPendingInvites,
  getOrgMembership,
  hasPendingInvite,
} from '@/lib/db';
import type { OrgMemberRole } from '@/types/organization';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

// Create invite(s)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await params;

    // Check user is admin of the organization
    const membership = await getOrgMembership(orgId, session.user.id);
    if (!membership || membership.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can invite members' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { emails, role, linkOnly } = body as {
      emails?: string[];
      role: OrgMemberRole;
      linkOnly?: boolean;
    };

    if (!role) {
      return NextResponse.json({ error: 'Role is required' }, { status: 400 });
    }

    // Link-only invite (no email)
    if (linkOnly) {
      const invite = await createInvite({
        organizationId: orgId,
        role,
        invitedBy: session.user.id,
      });

      return NextResponse.json({
        success: true,
        inviteCode: invite.inviteCode,
        expiresAt: invite.expiresAt,
      });
    }

    // Email invites
    if (!emails || emails.length === 0) {
      return NextResponse.json(
        { error: 'At least one email is required' },
        { status: 400 }
      );
    }

    const results = {
      invitesSent: 0,
      skipped: [] as string[],
      errors: [] as string[],
    };

    for (const email of emails) {
      const normalizedEmail = email.toLowerCase().trim();

      // Check if already has pending invite
      if (await hasPendingInvite(orgId, normalizedEmail)) {
        results.skipped.push(normalizedEmail);
        continue;
      }

      try {
        await createInvite({
          organizationId: orgId,
          email: normalizedEmail,
          role,
          invitedBy: session.user.id,
        });
        results.invitesSent++;
      } catch (err) {
        results.errors.push(normalizedEmail);
      }
    }

    return NextResponse.json(results, { status: 201 });
  } catch (error) {
    console.error('Failed to create invite:', error);
    return NextResponse.json(
      { error: 'Failed to create invite' },
      { status: 500 }
    );
  }
}

// List invites
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await params;
    const { searchParams } = new URL(request.url);
    const pendingOnly = searchParams.get('pending') === 'true';

    // Check user is member of the organization
    const membership = await getOrgMembership(orgId, session.user.id);
    if (!membership) {
      return NextResponse.json(
        { error: 'Not a member of this organization' },
        { status: 403 }
      );
    }

    const invites = pendingOnly
      ? await getPendingInvites(orgId)
      : await getOrgInvites(orgId);

    return NextResponse.json({ invites });
  } catch (error) {
    console.error('Failed to fetch invites:', error);
    return NextResponse.json(
      { error: 'Failed to fetch invites' },
      { status: 500 }
    );
  }
}
