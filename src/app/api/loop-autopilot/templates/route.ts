/**
 * API Route: /api/loop-autopilot/templates
 *
 * GET - List loop templates for the organization
 * POST - Create a new loop template (with sessions)
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import {
  getLoopTemplatesByOrg,
  getLoopTemplateWithSessions,
  createLoopTemplate,
  createLoopSessionTemplate,
  seedLoopTemplates,
} from '@/lib/db';
import type { CreateLoopSessionTemplateInput } from '@/types/loop';

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const organizationId = (session.user as { organizationId?: string | null }).organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'No organization selected' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('includeInactive') === 'true';

    // Seed templates if needed (dev only)
    if (process.env.NODE_ENV === 'development') {
      await seedLoopTemplates(organizationId, session.user.email || 'system');
    }

    const templates = await getLoopTemplatesByOrg(organizationId, !includeInactive);

    // Get sessions for each template
    const templatesWithSessions = await Promise.all(
      templates.map(async (t) => {
        const withSessions = await getLoopTemplateWithSessions(t.id);
        return withSessions;
      })
    );

    return NextResponse.json({
      templates: templatesWithSessions.filter(Boolean),
    });
  } catch (error) {
    console.error('Error fetching loop templates:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const organizationId = (session.user as { organizationId?: string | null }).organizationId;
    if (!organizationId) {
      return NextResponse.json({ error: 'No organization selected' }, { status: 400 });
    }

    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    if (!Array.isArray(body.sessions) || body.sessions.length === 0) {
      return NextResponse.json(
        { error: 'At least one session is required' },
        { status: 400 }
      );
    }

    // Validate sessions
    for (let i = 0; i < body.sessions.length; i++) {
      const s = body.sessions[i];
      if (!s.name || typeof s.name !== 'string') {
        return NextResponse.json(
          { error: `Session ${i + 1} must have a name` },
          { status: 400 }
        );
      }
      if (!s.durationMinutes || typeof s.durationMinutes !== 'number' || s.durationMinutes <= 0) {
        return NextResponse.json(
          { error: `Session ${i + 1} must have a valid duration` },
          { status: 400 }
        );
      }
      if (!s.interviewerPool?.emails || !Array.isArray(s.interviewerPool.emails)) {
        return NextResponse.json(
          { error: `Session ${i + 1} must have an interviewer pool` },
          { status: 400 }
        );
      }
    }

    // Create template
    const template = await createLoopTemplate({
      organizationId,
      name: body.name,
      description: body.description,
      createdBy: session.user.email || 'unknown',
    });

    // Create sessions
    for (let i = 0; i < body.sessions.length; i++) {
      const s = body.sessions[i];
      const sessionInput: CreateLoopSessionTemplateInput = {
        loopTemplateId: template.id,
        order: i,
        name: s.name,
        durationMinutes: s.durationMinutes,
        interviewerPool: {
          emails: s.interviewerPool.emails,
          requiredCount: s.interviewerPool.requiredCount || 1,
          preferredTags: s.interviewerPool.preferredTags,
        },
        constraints: s.constraints,
      };
      await createLoopSessionTemplate(sessionInput);
    }

    // Return the complete template with sessions
    const result = await getLoopTemplateWithSessions(template.id);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error('Error creating loop template:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
