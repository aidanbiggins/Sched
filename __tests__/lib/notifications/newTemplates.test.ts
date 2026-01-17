/**
 * Tests for New Email Templates
 * M16: Communications & Portal Hardening
 */

import {
  nudgeReminderTemplate,
  escalationNoResponseTemplate,
  escalationExpiredTemplate,
  coordinatorBookingTemplate,
  coordinatorCancelTemplate,
  interviewerNotificationTemplate,
  interviewerReminderTemplate,
} from '@/lib/notifications/templates';

describe('New Email Templates', () => {
  describe('nudgeReminderTemplate', () => {
    const basePayload = {
      candidateName: 'John Doe',
      candidateEmail: 'john@example.com',
      candidateTimezone: 'America/New_York',
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      durationMinutes: 60,
      publicLink: 'https://app.example.com/book/token123',
      requestType: 'booking' as const,
      daysSinceRequest: 2,
      isUrgent: false,
    };

    it('should generate non-urgent nudge template', () => {
      const template = nudgeReminderTemplate(basePayload);

      expect(template.subject).toContain('Reminder to schedule your interview');
      expect(template.subject).not.toContain('Urgent');
      expect(template.html).toContain('John Doe');
      expect(template.html).toContain('Schedule Your Interview');
      expect(template.html).not.toContain('Action Required: This link will expire soon');
      expect(template.text).toContain('2 days ago');
    });

    it('should generate urgent nudge template', () => {
      const urgentPayload = { ...basePayload, isUrgent: true, daysSinceRequest: 5 };
      const template = nudgeReminderTemplate(urgentPayload);

      expect(template.subject).toContain('Urgent');
      expect(template.html).toContain('Action Required: This link will expire soon');
      expect(template.text).toContain('URGENT');
    });

    it('should handle availability request type', () => {
      const availabilityPayload = { ...basePayload, requestType: 'availability' as const };
      const template = nudgeReminderTemplate(availabilityPayload);

      expect(template.subject).toContain('provide your availability');
      expect(template.html).toContain('Provide Your Availability');
    });

    it('should handle singular day correctly', () => {
      const singleDayPayload = { ...basePayload, daysSinceRequest: 1 };
      const template = nudgeReminderTemplate(singleDayPayload);

      expect(template.text).toContain('1 day ago');
      expect(template.text).not.toContain('1 days ago');
    });
  });

  describe('escalationNoResponseTemplate', () => {
    const basePayload = {
      coordinatorEmail: 'coordinator@example.com',
      coordinatorName: 'Jane Smith',
      candidateName: 'John Doe',
      candidateEmail: 'john@example.com',
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      requestId: 'req-123',
      requestType: 'booking' as const,
      daysSinceRequest: 5,
      publicLink: 'https://app.example.com/coordinator/req-123',
    };

    it('should generate escalation template', () => {
      const template = escalationNoResponseTemplate(basePayload);

      expect(template.subject).toContain('No response from John Doe');
      expect(template.subject).toContain('5 days');
      expect(template.html).toContain('Jane Smith');
      expect(template.html).toContain('has not responded');
      expect(template.html).toContain('Recommended Actions');
      expect(template.text).toContain('Reach out to the candidate');
    });

    it('should handle availability request type', () => {
      const availabilityPayload = { ...basePayload, requestType: 'availability' as const };
      const template = escalationNoResponseTemplate(availabilityPayload);

      expect(template.html).toContain('availability request');
    });
  });

  describe('escalationExpiredTemplate', () => {
    const basePayload = {
      coordinatorEmail: 'coordinator@example.com',
      coordinatorName: 'Jane Smith',
      candidateName: 'John Doe',
      candidateEmail: 'john@example.com',
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      requestId: 'req-123',
      requestType: 'booking' as const,
      daysSinceRequest: 7,
      publicLink: 'https://app.example.com/coordinator/req-123',
    };

    it('should generate expired template', () => {
      const template = escalationExpiredTemplate(basePayload);

      expect(template.subject).toContain('Request expired');
      expect(template.html).toContain('Scheduling Request Expired');
      expect(template.html).toContain('Expired');
      expect(template.text).toContain('need to create a new scheduling request');
    });
  });

  describe('coordinatorBookingTemplate', () => {
    const basePayload = {
      coordinatorEmail: 'coordinator@example.com',
      coordinatorName: 'Jane Smith',
      candidateName: 'John Doe',
      candidateEmail: 'john@example.com',
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      scheduledStartUtc: '2026-01-20T15:00:00Z',
      scheduledEndUtc: '2026-01-20T16:00:00Z',
      scheduledStartLocal: 'Monday, January 20, 2026 at 10:00 AM EST',
      scheduledEndLocal: 'Monday, January 20, 2026 at 11:00 AM EST',
      conferenceJoinUrl: 'https://meet.example.com/123',
    };

    it('should generate booking notification template', () => {
      const template = coordinatorBookingTemplate(basePayload);

      expect(template.subject).toContain('John Doe has scheduled');
      expect(template.html).toContain('Interview Scheduled');
      expect(template.html).toContain('Jane Smith');
      expect(template.html).toContain('Meeting Link');
      expect(template.text).toContain('Calendar invites have been sent');
    });

    it('should handle missing conference URL', () => {
      const noMeetingPayload = { ...basePayload, conferenceJoinUrl: null };
      const template = coordinatorBookingTemplate(noMeetingPayload);

      expect(template.html).not.toContain('Meeting Link');
      expect(template.text).not.toContain('Meeting Link');
    });
  });

  describe('coordinatorCancelTemplate', () => {
    const basePayload = {
      coordinatorEmail: 'coordinator@example.com',
      coordinatorName: 'Jane Smith',
      candidateName: 'John Doe',
      candidateEmail: 'john@example.com',
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      scheduledStartUtc: '2026-01-20T15:00:00Z',
      scheduledEndUtc: '2026-01-20T16:00:00Z',
      scheduledStartLocal: 'Monday, January 20, 2026 at 10:00 AM EST',
      scheduledEndLocal: 'Monday, January 20, 2026 at 11:00 AM EST',
      conferenceJoinUrl: null,
    };

    it('should generate cancel notification template', () => {
      const template = coordinatorCancelTemplate(basePayload);

      expect(template.subject).toContain('has cancelled');
      expect(template.html).toContain('Interview Cancelled');
      expect(template.text).toContain('reach out to the candidate');
    });

    it('should include reason when provided', () => {
      const withReasonPayload = { ...basePayload, reason: 'Scheduling conflict' };
      const template = coordinatorCancelTemplate(withReasonPayload);

      expect(template.html).toContain('Reason');
      expect(template.html).toContain('Scheduling conflict');
      expect(template.text).toContain('Reason: Scheduling conflict');
    });
  });

  describe('interviewerNotificationTemplate', () => {
    const basePayload = {
      interviewerEmail: 'interviewer@example.com',
      interviewerName: 'Bob Johnson',
      candidateName: 'John Doe',
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      scheduledStartUtc: '2026-01-20T15:00:00Z',
      scheduledEndUtc: '2026-01-20T16:00:00Z',
      scheduledStartLocal: 'Monday, January 20, 2026 at 10:00 AM EST',
      scheduledEndLocal: 'Monday, January 20, 2026 at 11:00 AM EST',
      conferenceJoinUrl: 'https://meet.example.com/123',
    };

    it('should generate interviewer notification template', () => {
      const template = interviewerNotificationTemplate(basePayload);

      expect(template.subject).toContain('Interview scheduled with John Doe');
      expect(template.html).toContain('Bob Johnson');
      expect(template.html).toContain('Video Conference Link');
      expect(template.text).toContain('A calendar invite has been sent');
    });
  });

  describe('interviewerReminderTemplate', () => {
    const basePayload = {
      interviewerEmail: 'interviewer@example.com',
      interviewerName: 'Bob Johnson',
      candidateName: 'John Doe',
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      scheduledStartUtc: '2026-01-20T15:00:00Z',
      scheduledEndUtc: '2026-01-20T16:00:00Z',
      scheduledStartLocal: 'Monday, January 20, 2026 at 10:00 AM EST',
      scheduledEndLocal: 'Monday, January 20, 2026 at 11:00 AM EST',
      conferenceJoinUrl: 'https://meet.example.com/123',
      hoursUntil: 24,
    };

    it('should generate 24h reminder template', () => {
      const template = interviewerReminderTemplate(basePayload);

      expect(template.subject).toContain('Reminder');
      expect(template.subject).toContain('tomorrow');
      expect(template.html).toContain('is tomorrow');
    });

    it('should generate 2h reminder template', () => {
      const twoHourPayload = { ...basePayload, hoursUntil: 2 };
      const template = interviewerReminderTemplate(twoHourPayload);

      expect(template.subject).toContain('in 2 hours');
      expect(template.html).toContain('is in 2 hours');
    });
  });
});
