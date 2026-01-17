/**
 * API Route: /api/ops/notifications/[id]/retry
 *
 * POST - Retry a failed notification job
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { getNotificationJobById, updateNotificationJob } from '@/lib/db';

interface RouteParams {
  params: { id: string } | Promise<{ id: string }>;
}

// Superadmin check
function isSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const superadmins = (process.env.SUPERADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase());
  return superadmins.includes(email.toLowerCase());
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Check superadmin
    if (!isSuperadmin(session.user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Handle both sync and async params
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;

    // Get the job
    const job = await getNotificationJobById(id);
    if (!job) {
      return NextResponse.json({ error: 'Notification job not found' }, { status: 404 });
    }

    // Only allow retry for FAILED jobs
    if (job.status !== 'FAILED') {
      return NextResponse.json(
        { error: `Cannot retry job with status: ${job.status}` },
        { status: 400 }
      );
    }

    // Reset job to PENDING with immediate run_after
    const updatedJob = await updateNotificationJob(id, {
      status: 'PENDING',
      runAfter: new Date(),
      lastError: null,
    });

    return NextResponse.json({
      success: true,
      message: 'Notification job queued for retry',
      job: updatedJob
        ? {
            id: updatedJob.id,
            type: updatedJob.type,
            status: updatedJob.status,
            attempts: updatedJob.attempts,
            runAfter: updatedJob.runAfter.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error('Error retrying notification job:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
