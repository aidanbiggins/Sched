/**
 * ICS Calendar File Generator
 *
 * Generates iCalendar (.ics) files and calendar links for interview bookings.
 * Supports:
 * - .ics file content (RFC 5545)
 * - Google Calendar event URLs
 * - Outlook Web event URLs
 */

import { DateTime } from 'luxon';
import { v4 as uuidv4 } from 'uuid';

export interface CalendarEventData {
  title: string;
  description: string;
  location?: string;
  startTime: Date;
  endTime: Date;
  timezone: string;
  organizerEmail: string;
  organizerName?: string;
  attendees?: Array<{
    email: string;
    name?: string;
  }>;
  conferenceUrl?: string | null;
  uid?: string; // Unique identifier for the event
}

/**
 * Format a date for iCalendar (YYYYMMDDTHHMMSSZ format)
 */
function formatIcsDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'UTC' })
    .toFormat("yyyyMMdd'T'HHmmss'Z'");
}

/**
 * Format a date for Google Calendar URL (YYYYMMDDTHHmmssZ format)
 */
function formatGoogleDate(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'UTC' })
    .toFormat("yyyyMMdd'T'HHmmss'Z'");
}

/**
 * Escape text for iCalendar format
 */
function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/**
 * Fold long lines per RFC 5545 (max 75 octets per line)
 */
function foldLine(line: string): string {
  const maxLength = 75;
  if (line.length <= maxLength) return line;

  const result: string[] = [];
  let remaining = line;

  while (remaining.length > maxLength) {
    result.push(remaining.slice(0, maxLength));
    remaining = ' ' + remaining.slice(maxLength);
  }
  result.push(remaining);

  return result.join('\r\n');
}

/**
 * Generate iCalendar (.ics) file content for an interview
 */
export function generateIcsContent(event: CalendarEventData): string {
  const uid = event.uid || `${uuidv4()}@sched.app`;
  const now = new Date();
  const dtstamp = formatIcsDate(now);
  const dtstart = formatIcsDate(event.startTime);
  const dtend = formatIcsDate(event.endTime);

  // Build description with conference link if available
  let description = event.description;
  if (event.conferenceUrl) {
    description += `\\n\\nJoin Video Call: ${event.conferenceUrl}`;
  }

  // Build attendee lines
  const attendeeLines = (event.attendees || [])
    .map((attendee) => {
      const cn = attendee.name ? `;CN=${escapeIcsText(attendee.name)}` : '';
      return `ATTENDEE${cn};RSVP=TRUE:mailto:${attendee.email}`;
    })
    .join('\r\n');

  // Build location (use conference URL if no physical location)
  const location = event.location || event.conferenceUrl || '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sched//Interview Scheduler//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    foldLine(`SUMMARY:${escapeIcsText(event.title)}`),
    foldLine(`DESCRIPTION:${escapeIcsText(description)}`),
    location ? foldLine(`LOCATION:${escapeIcsText(location)}`) : null,
    `ORGANIZER;CN=${escapeIcsText(event.organizerName || 'Scheduler')}:mailto:${event.organizerEmail}`,
    attendeeLines || null,
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Interview reminder',
    'TRIGGER:-PT30M',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return lines.join('\r\n');
}

/**
 * Generate a Google Calendar event URL
 */
export function generateGoogleCalendarUrl(event: CalendarEventData): string {
  const params = new URLSearchParams();

  params.set('action', 'TEMPLATE');
  params.set('text', event.title);

  // Format dates for Google Calendar
  const dates = `${formatGoogleDate(event.startTime)}/${formatGoogleDate(event.endTime)}`;
  params.set('dates', dates);

  // Build details with conference link
  let details = event.description;
  if (event.conferenceUrl) {
    details += `\n\nJoin Video Call: ${event.conferenceUrl}`;
  }
  params.set('details', details);

  // Location
  if (event.location || event.conferenceUrl) {
    params.set('location', event.location || event.conferenceUrl || '');
  }

  // Add attendees if present
  if (event.attendees && event.attendees.length > 0) {
    const emails = event.attendees.map((a) => a.email).join(',');
    params.set('add', emails);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate an Outlook Web event URL
 */
export function generateOutlookCalendarUrl(event: CalendarEventData): string {
  const params = new URLSearchParams();

  params.set('path', '/calendar/action/compose');
  params.set('rru', 'addevent');
  params.set('subject', event.title);

  // Format dates for Outlook (ISO 8601)
  params.set('startdt', event.startTime.toISOString());
  params.set('enddt', event.endTime.toISOString());

  // Build body with conference link
  let body = event.description;
  if (event.conferenceUrl) {
    body += `\n\nJoin Video Call: ${event.conferenceUrl}`;
  }
  params.set('body', body);

  // Location
  if (event.location || event.conferenceUrl) {
    params.set('location', event.location || event.conferenceUrl || '');
  }

  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Generate an Office 365 Outlook event URL
 */
export function generateOffice365CalendarUrl(event: CalendarEventData): string {
  const params = new URLSearchParams();

  params.set('path', '/calendar/action/compose');
  params.set('rru', 'addevent');
  params.set('subject', event.title);

  // Format dates for Outlook (ISO 8601)
  params.set('startdt', event.startTime.toISOString());
  params.set('enddt', event.endTime.toISOString());

  // Build body with conference link
  let body = event.description;
  if (event.conferenceUrl) {
    body += `\n\nJoin Video Call: ${event.conferenceUrl}`;
  }
  params.set('body', body);

  // Location
  if (event.location || event.conferenceUrl) {
    params.set('location', event.location || event.conferenceUrl || '');
  }

  return `https://outlook.office.com/calendar/0/deeplink/compose?${params.toString()}`;
}

/**
 * Generate all calendar links for an event
 */
export interface CalendarLinks {
  googleCalendar: string;
  outlookWeb: string;
  office365: string;
  icsContent: string;
  icsDataUri: string;
}

export function generateCalendarLinks(event: CalendarEventData): CalendarLinks {
  const icsContent = generateIcsContent(event);
  const icsBase64 = Buffer.from(icsContent).toString('base64');

  return {
    googleCalendar: generateGoogleCalendarUrl(event),
    outlookWeb: generateOutlookCalendarUrl(event),
    office365: generateOffice365CalendarUrl(event),
    icsContent,
    icsDataUri: `data:text/calendar;base64,${icsBase64}`,
  };
}

/**
 * Helper to create event data from a booking
 */
export function createInterviewEventData(params: {
  candidateName: string;
  reqTitle: string;
  interviewType: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  candidateTimezone: string;
  organizerEmail: string;
  interviewerEmails: string[];
  conferenceJoinUrl?: string | null;
  organizationName?: string;
}): CalendarEventData {
  const {
    candidateName,
    reqTitle,
    interviewType,
    scheduledStart,
    scheduledEnd,
    candidateTimezone,
    organizerEmail,
    interviewerEmails,
    conferenceJoinUrl,
    organizationName,
  } = params;

  const interviewTypeLabel = formatInterviewType(interviewType);
  const orgName = organizationName || 'Sched';

  return {
    title: `${interviewTypeLabel} - ${reqTitle} with ${candidateName}`,
    description: `Interview Details:\n\nPosition: ${reqTitle}\nType: ${interviewTypeLabel}\nCandidate: ${candidateName}\n\nPlease be prepared and join on time.`,
    startTime: scheduledStart,
    endTime: scheduledEnd,
    timezone: candidateTimezone,
    organizerEmail,
    organizerName: orgName,
    attendees: interviewerEmails.map((email) => ({ email })),
    conferenceUrl: conferenceJoinUrl,
  };
}

/**
 * Helper to format interview type for display
 */
function formatInterviewType(type: string): string {
  const typeMap: Record<string, string> = {
    phone_screen: 'Phone Screen',
    hm_screen: 'Hiring Manager Screen',
    onsite: 'Onsite Interview',
    final: 'Final Interview',
  };
  return typeMap[type] || type;
}
