/**
 * Email Templates
 *
 * Templates for all notification types.
 * Each template includes:
 * - HTML version with CTA button
 * - Plain text version with fallback link
 * - Unsubscribe link in footer
 */

import { DateTime } from 'luxon';
import {
  AvailabilityRequestPayload,
  SelfScheduleLinkPayload,
  BookingConfirmationPayload,
  RescheduleConfirmationPayload,
  CancelNoticePayload,
  ReminderPayload,
} from '@/types/scheduling';

// ============================================
// Template Types
// ============================================

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

// ============================================
// Common Styles and Components
// ============================================

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Sched';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || 'support@sched.local';

const STYLES = {
  primaryColor: '#2563eb',
  secondaryColor: '#64748b',
  backgroundColor: '#f8fafc',
  cardBackground: '#ffffff',
  textColor: '#1e293b',
  mutedColor: '#64748b',
};

function wrapHtml(content: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${STYLES.backgroundColor};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <tr>
      <td style="background-color: ${STYLES.cardBackground}; border-radius: 8px; padding: 32px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
        ${content}
      </td>
    </tr>
    <tr>
      <td style="padding: 20px; text-align: center; color: ${STYLES.mutedColor}; font-size: 12px;">
        <p style="margin: 0 0 8px 0;">
          This email was sent by ${APP_NAME}.
        </p>
        <p style="margin: 0;">
          <a href="${APP_URL}/unsubscribe" style="color: ${STYLES.mutedColor}; text-decoration: underline;">Unsubscribe</a>
          &nbsp;|&nbsp;
          <a href="mailto:${SUPPORT_EMAIL}" style="color: ${STYLES.mutedColor}; text-decoration: underline;">Contact Support</a>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();
}

function ctaButton(text: string, url: string): string {
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0">
  <tr>
    <td style="padding: 24px 0;">
      <a href="${url}" style="display: inline-block; background-color: ${STYLES.primaryColor}; color: #ffffff; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: 600; font-size: 16px;">
        ${text}
      </a>
    </td>
  </tr>
  <tr>
    <td style="color: ${STYLES.mutedColor}; font-size: 13px;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${url}" style="color: ${STYLES.primaryColor}; word-break: break-all;">${url}</a>
    </td>
  </tr>
</table>
`.trim();
}

function formatLocalTime(utcTime: string, timezone: string): string {
  const dt = DateTime.fromISO(utcTime, { zone: 'UTC' }).setZone(timezone);
  return dt.toFormat("EEEE, MMMM d, yyyy 'at' h:mm a ZZZZ");
}

function formatInterviewType(type: string): string {
  const typeMap: Record<string, string> = {
    phone_screen: 'Phone Screen',
    hm_screen: 'Hiring Manager Screen',
    onsite: 'Onsite Interview',
    final: 'Final Interview',
  };
  return typeMap[type] || type;
}

// ============================================
// Template: Candidate Availability Request
// ============================================

export function candidateAvailabilityRequestTemplate(
  payload: AvailabilityRequestPayload
): EmailTemplate {
  const {
    candidateName,
    reqTitle,
    interviewType,
    durationMinutes,
    publicLink,
    expiresAt,
    windowStart,
    windowEnd,
    candidateTimezone,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;
  const formattedExpiry = formatLocalTime(expiresAt, candidateTimezone);
  const formattedWindowStart = formatLocalTime(windowStart, candidateTimezone);
  const formattedWindowEnd = formatLocalTime(windowEnd, candidateTimezone);

  const subject = `${orgName}: Please provide your availability for ${reqTitle}`;

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Hi ${candidateName},
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We'd like to schedule your <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position.
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Please use the link below to provide your available times. The interview will be approximately <strong>${durationMinutes} minutes</strong>.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${STYLES.backgroundColor}; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <tr>
        <td style="color: ${STYLES.mutedColor}; font-size: 14px;">
          <strong>Availability Window:</strong><br>
          ${formattedWindowStart} through ${formattedWindowEnd}
        </td>
      </tr>
    </table>
    ${ctaButton('Provide Your Availability', publicLink)}
    <p style="color: ${STYLES.mutedColor}; font-size: 14px; margin: 24px 0 0 0;">
      This link expires on ${formattedExpiry}.
    </p>
  `);

  const text = `
Hi ${candidateName},

We'd like to schedule your ${formatInterviewType(interviewType)} for the ${reqTitle} position.

Please provide your available times using this link:
${publicLink}

The interview will be approximately ${durationMinutes} minutes.

Availability Window:
${formattedWindowStart} through ${formattedWindowEnd}

This link expires on ${formattedExpiry}.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Candidate Self-Schedule Link
// ============================================

export function candidateSelfScheduleLinkTemplate(
  payload: SelfScheduleLinkPayload
): EmailTemplate {
  const {
    candidateName,
    reqTitle,
    interviewType,
    durationMinutes,
    publicLink,
    expiresAt,
    candidateTimezone,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;
  const formattedExpiry = formatLocalTime(expiresAt, candidateTimezone);

  const subject = `${orgName}: Schedule your ${reqTitle} interview`;

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Hi ${candidateName},
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Great news! We're ready to schedule your <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position.
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Click the button below to choose a time that works best for you. The interview will be approximately <strong>${durationMinutes} minutes</strong>.
    </p>
    ${ctaButton('Schedule Your Interview', publicLink)}
    <p style="color: ${STYLES.mutedColor}; font-size: 14px; margin: 24px 0 0 0;">
      This link expires on ${formattedExpiry}.
    </p>
  `);

  const text = `
Hi ${candidateName},

Great news! We're ready to schedule your ${formatInterviewType(interviewType)} for the ${reqTitle} position.

Click the link below to choose a time that works best for you:
${publicLink}

The interview will be approximately ${durationMinutes} minutes.

This link expires on ${formattedExpiry}.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Booking Confirmation
// ============================================

export function bookingConfirmationTemplate(
  payload: BookingConfirmationPayload
): EmailTemplate {
  const {
    candidateName,
    reqTitle,
    interviewType,
    durationMinutes,
    scheduledStartLocal,
    conferenceJoinUrl,
    interviewerEmails,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;

  const subject = `${orgName}: Your ${reqTitle} interview is confirmed`;

  const interviewerList = interviewerEmails.length > 0
    ? interviewerEmails.join(', ')
    : 'To be confirmed';

  const meetingSection = conferenceJoinUrl
    ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ecfdf5; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid #10b981;">
      <tr>
        <td>
          <strong style="color: #059669;">Video Conference Link:</strong><br>
          <a href="${conferenceJoinUrl}" style="color: ${STYLES.primaryColor}; word-break: break-all;">${conferenceJoinUrl}</a>
        </td>
      </tr>
    </table>
    `
    : '';

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Interview Confirmed!
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${candidateName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Your <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position has been scheduled.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${STYLES.backgroundColor}; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <strong>Date & Time:</strong> ${scheduledStartLocal}<br>
          <strong>Duration:</strong> ${durationMinutes} minutes<br>
          <strong>Interviewers:</strong> ${interviewerList}
        </td>
      </tr>
    </table>
    ${meetingSection}
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 24px 0 0 0;">
      A calendar invite has been sent separately. If you need to reschedule, please contact us as soon as possible.
    </p>
  `);

  const text = `
Interview Confirmed!

Hi ${candidateName},

Your ${formatInterviewType(interviewType)} for the ${reqTitle} position has been scheduled.

Date & Time: ${scheduledStartLocal}
Duration: ${durationMinutes} minutes
Interviewers: ${interviewerList}
${conferenceJoinUrl ? `\nVideo Conference Link: ${conferenceJoinUrl}` : ''}

A calendar invite has been sent separately. If you need to reschedule, please contact us as soon as possible.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Reschedule Confirmation
// ============================================

export function rescheduleConfirmationTemplate(
  payload: RescheduleConfirmationPayload
): EmailTemplate {
  const {
    candidateName,
    reqTitle,
    interviewType,
    durationMinutes,
    oldStartUtc,
    newStartLocal,
    conferenceJoinUrl,
    reason,
    candidateTimezone,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;
  const oldTimeFormatted = formatLocalTime(oldStartUtc, candidateTimezone);

  const subject = `${orgName}: Your ${reqTitle} interview has been rescheduled`;

  const reasonSection = reason
    ? `<p style="color: ${STYLES.mutedColor}; font-size: 14px; margin: 16px 0;"><strong>Reason:</strong> ${reason}</p>`
    : '';

  const meetingSection = conferenceJoinUrl
    ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ecfdf5; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid #10b981;">
      <tr>
        <td>
          <strong style="color: #059669;">Video Conference Link (unchanged):</strong><br>
          <a href="${conferenceJoinUrl}" style="color: ${STYLES.primaryColor}; word-break: break-all;">${conferenceJoinUrl}</a>
        </td>
      </tr>
    </table>
    `
    : '';

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Interview Rescheduled
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${candidateName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Your <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position has been rescheduled.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${STYLES.backgroundColor}; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <span style="text-decoration: line-through; color: ${STYLES.mutedColor};">Original: ${oldTimeFormatted}</span><br>
          <strong style="color: #059669;">New Time: ${newStartLocal}</strong><br>
          <strong>Duration:</strong> ${durationMinutes} minutes
        </td>
      </tr>
    </table>
    ${reasonSection}
    ${meetingSection}
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 24px 0 0 0;">
      An updated calendar invite has been sent. If you have any questions, please don't hesitate to reach out.
    </p>
  `);

  const text = `
Interview Rescheduled

Hi ${candidateName},

Your ${formatInterviewType(interviewType)} for the ${reqTitle} position has been rescheduled.

Original: ${oldTimeFormatted}
New Time: ${newStartLocal}
Duration: ${durationMinutes} minutes
${reason ? `\nReason: ${reason}` : ''}
${conferenceJoinUrl ? `\nVideo Conference Link (unchanged): ${conferenceJoinUrl}` : ''}

An updated calendar invite has been sent. If you have any questions, please don't hesitate to reach out.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Cancel Notice
// ============================================

export function cancelNoticeTemplate(payload: CancelNoticePayload): EmailTemplate {
  const {
    candidateName,
    reqTitle,
    interviewType,
    reason,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;

  const subject = `${orgName}: Your ${reqTitle} interview has been cancelled`;

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Interview Cancelled
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${candidateName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We regret to inform you that your <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position has been cancelled.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef2f2; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid #ef4444;">
      <tr>
        <td style="color: #991b1b; font-size: 14px;">
          <strong>Reason:</strong> ${reason}
        </td>
      </tr>
    </table>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 24px 0 0 0;">
      If you have any questions or would like to discuss next steps, please don't hesitate to contact us.
    </p>
  `);

  const text = `
Interview Cancelled

Hi ${candidateName},

We regret to inform you that your ${formatInterviewType(interviewType)} for the ${reqTitle} position has been cancelled.

Reason: ${reason}

If you have any questions or would like to discuss next steps, please don't hesitate to contact us.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Reminder (24h and 2h)
// ============================================

export function reminderTemplate(payload: ReminderPayload): EmailTemplate {
  const {
    candidateName,
    reqTitle,
    interviewType,
    durationMinutes,
    scheduledStartLocal,
    conferenceJoinUrl,
    hoursUntil,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;
  const timeDescription = hoursUntil === 24 ? 'tomorrow' : 'in 2 hours';

  const subject = `${orgName}: Reminder - Your ${reqTitle} interview is ${timeDescription}`;

  const meetingSection = conferenceJoinUrl
    ? `
    ${ctaButton('Join Video Call', conferenceJoinUrl)}
    `
    : '';

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Interview Reminder
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${candidateName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      This is a friendly reminder that your <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position is ${timeDescription}.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid ${STYLES.primaryColor};">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <strong>Date & Time:</strong> ${scheduledStartLocal}<br>
          <strong>Duration:</strong> ${durationMinutes} minutes
        </td>
      </tr>
    </table>
    ${meetingSection}
    <p style="color: ${STYLES.mutedColor}; font-size: 14px; margin: 24px 0 0 0;">
      Please make sure you're in a quiet place with a stable internet connection. Good luck!
    </p>
  `);

  const text = `
Interview Reminder

Hi ${candidateName},

This is a friendly reminder that your ${formatInterviewType(interviewType)} for the ${reqTitle} position is ${timeDescription}.

Date & Time: ${scheduledStartLocal}
Duration: ${durationMinutes} minutes
${conferenceJoinUrl ? `\nJoin Video Call: ${conferenceJoinUrl}` : ''}

Please make sure you're in a quiet place with a stable internet connection. Good luck!

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}
