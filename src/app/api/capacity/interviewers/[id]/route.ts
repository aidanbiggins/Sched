/**
 * API: Single Interviewer Profile
 * M15: Capacity Planning
 *
 * GET /api/capacity/interviewers/[id] - Get a single profile
 * PATCH /api/capacity/interviewers/[id] - Update a profile
 * DELETE /api/capacity/interviewers/[id] - Delete a profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getInterviewerProfileById,
  updateInterviewerProfile,
  deleteInterviewerProfile,
} from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/capacity/interviewers/[id]
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const profile = await getInterviewerProfileById(id);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Failed to fetch interviewer profile:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/capacity/interviewers/[id]
 */
export async function PATCH(
  request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const {
      maxInterviewsPerWeek,
      maxInterviewsPerDay,
      maxConcurrentPerDay,
      bufferMinutes,
      preferredTimes,
      blackoutDates,
      interviewTypePreferences,
      tags,
      skillAreas,
      seniorityLevels,
      isActive,
    } = body;

    // Build update object with only provided fields
    const updates: Record<string, unknown> = {};
    if (maxInterviewsPerWeek !== undefined) updates.maxInterviewsPerWeek = maxInterviewsPerWeek;
    if (maxInterviewsPerDay !== undefined) updates.maxInterviewsPerDay = maxInterviewsPerDay;
    if (maxConcurrentPerDay !== undefined) updates.maxConcurrentPerDay = maxConcurrentPerDay;
    if (bufferMinutes !== undefined) updates.bufferMinutes = bufferMinutes;
    if (preferredTimes !== undefined) updates.preferredTimes = preferredTimes;
    if (blackoutDates !== undefined) updates.blackoutDates = blackoutDates;
    if (interviewTypePreferences !== undefined) updates.interviewTypePreferences = interviewTypePreferences;
    if (tags !== undefined) updates.tags = tags;
    if (skillAreas !== undefined) updates.skillAreas = skillAreas;
    if (seniorityLevels !== undefined) updates.seniorityLevels = seniorityLevels;
    if (isActive !== undefined) updates.isActive = isActive;

    const profile = await updateInterviewerProfile(id, updates);

    if (!profile) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error('Failed to update interviewer profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/capacity/interviewers/[id]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: RouteParams
): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  try {
    const deleted = await deleteInterviewerProfile(id);

    if (!deleted) {
      return NextResponse.json(
        { error: 'Profile not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete interviewer profile:', error);
    return NextResponse.json(
      { error: 'Failed to delete profile' },
      { status: 500 }
    );
  }
}
