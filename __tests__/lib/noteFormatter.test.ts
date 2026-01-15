/**
 * Unit tests for iCIMS Note Formatter
 *
 * Tests deterministic note formatting for all scheduling events.
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
  describe('formatLinkCreatedNote', () => {
    it('formats link created note with all fields', () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: 'app-456',
        publicLink: 'https://example.com/book/abc123',
        interviewerEmails: ['interviewer1@company.com', 'interviewer2@company.com'],
        organizerEmail: 'organizer@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      const note = formatLinkCreatedNote(params);

      expect(note).toContain('=== SCHEDULING LINK CREATED ===');
      expect(note).toContain('Scheduling Request ID: req-123');
      expect(note).toContain('Application ID: app-456');
      expect(note).toContain('Public Link: https://example.com/book/abc123');
      expect(note).toContain('Interview Type: phone_screen');
      expect(note).toContain('Duration: 45 minutes');
      expect(note).toContain('Interviewer(s): interviewer1@company.com, interviewer2@company.com');
      expect(note).toContain('Organizer: organizer@company.com');
      expect(note).toContain('Candidate Timezone: America/New_York');
    });

    it('handles null applicationId', () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-789',
        applicationId: null,
        publicLink: 'https://example.com/book/xyz',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'hm_screen',
        durationMinutes: 60,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/Los_Angeles',
      };

      const note = formatLinkCreatedNote(params);

      expect(note).toContain('Application ID: N/A');
    });

    it('includes UTC timestamps', () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-utc',
        applicationId: 'app-utc',
        publicLink: 'https://example.com/book/utc',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'onsite',
        durationMinutes: 120,
        windowStart: new Date('2025-01-15T14:30:00Z'),
        windowEnd: new Date('2025-01-22T18:45:00Z'),
        candidateTimezone: 'Europe/London',
      };

      const note = formatLinkCreatedNote(params);

      expect(note).toContain('2025-01-15T14:30:00.000Z');
      expect(note).toContain('2025-01-22T18:45:00.000Z');
    });

    it('is deterministic (same input produces same output)', () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-det',
        applicationId: 'app-det',
        publicLink: 'https://example.com/book/det',
        interviewerEmails: ['a@company.com', 'b@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'final',
        durationMinutes: 90,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/Chicago',
      };

      const note1 = formatLinkCreatedNote(params);
      const note2 = formatLinkCreatedNote(params);

      expect(note1).toBe(note2);
    });
  });

  describe('formatBookedNote', () => {
    it('formats booked note with all fields', () => {
      const params: BookedNoteParams = {
        schedulingRequestId: 'req-book',
        bookingId: 'book-123',
        applicationId: 'app-book',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        scheduledStartUtc: new Date('2025-01-17T14:00:00Z'),
        scheduledEndUtc: new Date('2025-01-17T15:00:00Z'),
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-event-xyz',
        joinUrl: 'https://teams.microsoft.com/join/abc123',
      };

      const note = formatBookedNote(params);

      expect(note).toContain('=== INTERVIEW BOOKED ===');
      expect(note).toContain('Scheduling Request ID: req-book');
      expect(note).toContain('Booking ID: book-123');
      expect(note).toContain('Application ID: app-book');
      expect(note).toContain('2025-01-17T14:00:00.000Z');
      expect(note).toContain('2025-01-17T15:00:00.000Z');
      expect(note).toContain('Calendar Event ID: cal-event-xyz');
      expect(note).toContain('Join URL: https://teams.microsoft.com/join/abc123');
    });

    it('handles null optional fields', () => {
      const params: BookedNoteParams = {
        schedulingRequestId: 'req-null',
        bookingId: 'book-null',
        applicationId: null,
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        scheduledStartUtc: new Date('2025-01-17T14:00:00Z'),
        scheduledEndUtc: new Date('2025-01-17T15:00:00Z'),
        candidateTimezone: 'America/New_York',
        calendarEventId: null,
        joinUrl: null,
      };

      const note = formatBookedNote(params);

      expect(note).toContain('Application ID: N/A');
      expect(note).toContain('Calendar Event ID: N/A');
      expect(note).toContain('Join URL: N/A');
    });

    it('includes both UTC and local times', () => {
      const params: BookedNoteParams = {
        schedulingRequestId: 'req-tz',
        bookingId: 'book-tz',
        applicationId: 'app-tz',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        scheduledStartUtc: new Date('2025-01-17T19:00:00Z'),
        scheduledEndUtc: new Date('2025-01-17T20:00:00Z'),
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-123',
        joinUrl: null,
      };

      const note = formatBookedNote(params);

      expect(note).toContain('Scheduled Time (UTC):');
      expect(note).toContain('Scheduled Time (America/New_York):');
    });
  });

  describe('formatCanceledNote', () => {
    it('formats canceled note with all fields', () => {
      const params: CanceledNoteParams = {
        schedulingRequestId: 'req-cancel',
        bookingId: 'book-cancel',
        applicationId: 'app-cancel',
        interviewerEmails: ['int1@company.com', 'int2@company.com'],
        organizerEmail: 'org@company.com',
        reason: 'Position has been filled',
        cancelledBy: 'coordinator@company.com',
      };

      const note = formatCanceledNote(params);

      expect(note).toContain('=== INTERVIEW CANCELLED ===');
      expect(note).toContain('Scheduling Request ID: req-cancel');
      expect(note).toContain('Booking ID: book-cancel');
      expect(note).toContain('Application ID: app-cancel');
      expect(note).toContain('Cancelled By: coordinator@company.com');
      expect(note).toContain('Reason: Position has been filled');
      expect(note).toContain('Interviewer(s): int1@company.com, int2@company.com');
    });

    it('handles null bookingId', () => {
      const params: CanceledNoteParams = {
        schedulingRequestId: 'req-nobooking',
        bookingId: null,
        applicationId: 'app-nobooking',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        reason: 'Candidate withdrew',
        cancelledBy: 'system',
      };

      const note = formatCanceledNote(params);

      expect(note).toContain('Booking ID: N/A');
    });
  });

  describe('formatRescheduledNote', () => {
    it('formats rescheduled note with all fields', () => {
      const params: RescheduledNoteParams = {
        schedulingRequestId: 'req-resch',
        bookingId: 'book-resch',
        applicationId: 'app-resch',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        oldStartUtc: new Date('2025-01-17T14:00:00Z'),
        oldEndUtc: new Date('2025-01-17T15:00:00Z'),
        newStartUtc: new Date('2025-01-18T16:00:00Z'),
        newEndUtc: new Date('2025-01-18T17:00:00Z'),
        candidateTimezone: 'America/Los_Angeles',
        calendarEventId: 'cal-resch',
        reason: 'Interviewer conflict',
      };

      const note = formatRescheduledNote(params);

      expect(note).toContain('=== INTERVIEW RESCHEDULED ===');
      expect(note).toContain('Scheduling Request ID: req-resch');
      expect(note).toContain('Booking ID: book-resch');
      expect(note).toContain('Previous Time (UTC):');
      expect(note).toContain('2025-01-17T14:00:00.000Z');
      expect(note).toContain('New Time (UTC):');
      expect(note).toContain('2025-01-18T16:00:00.000Z');
      expect(note).toContain('Reason: Interviewer conflict');
    });

    it('handles null reason', () => {
      const params: RescheduledNoteParams = {
        schedulingRequestId: 'req-noreason',
        bookingId: 'book-noreason',
        applicationId: 'app-noreason',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        oldStartUtc: new Date('2025-01-17T14:00:00Z'),
        oldEndUtc: new Date('2025-01-17T15:00:00Z'),
        newStartUtc: new Date('2025-01-18T16:00:00Z'),
        newEndUtc: new Date('2025-01-18T17:00:00Z'),
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-noreason',
        reason: null,
      };

      const note = formatRescheduledNote(params);

      expect(note).toContain('Reason: Not specified');
    });

    it('includes both old and new times in local timezone', () => {
      const params: RescheduledNoteParams = {
        schedulingRequestId: 'req-times',
        bookingId: 'book-times',
        applicationId: 'app-times',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        oldStartUtc: new Date('2025-01-17T14:00:00Z'),
        oldEndUtc: new Date('2025-01-17T15:00:00Z'),
        newStartUtc: new Date('2025-01-18T16:00:00Z'),
        newEndUtc: new Date('2025-01-18T17:00:00Z'),
        candidateTimezone: 'Europe/London',
        calendarEventId: 'cal-times',
        reason: 'Schedule change',
      };

      const note = formatRescheduledNote(params);

      expect(note).toContain('New Time (Europe/London):');
    });
  });
});
