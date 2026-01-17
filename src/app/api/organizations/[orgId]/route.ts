/**
 * API Route: /api/organizations/[orgId]
 *
 * GET - Get organization details
 * PATCH - Update organization (admin only)
 * DELETE - Delete organization (admin only, requires confirmation)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getOrganizationById, updateOrganization, getOrgMemberCount } from '@/lib/db';
import { createAuditLog } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { orgId } = await params;
    const org = await getOrganizationById(orgId);

    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Get member count
    const memberCount = await getOrgMemberCount(orgId);

    return NextResponse.json({
      id: org.id,
      name: org.name,
      slug: org.slug || null,
      memberCount,
      createdAt: org.createdAt.toISOString(),
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
): Promise<NextResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user is admin of this organization
    if (session.user.activeOrgRole !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
    }

    const { orgId } = await params;
    const body = await request.json();
    const { name, slug } = body;

    // Validate input
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (slug && typeof slug === 'string') {
      // Validate slug format
      if (!/^[a-z0-9-]+$/.test(slug)) {
        return NextResponse.json({ error: 'Slug must contain only lowercase letters, numbers, and hyphens' }, { status: 400 });
      }
    }

    const org = await getOrganizationById(orgId);
    if (!org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Update organization
    const updated = await updateOrganization(orgId, {
      name: name.trim(),
      slug: slug?.trim() || null,
    });

    if (!updated) {
      return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 });
    }

    // Create audit log
    await createAuditLog({
      id: `audit-${Date.now()}`,
      requestId: null,
      bookingId: null,
      action: 'org_updated',
      actorType: 'coordinator',
      actorId: session.user.id,
      payload: {
        organizationId: orgId,
        previousName: org.name,
        newName: name.trim(),
        previousSlug: org.slug,
        newSlug: slug?.trim() || null,
      },
      createdAt: new Date(),
    });

    return NextResponse.json({
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
    });
  } catch (error) {
    console.error('Error updating organization:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
