/**
 * Seed Demo Data API
 *
 * Creates sample scheduling requests for testing.
 * Only available in non-production environments.
 */

import { NextResponse } from 'next/server';
import { createSchedulingRequest } from '@/lib/db';
import type { InterviewType, SchedulingRequest } from '@/types/scheduling';
import { v4 as uuidv4 } from 'uuid';

export async function POST() {
  // Block in production
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }

  try {
    const candidates = [
      { name: 'Sarah Chen', email: 'sarah.chen@example.com', role: 'Senior Software Engineer' },
      { name: 'Marcus Johnson', email: 'marcus.j@example.com', role: 'Product Manager' },
      { name: 'Emily Rodriguez', email: 'emily.r@example.com', role: 'UX Designer' },
      { name: 'James Kim', email: 'james.kim@example.com', role: 'Data Scientist' },
    ];

    const interviewTypes: InterviewType[] = ['phone_screen', 'hm_screen', 'onsite', 'final'];
    const durations = [30, 45, 60];

    const createdRequests = [];

    for (let i = 0; i < 3; i++) {
      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      const interviewType = interviewTypes[Math.floor(Math.random() * interviewTypes.length)];
      const duration = durations[Math.floor(Math.random() * durations.length)];

      const now = new Date();
      const id = uuidv4();
      const windowStart = new Date(now.getTime() + 24 * 60 * 60 * 1000); // Tomorrow
      const windowEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000); // 2 weeks out
      const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 1 week

      const request: SchedulingRequest = {
        id,
        applicationId: `DEMO-${Date.now()}-${i}`,
        candidateName: candidate.name,
        candidateEmail: candidate.email,
        reqId: null,
        reqTitle: candidate.role,
        interviewType,
        durationMinutes: duration,
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'coordinator@company.com',
        calendarProvider: 'microsoft_graph',
        graphTenantId: null,
        windowStart,
        windowEnd,
        candidateTimezone: 'America/New_York',
        publicToken: `demo-${id.slice(0, 8)}`,
        publicTokenHash: `demo-hash-${id.slice(0, 8)}`,
        expiresAt,
        status: 'pending',
        needsAttention: false,
        needsAttentionReason: null,
        createdBy: null,
        createdAt: now,
        updatedAt: now,
      };

      await createSchedulingRequest(request);

      createdRequests.push({
        id: request.id,
        candidateName: candidate.name,
        reqTitle: candidate.role,
      });
    }

    return NextResponse.json({
      message: `Created ${createdRequests.length} demo requests`,
      requests: createdRequests,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to seed data' },
      { status: 500 }
    );
  }
}
