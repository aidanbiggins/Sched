/**
 * API Route: /api/coordinator/preferences
 *
 * GET - Get current user's notification preferences
 * PUT - Update current user's notification preferences
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { v4 as uuidv4 } from 'uuid';
import { authOptions } from '@/lib/auth/authOptions';
import { getActiveOrgId, requireUser, ExtendedSession } from '@/lib/auth/guards';
import {
  getCoordinatorPreferences,
  upsertCoordinatorPreferences,
} from '@/lib/db';
import { CoordinatorNotificationPreferences } from '@/types/scheduling';

// Default preferences for new users
const DEFAULT_PREFERENCES: Omit<CoordinatorNotificationPreferences, 'id' | 'userId' | 'organizationId' | 'createdAt' | 'updatedAt'> = {
  notifyOnBooking: true,
  notifyOnCancel: true,
  notifyOnEscalation: true,
  digestFrequency: 'immediate',
};

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!requireUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const extSession = session as ExtendedSession;
    const userId = extSession.user.id;
    const organizationId = getActiveOrgId(session);

    if (!organizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    // Get existing preferences or return defaults
    const preferences = await getCoordinatorPreferences(userId, organizationId);

    if (preferences) {
      return NextResponse.json({
        preferences: {
          notifyOnBooking: preferences.notifyOnBooking,
          notifyOnCancel: preferences.notifyOnCancel,
          notifyOnEscalation: preferences.notifyOnEscalation,
          digestFrequency: preferences.digestFrequency,
        },
      });
    }

    // Return defaults if no preferences saved
    return NextResponse.json({
      preferences: DEFAULT_PREFERENCES,
    });
  } catch (error) {
    console.error('Error getting coordinator preferences:', error);
    return NextResponse.json(
      { error: 'Failed to get preferences' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!requireUser(session)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const extSession = session as ExtendedSession;
    const userId = extSession.user.id;
    const organizationId = getActiveOrgId(session);

    if (!organizationId) {
      return NextResponse.json(
        { error: 'No active organization' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { notifyOnBooking, notifyOnCancel, notifyOnEscalation, digestFrequency } = body;

    // Validate inputs
    if (
      typeof notifyOnBooking !== 'boolean' ||
      typeof notifyOnCancel !== 'boolean' ||
      typeof notifyOnEscalation !== 'boolean'
    ) {
      return NextResponse.json(
        { error: 'Invalid preference values - booleans required' },
        { status: 400 }
      );
    }

    if (!['immediate', 'daily', 'weekly'].includes(digestFrequency)) {
      return NextResponse.json(
        { error: 'Invalid digestFrequency - must be immediate, daily, or weekly' },
        { status: 400 }
      );
    }

    // Get existing preferences to preserve ID or create new
    const existing = await getCoordinatorPreferences(userId, organizationId);
    const now = new Date();

    const preferencesToSave: CoordinatorNotificationPreferences = {
      id: existing?.id || uuidv4(),
      userId,
      organizationId,
      notifyOnBooking,
      notifyOnCancel,
      notifyOnEscalation,
      digestFrequency,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    const savedPrefs = await upsertCoordinatorPreferences(preferencesToSave);

    return NextResponse.json({
      preferences: {
        notifyOnBooking: savedPrefs.notifyOnBooking,
        notifyOnCancel: savedPrefs.notifyOnCancel,
        notifyOnEscalation: savedPrefs.notifyOnEscalation,
        digestFrequency: savedPrefs.digestFrequency,
      },
      message: 'Preferences updated successfully',
    });
  } catch (error) {
    console.error('Error updating coordinator preferences:', error);
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 }
    );
  }
}
