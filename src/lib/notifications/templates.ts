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
  NudgeReminderPayload,
  EscalationPayload,
  CoordinatorBookingPayload,
  InterviewerNotificationPayload,
} from '@/types/scheduling';
import {
  generateGoogleCalendarUrl,
  generateOutlookCalendarUrl,
  CalendarEventData,
} from './icsGenerator';

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

/**
 * Generate calendar action buttons (Add to Google Calendar, Add to Outlook)
 */
function calendarButtons(event: CalendarEventData): string {
  const googleUrl = generateGoogleCalendarUrl(event);
  const outlookUrl = generateOutlookCalendarUrl(event);

  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin: 16px 0;">
  <tr>
    <td>
      <p style="color: ${STYLES.mutedColor}; font-size: 14px; margin: 0 0 12px 0;">
        <strong>Add to your calendar:</strong>
      </p>
      <table role="presentation" cellspacing="0" cellpadding="0">
        <tr>
          <td style="padding-right: 12px;">
            <a href="${googleUrl}" target="_blank" style="display: inline-block; background-color: #ffffff; color: ${STYLES.textColor}; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 500; font-size: 14px; border: 1px solid #e2e8f0;">
              📅 Google Calendar
            </a>
          </td>
          <td>
            <a href="${outlookUrl}" target="_blank" style="display: inline-block; background-color: #ffffff; color: ${STYLES.textColor}; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 500; font-size: 14px; border: 1px solid #e2e8f0;">
              📅 Outlook
            </a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`.trim();
}

/**
 * Generate calendar links text for plain text emails
 */
function calendarLinksText(event: CalendarEventData): string {
  const googleUrl = generateGoogleCalendarUrl(event);
  const outlookUrl = generateOutlookCalendarUrl(event);

  return `
Add to your calendar:
- Google Calendar: ${googleUrl}
- Outlook: ${outlookUrl}
`.trim();
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
    candidateEmail,
    candidateTimezone,
    reqTitle,
    interviewType,
    durationMinutes,
    scheduledStartUtc,
    scheduledEndUtc,
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

  // Generate calendar event data for add-to-calendar links
  const calendarEvent: CalendarEventData = {
    title: `${formatInterviewType(interviewType)} - ${reqTitle}`,
    description: `Interview for ${reqTitle} position.\n\nCandidate: ${candidateName}`,
    startTime: new Date(scheduledStartUtc),
    endTime: new Date(scheduledEndUtc),
    timezone: candidateTimezone,
    organizerEmail: interviewerEmails[0] || 'noreply@sched.app',
    organizerName: orgName,
    attendees: [{ email: candidateEmail, name: candidateName }],
    conferenceUrl: conferenceJoinUrl,
  };

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
    ${calendarButtons(calendarEvent)}
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

${calendarLinksText(calendarEvent)}

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
    candidateEmail,
    reqTitle,
    interviewType,
    durationMinutes,
    oldStartUtc,
    newStartUtc,
    newEndUtc,
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

  // Generate calendar event data for add-to-calendar links
  const calendarEvent: CalendarEventData = {
    title: `${formatInterviewType(interviewType)} - ${reqTitle}`,
    description: `Interview for ${reqTitle} position.\n\nCandidate: ${candidateName}\n\nThis is a rescheduled interview.`,
    startTime: new Date(newStartUtc),
    endTime: new Date(newEndUtc),
    timezone: candidateTimezone,
    organizerEmail: 'noreply@sched.app',
    organizerName: orgName,
    attendees: [{ email: candidateEmail, name: candidateName }],
    conferenceUrl: conferenceJoinUrl,
  };

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
    ${calendarButtons(calendarEvent)}
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

${calendarLinksText(calendarEvent)}

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
    candidateEmail,
    candidateTimezone,
    reqTitle,
    interviewType,
    durationMinutes,
    scheduledStartUtc,
    scheduledEndUtc,
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

  // Generate calendar event for "Add to Calendar" links (useful if candidate hasn't added yet)
  const calendarEvent: CalendarEventData = {
    title: `${formatInterviewType(interviewType)} - ${reqTitle}`,
    description: `Interview for ${reqTitle} position.\n\nCandidate: ${candidateName}`,
    startTime: new Date(scheduledStartUtc),
    endTime: new Date(scheduledEndUtc),
    timezone: candidateTimezone,
    organizerEmail: 'noreply@sched.app',
    organizerName: orgName,
    attendees: [{ email: candidateEmail, name: candidateName }],
    conferenceUrl: conferenceJoinUrl,
  };

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
    ${calendarButtons(calendarEvent)}
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

${calendarLinksText(calendarEvent)}

Please make sure you're in a quiet place with a stable internet connection. Good luck!

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Nudge Reminder (Candidate hasn't responded)
// ============================================

export function nudgeReminderTemplate(payload: NudgeReminderPayload): EmailTemplate {
  const {
    candidateName,
    reqTitle,
    interviewType,
    durationMinutes,
    publicLink,
    requestType,
    daysSinceRequest,
    isUrgent,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;
  const action = requestType === 'availability' ? 'provide your availability' : 'schedule your interview';
  const urgentPrefix = isUrgent ? 'Urgent: ' : '';

  const subject = `${urgentPrefix}${orgName}: Reminder to ${action} for ${reqTitle}`;

  const urgentBanner = isUrgent
    ? `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef3c7; border-radius: 6px; padding: 12px; margin: 0 0 16px 0; border-left: 4px solid #f59e0b;">
      <tr>
        <td style="color: #92400e; font-size: 14px; font-weight: 600;">
          Action Required: This link will expire soon
        </td>
      </tr>
    </table>
    `
    : '';

  const html = wrapHtml(`
    ${urgentBanner}
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Hi ${candidateName},
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We noticed you haven't yet ${action === 'provide your availability' ? 'provided your availability' : 'scheduled your interview'} for the <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position.
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      We sent our initial request ${daysSinceRequest} day${daysSinceRequest !== 1 ? 's' : ''} ago. The interview will be approximately <strong>${durationMinutes} minutes</strong>.
    </p>
    ${ctaButton(requestType === 'availability' ? 'Provide Your Availability' : 'Schedule Your Interview', publicLink)}
    <p style="color: ${STYLES.mutedColor}; font-size: 14px; margin: 24px 0 0 0;">
      If you're no longer interested in this position or have any questions, please let us know.
    </p>
  `);

  const text = `
${isUrgent ? 'URGENT: Action Required - This link will expire soon\n\n' : ''}Hi ${candidateName},

We noticed you haven't yet ${action === 'provide your availability' ? 'provided your availability' : 'scheduled your interview'} for the ${formatInterviewType(interviewType)} for the ${reqTitle} position.

We sent our initial request ${daysSinceRequest} day${daysSinceRequest !== 1 ? 's' : ''} ago. The interview will be approximately ${durationMinutes} minutes.

${requestType === 'availability' ? 'Provide your availability' : 'Schedule your interview'}: ${publicLink}

If you're no longer interested in this position or have any questions, please let us know.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Escalation - No Response (To Coordinator)
// ============================================

export function escalationNoResponseTemplate(payload: EscalationPayload): EmailTemplate {
  const {
    coordinatorName,
    candidateName,
    candidateEmail,
    reqTitle,
    interviewType,
    requestType,
    daysSinceRequest,
    publicLink,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;
  const requestTypeLabel = requestType === 'availability' ? 'availability request' : 'booking link';

  const subject = `${orgName}: No response from ${candidateName} - ${reqTitle} (${daysSinceRequest} days)`;

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Candidate Not Responding
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${coordinatorName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      <strong>${candidateName}</strong> has not responded to the ${requestTypeLabel} for the <strong>${formatInterviewType(interviewType)}</strong> for <strong>${reqTitle}</strong>.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef2f2; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid #ef4444;">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <strong>Candidate:</strong> ${candidateName} (${candidateEmail})<br>
          <strong>Request Sent:</strong> ${daysSinceRequest} days ago<br>
          <strong>Request Type:</strong> ${requestTypeLabel}
        </td>
      </tr>
    </table>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 16px 0;">
      <strong>Recommended Actions:</strong>
    </p>
    <ul style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8; margin: 0 0 16px 0; padding-left: 24px;">
      <li>Reach out to the candidate directly via phone or alternate email</li>
      <li>Check if the candidate is still interested in the position</li>
      <li>Resend the scheduling link if needed</li>
    </ul>
    ${ctaButton('View Request Details', publicLink)}
  `);

  const text = `
Candidate Not Responding

Hi ${coordinatorName},

${candidateName} has not responded to the ${requestTypeLabel} for the ${formatInterviewType(interviewType)} for ${reqTitle}.

Candidate: ${candidateName} (${candidateEmail})
Request Sent: ${daysSinceRequest} days ago
Request Type: ${requestTypeLabel}

Recommended Actions:
- Reach out to the candidate directly via phone or alternate email
- Check if the candidate is still interested in the position
- Resend the scheduling link if needed

View Request Details: ${publicLink}

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Escalation - Request Expired (To Coordinator)
// ============================================

export function escalationExpiredTemplate(payload: EscalationPayload): EmailTemplate {
  const {
    coordinatorName,
    candidateName,
    candidateEmail,
    reqTitle,
    interviewType,
    requestType,
    daysSinceRequest,
    publicLink,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;
  const requestTypeLabel = requestType === 'availability' ? 'availability request' : 'booking link';

  const subject = `${orgName}: Request expired - ${candidateName} - ${reqTitle}`;

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Scheduling Request Expired
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${coordinatorName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      The ${requestTypeLabel} for <strong>${candidateName}</strong> for the <strong>${formatInterviewType(interviewType)}</strong> for <strong>${reqTitle}</strong> has expired without a response.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${STYLES.backgroundColor}; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <strong>Candidate:</strong> ${candidateName} (${candidateEmail})<br>
          <strong>Request Sent:</strong> ${daysSinceRequest} days ago<br>
          <strong>Status:</strong> <span style="color: #ef4444; font-weight: 600;">Expired</span>
        </td>
      </tr>
    </table>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 16px 0;">
      If you'd like to reschedule with this candidate, you'll need to create a new scheduling request.
    </p>
    ${ctaButton('View Request Details', publicLink)}
  `);

  const text = `
Scheduling Request Expired

Hi ${coordinatorName},

The ${requestTypeLabel} for ${candidateName} for the ${formatInterviewType(interviewType)} for ${reqTitle} has expired without a response.

Candidate: ${candidateName} (${candidateEmail})
Request Sent: ${daysSinceRequest} days ago
Status: Expired

If you'd like to reschedule with this candidate, you'll need to create a new scheduling request.

View Request Details: ${publicLink}

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Coordinator Booking Notification
// ============================================

export function coordinatorBookingTemplate(payload: CoordinatorBookingPayload): EmailTemplate {
  const {
    coordinatorName,
    candidateName,
    candidateEmail,
    reqTitle,
    interviewType,
    scheduledStartLocal,
    conferenceJoinUrl,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;

  const subject = `${orgName}: ${candidateName} has scheduled their ${reqTitle} interview`;

  const meetingInfo = conferenceJoinUrl
    ? `<br><strong>Meeting Link:</strong> <a href="${conferenceJoinUrl}" style="color: ${STYLES.primaryColor};">${conferenceJoinUrl}</a>`
    : '';

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Interview Scheduled
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${coordinatorName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      <strong>${candidateName}</strong> has scheduled their <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #ecfdf5; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid #10b981;">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <strong>Candidate:</strong> ${candidateName} (${candidateEmail})<br>
          <strong>Scheduled Time:</strong> ${scheduledStartLocal}${meetingInfo}
        </td>
      </tr>
    </table>
    <p style="color: ${STYLES.mutedColor}; font-size: 14px; margin: 24px 0 0 0;">
      Calendar invites have been sent to all participants.
    </p>
  `);

  const text = `
Interview Scheduled

Hi ${coordinatorName},

${candidateName} has scheduled their ${formatInterviewType(interviewType)} for the ${reqTitle} position.

Candidate: ${candidateName} (${candidateEmail})
Scheduled Time: ${scheduledStartLocal}
${conferenceJoinUrl ? `Meeting Link: ${conferenceJoinUrl}` : ''}

Calendar invites have been sent to all participants.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Coordinator Cancel Notification
// ============================================

export function coordinatorCancelTemplate(payload: CoordinatorBookingPayload & { reason?: string }): EmailTemplate {
  const {
    coordinatorName,
    candidateName,
    candidateEmail,
    reqTitle,
    interviewType,
    scheduledStartLocal,
    reason,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;

  const subject = `${orgName}: ${candidateName} has cancelled their ${reqTitle} interview`;

  const reasonSection = reason
    ? `<br><strong>Reason:</strong> ${reason}`
    : '';

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Interview Cancelled
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${coordinatorName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      <strong>${candidateName}</strong> has cancelled their <strong>${formatInterviewType(interviewType)}</strong> for the <strong>${reqTitle}</strong> position.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #fef2f2; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid #ef4444;">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <strong>Candidate:</strong> ${candidateName} (${candidateEmail})<br>
          <strong>Originally Scheduled:</strong> ${scheduledStartLocal}${reasonSection}
        </td>
      </tr>
    </table>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 16px 0 0 0;">
      You may want to reach out to the candidate to reschedule or discuss next steps.
    </p>
  `);

  const text = `
Interview Cancelled

Hi ${coordinatorName},

${candidateName} has cancelled their ${formatInterviewType(interviewType)} for the ${reqTitle} position.

Candidate: ${candidateName} (${candidateEmail})
Originally Scheduled: ${scheduledStartLocal}
${reason ? `Reason: ${reason}` : ''}

You may want to reach out to the candidate to reschedule or discuss next steps.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Interviewer Notification
// ============================================

export function interviewerNotificationTemplate(payload: InterviewerNotificationPayload): EmailTemplate {
  const {
    interviewerName,
    candidateName,
    reqTitle,
    interviewType,
    scheduledStartLocal,
    conferenceJoinUrl,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;

  const subject = `${orgName}: Interview scheduled with ${candidateName} - ${reqTitle}`;

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
      Interview Scheduled
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${interviewerName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      You have been scheduled for a <strong>${formatInterviewType(interviewType)}</strong> with <strong>${candidateName}</strong> for the <strong>${reqTitle}</strong> position.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: ${STYLES.backgroundColor}; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <strong>Candidate:</strong> ${candidateName}<br>
          <strong>Date & Time:</strong> ${scheduledStartLocal}
        </td>
      </tr>
    </table>
    ${meetingSection}
    <p style="color: ${STYLES.mutedColor}; font-size: 14px; margin: 24px 0 0 0;">
      A calendar invite has been sent separately.
    </p>
  `);

  const text = `
Interview Scheduled

Hi ${interviewerName},

You have been scheduled for a ${formatInterviewType(interviewType)} with ${candidateName} for the ${reqTitle} position.

Candidate: ${candidateName}
Date & Time: ${scheduledStartLocal}
${conferenceJoinUrl ? `Video Conference Link: ${conferenceJoinUrl}` : ''}

A calendar invite has been sent separately.

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}

// ============================================
// Template: Interviewer Reminder
// ============================================

export function interviewerReminderTemplate(payload: InterviewerNotificationPayload & { hoursUntil: number }): EmailTemplate {
  const {
    interviewerName,
    candidateName,
    reqTitle,
    interviewType,
    scheduledStartLocal,
    conferenceJoinUrl,
    hoursUntil,
    organizationName,
  } = payload;

  const orgName = organizationName || APP_NAME;
  const timeDescription = hoursUntil === 24 ? 'tomorrow' : 'in 2 hours';

  const subject = `${orgName}: Reminder - Interview with ${candidateName} is ${timeDescription}`;

  const meetingSection = conferenceJoinUrl
    ? `${ctaButton('Join Video Call', conferenceJoinUrl)}`
    : '';

  const html = wrapHtml(`
    <h1 style="color: ${STYLES.textColor}; font-size: 24px; margin: 0 0 24px 0;">
      Interview Reminder
    </h1>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      Hi ${interviewerName},
    </p>
    <p style="color: ${STYLES.textColor}; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
      This is a friendly reminder that your <strong>${formatInterviewType(interviewType)}</strong> with <strong>${candidateName}</strong> for the <strong>${reqTitle}</strong> position is ${timeDescription}.
    </p>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #eff6ff; border-radius: 6px; padding: 16px; margin: 16px 0; border-left: 4px solid ${STYLES.primaryColor};">
      <tr>
        <td style="color: ${STYLES.textColor}; font-size: 14px; line-height: 1.8;">
          <strong>Candidate:</strong> ${candidateName}<br>
          <strong>Date & Time:</strong> ${scheduledStartLocal}
        </td>
      </tr>
    </table>
    ${meetingSection}
  `);

  const text = `
Interview Reminder

Hi ${interviewerName},

This is a friendly reminder that your ${formatInterviewType(interviewType)} with ${candidateName} for the ${reqTitle} position is ${timeDescription}.

Candidate: ${candidateName}
Date & Time: ${scheduledStartLocal}
${conferenceJoinUrl ? `Join Video Call: ${conferenceJoinUrl}` : ''}

---
To unsubscribe from these emails, visit: ${APP_URL}/unsubscribe
`.trim();

  return { subject, html, text };
}
