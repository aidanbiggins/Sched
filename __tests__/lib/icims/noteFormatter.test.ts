/**
 * Tests for iCIMS Note Formatter
 * Ensures deterministic, consistent output for all note types
 */

import {
  formatLinkCreatedNote,
  formatBookedNote,
  formatCanceledNote,
  formatRescheduledNote,
  LinkCreatedNoteParams,
  BookedNoteParams,
  CanceledNoteParams,
  RescheduledNoteParams,
} from '@/lib/icims/noteFormatter';

describe('noteFormatter', () => {
  // Use fixed dates for deterministic output
  const fixedDate1 = new Date('2026-01-15T14:00:00.000Z');
  const fixedDate2 = new Date('2026-01-15T15:00:00.000Z');
  const fixedDate3 = new Date('2026-01-28T14:00:00.000Z');
  const fixedDate4 = new Date('2026-01-16T10:00:00.000Z');
  const fixedDate5 = new Date('2026-01-16T11:00:00.000Z');

  describe('formatLinkCreatedNote', () => {
    it('should format link created note with all fields', () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: 'APP-456',
        publicLink: 'https://schedule.example.com/book/abc123',
        interviewerEmails: ['interviewer1@company.com', 'interviewer2@company.com'],
        organizerEmail: 'scheduling@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: fixedDate1,
        windowEnd: fixedDate3,
        candidateTimezone: 'America/New_York',
      };

      const note = formatLinkCreatedNote(params);

      expect(note).toContain('=== SCHEDULING LINK CREATED ===');
      expect(note).toContain('Scheduling Request ID: req-123');
      expect(note).toContain('Application ID: APP-456');
      expect(note).toContain('Public Link: https://schedule.example.com/book/abc123');
      expect(note).toContain('Interview Type: phone_screen');
      expect(note).toContain('Duration: 45 minutes');
      expect(note).toContain('Interviewer(s): interviewer1@company.com, interviewer2@company.com');
      expect(note).toContain('Organizer: scheduling@company.com');
      expect(note).toContain('Start: 2026-01-15T14:00:00.000Z (UTC)');
      expect(note).toContain('End: 2026-01-28T14:00:00.000Z (UTC)');
      expect(note).toContain('Candidate Timezone: America/New_York');
    });

    it('should handle missing applicationId', () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: null,
        publicLink: 'https://schedule.example.com/book/abc123',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        interviewType: 'hm_screen',
        durationMinutes: 60,
        windowStart: fixedDate1,
        windowEnd: fixedDate3,
        candidateTimezone: 'America/Los_Angeles',
      };

      const note = formatLinkCreatedNote(params);

      expect(note).toContain('Application ID: N/A');
    });

    it('should handle single interviewer', () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: 'APP-456',
        publicLink: 'https://schedule.example.com/book/abc123',
        interviewerEmails: ['solo@company.com'],
        organizerEmail: 'scheduling@company.com',
        interviewType: 'final',
        durationMinutes: 90,
        windowStart: fixedDate1,
        windowEnd: fixedDate3,
        candidateTimezone: 'Europe/London',
      };

      const note = formatLinkCreatedNote(params);

      expect(note).toContain('Interviewer(s): solo@company.com');
    });

    it('should produce deterministic output', () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: 'APP-456',
        publicLink: 'https://schedule.example.com/book/abc123',
        interviewerEmails: ['a@test.com', 'b@test.com'],
        organizerEmail: 'org@test.com',
        interviewType: 'onsite',
        durationMinutes: 30,
        windowStart: fixedDate1,
        windowEnd: fixedDate3,
        candidateTimezone: 'America/Chicago',
      };

      const note1 = formatLinkCreatedNote(params);
      const note2 = formatLinkCreatedNote(params);

      expect(note1).toBe(note2);
    });
  });

  describe('formatBookedNote', () => {
    it('should format booked note with all fields', () => {
      const params: BookedNoteParams = {
        schedulingRequestId: 'req-123',
        bookingId: 'booking-789',
        applicationId: 'APP-456',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        scheduledStartUtc: fixedDate1,
        scheduledEndUtc: fixedDate2,
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-event-123',
        joinUrl: 'https://teams.microsoft.com/meet/abc123',
      };

      const note = formatBookedNote(params);

      expect(note).toContain('=== INTERVIEW BOOKED ===');
      expect(note).toContain('Scheduling Request ID: req-123');
      expect(note).toContain('Booking ID: booking-789');
      expect(note).toContain('Application ID: APP-456');
      expect(note).toContain('Start: 2026-01-15T14:00:00.000Z');
      expect(note).toContain('End: 2026-01-15T15:00:00.000Z');
      expect(note).toContain('Calendar Event ID: cal-event-123');
      expect(note).toContain('Join URL: https://teams.microsoft.com/meet/abc123');
    });

    it('should handle missing calendar event and join URL', () => {
      const params: BookedNoteParams = {
        schedulingRequestId: 'req-123',
        bookingId: 'booking-789',
        applicationId: 'APP-456',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        scheduledStartUtc: fixedDate1,
        scheduledEndUtc: fixedDate2,
        candidateTimezone: 'America/New_York',
        calendarEventId: null,
        joinUrl: null,
      };

      const note = formatBookedNote(params);

      expect(note).toContain('Calendar Event ID: N/A');
      expect(note).toContain('Join URL: N/A');
    });

    it('should include local time in candidate timezone', () => {
      const params: BookedNoteParams = {
        schedulingRequestId: 'req-123',
        bookingId: 'booking-789',
        applicationId: 'APP-456',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        scheduledStartUtc: fixedDate1,
        scheduledEndUtc: fixedDate2,
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-123',
        joinUrl: null,
      };

      const note = formatBookedNote(params);

      expect(note).toContain('Scheduled Time (America/New_York):');
    });
  });

  describe('formatCanceledNote', () => {
    it('should format canceled note with all fields', () => {
      const params: CanceledNoteParams = {
        schedulingRequestId: 'req-123',
        bookingId: 'booking-789',
        applicationId: 'APP-456',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        reason: 'Candidate withdrew application',
        cancelledBy: 'coordinator',
      };

      const note = formatCanceledNote(params);

      expect(note).toContain('=== INTERVIEW CANCELLED ===');
      expect(note).toContain('Scheduling Request ID: req-123');
      expect(note).toContain('Booking ID: booking-789');
      expect(note).toContain('Application ID: APP-456');
      expect(note).toContain('Cancelled By: coordinator');
      expect(note).toContain('Reason: Candidate withdrew application');
    });

    it('should handle cancellation before booking (no booking ID)', () => {
      const params: CanceledNoteParams = {
        schedulingRequestId: 'req-123',
        bookingId: null,
        applicationId: 'APP-456',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        reason: 'Position filled',
        cancelledBy: 'system',
      };

      const note = formatCanceledNote(params);

      expect(note).toContain('Booking ID: N/A');
    });
  });

  describe('formatRescheduledNote', () => {
    it('should format rescheduled note with all fields', () => {
      const params: RescheduledNoteParams = {
        schedulingRequestId: 'req-123',
        bookingId: 'booking-789',
        applicationId: 'APP-456',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        oldStartUtc: fixedDate1,
        oldEndUtc: fixedDate2,
        newStartUtc: fixedDate4,
        newEndUtc: fixedDate5,
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-event-123',
        reason: 'Interviewer conflict',
      };

      const note = formatRescheduledNote(params);

      expect(note).toContain('=== INTERVIEW RESCHEDULED ===');
      expect(note).toContain('Scheduling Request ID: req-123');
      expect(note).toContain('Booking ID: booking-789');
      expect(note).toContain('Previous Time (UTC):');
      expect(note).toContain('New Time (UTC):');
      expect(note).toContain('Calendar Event ID: cal-event-123');
      expect(note).toContain('Reason: Interviewer conflict');
    });

    it('should handle missing reason', () => {
      const params: RescheduledNoteParams = {
        schedulingRequestId: 'req-123',
        bookingId: 'booking-789',
        applicationId: 'APP-456',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        oldStartUtc: fixedDate1,
        oldEndUtc: fixedDate2,
        newStartUtc: fixedDate4,
        newEndUtc: fixedDate5,
        candidateTimezone: 'America/New_York',
        calendarEventId: null,
        reason: null,
      };

      const note = formatRescheduledNote(params);

      expect(note).toContain('Reason: Not specified');
    });

    it('should show both old and new times', () => {
      const params: RescheduledNoteParams = {
        schedulingRequestId: 'req-123',
        bookingId: 'booking-789',
        applicationId: 'APP-456',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        oldStartUtc: fixedDate1,
        oldEndUtc: fixedDate2,
        newStartUtc: fixedDate4,
        newEndUtc: fixedDate5,
        candidateTimezone: 'Pacific/Auckland',
        calendarEventId: 'cal-123',
        reason: 'Schedule change',
      };

      const note = formatRescheduledNote(params);

      // Old times
      expect(note).toContain('Start: 2026-01-15T14:00:00.000Z');
      expect(note).toContain('End: 2026-01-15T15:00:00.000Z');
      // New times
      expect(note).toContain('Start: 2026-01-16T10:00:00.000Z');
      expect(note).toContain('End: 2026-01-16T11:00:00.000Z');
    });
  });
});
