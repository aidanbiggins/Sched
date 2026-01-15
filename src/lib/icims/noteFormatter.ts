/**
 * iCIMS Note Formatter
 *
 * Deterministic note templates for iCIMS writeback.
 * All notes include consistent formatting and required identifiers.
 */

export interface LinkCreatedNoteParams {
  schedulingRequestId: string;
  applicationId: string | null;
  publicLink: string;
  interviewerEmails: string[];
  organizerEmail: string;
  interviewType: string;
  durationMinutes: number;
  windowStart: Date;
  windowEnd: Date;
  candidateTimezone: string;
}

export interface BookedNoteParams {
  schedulingRequestId: string;
  bookingId: string;
  applicationId: string | null;
  interviewerEmails: string[];
  organizerEmail: string;
  scheduledStartUtc: Date;
  scheduledEndUtc: Date;
  candidateTimezone: string;
  calendarEventId: string | null;
  joinUrl: string | null;
}

export interface CanceledNoteParams {
  schedulingRequestId: string;
  bookingId: string | null;
  applicationId: string | null;
  interviewerEmails: string[];
  organizerEmail: string;
  reason: string;
  cancelledBy: string;
}

export interface RescheduledNoteParams {
  schedulingRequestId: string;
  bookingId: string;
  applicationId: string | null;
  interviewerEmails: string[];
  organizerEmail: string;
  oldStartUtc: Date;
  oldEndUtc: Date;
  newStartUtc: Date;
  newEndUtc: Date;
  candidateTimezone: string;
  calendarEventId: string | null;
  reason: string | null;
}

/**
 * Format date in UTC ISO format
 */
function formatUtc(date: Date): string {
  return date.toISOString();
}

/**
 * Format date in candidate's timezone
 */
function formatLocal(date: Date, timezone: string): string {
  return date.toLocaleString('en-US', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    timeZoneName: 'short',
  });
}

/**
 * Format interviewer emails as comma-separated list
 */
function formatInterviewers(emails: string[]): string {
  return emails.join(', ');
}

/**
 * Format note for scheduling link creation
 */
export function formatLinkCreatedNote(params: LinkCreatedNoteParams): string {
  const lines = [
    '=== SCHEDULING LINK CREATED ===',
    '',
    `Scheduling Request ID: ${params.schedulingRequestId}`,
    `Application ID: ${params.applicationId || 'N/A'}`,
    '',
    `Public Link: ${params.publicLink}`,
    '',
    `Interview Type: ${params.interviewType}`,
    `Duration: ${params.durationMinutes} minutes`,
    '',
    `Interviewer(s): ${formatInterviewers(params.interviewerEmails)}`,
    `Organizer: ${params.organizerEmail}`,
    '',
    `Available Window:`,
    `  Start: ${formatUtc(params.windowStart)} (UTC)`,
    `  End: ${formatUtc(params.windowEnd)} (UTC)`,
    `  Candidate Timezone: ${params.candidateTimezone}`,
    '',
    '================================',
  ];

  return lines.join('\n');
}

/**
 * Format note for successful booking
 */
export function formatBookedNote(params: BookedNoteParams): string {
  const lines = [
    '=== INTERVIEW BOOKED ===',
    '',
    `Scheduling Request ID: ${params.schedulingRequestId}`,
    `Booking ID: ${params.bookingId}`,
    `Application ID: ${params.applicationId || 'N/A'}`,
    '',
    `Scheduled Time (UTC):`,
    `  Start: ${formatUtc(params.scheduledStartUtc)}`,
    `  End: ${formatUtc(params.scheduledEndUtc)}`,
    '',
    `Scheduled Time (${params.candidateTimezone}):`,
    `  Start: ${formatLocal(params.scheduledStartUtc, params.candidateTimezone)}`,
    `  End: ${formatLocal(params.scheduledEndUtc, params.candidateTimezone)}`,
    '',
    `Interviewer(s): ${formatInterviewers(params.interviewerEmails)}`,
    `Organizer: ${params.organizerEmail}`,
    '',
    `Calendar Event ID: ${params.calendarEventId || 'N/A'}`,
    `Join URL: ${params.joinUrl || 'N/A'}`,
    '',
    '========================',
  ];

  return lines.join('\n');
}

/**
 * Format note for cancellation
 */
export function formatCanceledNote(params: CanceledNoteParams): string {
  const lines = [
    '=== INTERVIEW CANCELLED ===',
    '',
    `Scheduling Request ID: ${params.schedulingRequestId}`,
    `Booking ID: ${params.bookingId || 'N/A'}`,
    `Application ID: ${params.applicationId || 'N/A'}`,
    '',
    `Cancelled By: ${params.cancelledBy}`,
    `Reason: ${params.reason}`,
    '',
    `Interviewer(s): ${formatInterviewers(params.interviewerEmails)}`,
    `Organizer: ${params.organizerEmail}`,
    '',
    '===========================',
  ];

  return lines.join('\n');
}

/**
 * Format note for reschedule
 */
export function formatRescheduledNote(params: RescheduledNoteParams): string {
  const lines = [
    '=== INTERVIEW RESCHEDULED ===',
    '',
    `Scheduling Request ID: ${params.schedulingRequestId}`,
    `Booking ID: ${params.bookingId}`,
    `Application ID: ${params.applicationId || 'N/A'}`,
    '',
    `Previous Time (UTC):`,
    `  Start: ${formatUtc(params.oldStartUtc)}`,
    `  End: ${formatUtc(params.oldEndUtc)}`,
    '',
    `New Time (UTC):`,
    `  Start: ${formatUtc(params.newStartUtc)}`,
    `  End: ${formatUtc(params.newEndUtc)}`,
    '',
    `New Time (${params.candidateTimezone}):`,
    `  Start: ${formatLocal(params.newStartUtc, params.candidateTimezone)}`,
    `  End: ${formatLocal(params.newEndUtc, params.candidateTimezone)}`,
    '',
    `Interviewer(s): ${formatInterviewers(params.interviewerEmails)}`,
    `Organizer: ${params.organizerEmail}`,
    '',
    `Calendar Event ID: ${params.calendarEventId || 'N/A'}`,
    `Reason: ${params.reason || 'Not specified'}`,
    '',
    '=============================',
  ];

  return lines.join('\n');
}
