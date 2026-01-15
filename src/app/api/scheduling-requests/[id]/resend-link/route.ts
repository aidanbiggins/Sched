/**
 * API Route: /api/scheduling-requests/[id]/resend-link
 *
 * POST - Resend or copy scheduling link for a pending request
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSchedulingRequestById } from '@/lib/db';

interface RouteParams {
  params: { id: string } | Promise<{ id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    // Handle both sync and async params (Next.js version differences)
    const resolvedParams = params instanceof Promise ? await params : params;
    const { id } = resolvedParams;

    const schedulingRequest = await getSchedulingRequestById(id);
    if (!schedulingRequest) {
      return NextResponse.json(
        { error: 'Scheduling request not found' },
        { status: 404 }
      );
    }

    // Can only resend link for pending requests
    if (schedulingRequest.status !== 'pending') {
      return NextResponse.json(
        {
          error: 'Cannot resend link',
          message: `Request is ${schedulingRequest.status}. Links can only be sent for pending requests.`,
          code: 'INVALID_STATUS',
        },
        { status: 400 }
      );
    }

    // Check if link has expired
    if (new Date() > schedulingRequest.expiresAt) {
      return NextResponse.json(
        {
          error: 'Link has expired',
          message: 'This scheduling link has expired. Please create a new request.',
          code: 'LINK_EXPIRED',
        },
        { status: 410 }
      );
    }

    // Build the public scheduling link
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const publicLink = `${baseUrl}/book/${schedulingRequest.publicToken}`;

    // Get optional body for email preference
    let body: { sendEmail?: boolean } = {};
    try {
      body = await request.json();
    } catch {
      // Empty body is OK
    }

    // Check if SMTP is configured
    const smtpConfigured = Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT);

    if (body.sendEmail && smtpConfigured) {
      // TODO: Send email via configured SMTP
      // For now, return the email content for manual sending
      return NextResponse.json({
        success: true,
        method: 'email_pending',
        message: 'Email sending not yet implemented. Use the link or email content below.',
        link: publicLink,
        emailContent: {
          to: schedulingRequest.candidateEmail,
          subject: `Schedule Your Interview - ${schedulingRequest.reqTitle}`,
          body: buildEmailBody(schedulingRequest, publicLink),
        },
        expiresAt: schedulingRequest.expiresAt.toISOString(),
      });
    }

    // Return link and email content for manual copy
    return NextResponse.json({
      success: true,
      method: 'copy',
      message: smtpConfigured
        ? 'Link ready. Set sendEmail: true to send via email.'
        : 'SMTP not configured. Copy the link or email content to send manually.',
      link: publicLink,
      emailContent: {
        to: schedulingRequest.candidateEmail,
        subject: `Schedule Your Interview - ${schedulingRequest.reqTitle}`,
        body: buildEmailBody(schedulingRequest, publicLink),
      },
      expiresAt: schedulingRequest.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('Error resending link:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

function buildEmailBody(
  request: {
    candidateName: string;
    reqTitle: string;
    durationMinutes: number;
    expiresAt: Date;
  },
  link: string
): string {
  const expiryDate = request.expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return `Hi ${request.candidateName},

We're excited to move forward with your application for ${request.reqTitle}!

Please use the link below to select a time for your ${request.durationMinutes}-minute interview:

${link}

This link will expire on ${expiryDate}.

If you have any questions, please reply to this email.

Best regards,
The Recruiting Team`;
}
