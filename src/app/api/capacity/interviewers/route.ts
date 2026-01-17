/**
 * API: Interviewer Profiles
 * M15: Capacity Planning
 *
 * GET /api/capacity/interviewers - List interviewer profiles for the org
 * POST /api/capacity/interviewers - Create a new interviewer profile
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getInterviewerProfilesByOrg,
  createInterviewerProfile,
  getInterviewerProfileByEmail,
} from '@/lib/db';
import { InterviewerProfileInput } from '@/types/capacity';

/**
 * GET /api/capacity/interviewers
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const organizationId = searchParams.get('organizationId');

  if (!organizationId) {
    return NextResponse.json(
      { error: 'Missing organizationId parameter' },
      { status: 400 }
    );
  }

  try {
    const profiles = await getInterviewerProfilesByOrg(organizationId);

    return NextResponse.json({
      profiles,
      count: profiles.length,
    });
  } catch (error) {
    console.error('Failed to fetch interviewer profiles:', error);
    return NextResponse.json(
      { error: 'Failed to fetch profiles' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/capacity/interviewers
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      email,
      organizationId,
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
    } = body;

    if (!email || !organizationId) {
      return NextResponse.json(
        { error: 'Missing required fields: email and organizationId' },
        { status: 400 }
      );
    }

    // Check if profile already exists
    const existing = await getInterviewerProfileByEmail(email, organizationId);
    if (existing) {
      return NextResponse.json(
        { error: 'Profile already exists for this email in this organization' },
        { status: 409 }
      );
    }

    const input: InterviewerProfileInput = {
      email,
      organizationId,
      maxInterviewsPerWeek: maxInterviewsPerWeek ?? 10,
      maxInterviewsPerDay: maxInterviewsPerDay ?? 3,
      maxConcurrentPerDay: maxConcurrentPerDay ?? 2,
      bufferMinutes: bufferMinutes ?? 15,
      preferredTimes: preferredTimes ?? {},
      blackoutDates: blackoutDates ?? [],
      interviewTypePreferences: interviewTypePreferences ?? [],
      tags: tags ?? [],
      skillAreas: skillAreas ?? [],
      seniorityLevels: seniorityLevels ?? [],
      isActive: true,
    };

    const profile = await createInterviewerProfile(input);

    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    console.error('Failed to create interviewer profile:', error);
    return NextResponse.json(
      { error: 'Failed to create profile' },
      { status: 500 }
    );
  }
}
