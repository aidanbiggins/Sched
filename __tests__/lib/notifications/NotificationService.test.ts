/**
 * Unit tests for NotificationService
 * Tests idempotency key generation, reminder scheduling, and notification enqueuing
 */

import {
  enqueueAvailabilityRequestNotification,
  enqueueSelfScheduleLinkNotification,
  enqueueBookingConfirmationNotification,
  enqueueRescheduleConfirmationNotification,
  enqueueCancelNoticeNotification,
  enqueueReminderNotifications,
  cancelPendingReminders,
  enqueueResendSelfScheduleLink,
  enqueueResendBookingConfirmation,
} from '@/lib/notifications';
import {
  resetDatabase,
  getNotificationJobsByEntityId,
  createNotificationJob,
} from '@/lib/db';
import {
  AvailabilityRequest,
  SchedulingRequest,
  Booking,
  NotificationJob,
} from '@/types/scheduling';
import { v4 as uuidv4 } from 'uuid';

describe('NotificationService', () => {
  beforeEach(() => {
    resetDatabase();
  });

  // Helper to create test availability request
  const createTestAvailabilityRequest = (): AvailabilityRequest => ({
    id: uuidv4(),
    tenantId: null,
    candidateName: 'Test Candidate',
    candidateEmail: 'candidate@test.com',
    reqTitle: 'Software Engineer',
    interviewerEmails: ['interviewer@company.com'],
    windowStart: new Date(),
    windowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    durationMinutes: 60,
    candidateTimezone: 'America/New_York',
    publicToken: 'test-token-123',
    publicTokenHash: 'hash123',
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Helper to create test scheduling request
  const createTestSchedulingRequest = (): SchedulingRequest => ({
    id: uuidv4(),
    tenantId: null,
    candidateName: 'Test Candidate',
    candidateEmail: 'candidate@test.com',
    reqTitle: 'Software Engineer',
    interviewType: 'phone_screen',
    interviewerEmails: ['interviewer@company.com'],
    windowStart: new Date(),
    windowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    durationMinutes: 60,
    candidateTimezone: 'America/New_York',
    publicToken: 'test-token-456',
    publicTokenHash: 'hash456',
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Helper to create test booking
  const createTestBooking = (requestId: string): Booking => ({
    id: uuidv4(),
    requestId,
    scheduledStart: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48 hours from now
    scheduledEnd: new Date(Date.now() + 49 * 60 * 60 * 1000),
    interviewerEmails: ['interviewer@company.com'],
    calendarEventId: 'mock-event-123',
    status: 'confirmed',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe('Idempotency Keys', () => {
    it('generates deterministic idempotency keys', async () => {
      const request = createTestSchedulingRequest();
      const publicLink = 'https://example.com/book/test';

      // First enqueue
      const job1 = await enqueueSelfScheduleLinkNotification(request, publicLink);
      expect(job1).toBeDefined();
      expect(job1.idempotencyKey).toBe(
        `candidate_self_schedule_link:scheduling_request:${request.id}`
      );

      // Second enqueue should find existing job due to idempotency
      const job2 = await enqueueSelfScheduleLinkNotification(request, publicLink);
      expect(job2.id).toBe(job1.id);
    });

    it('creates different keys for different notification types', async () => {
      const request = createTestSchedulingRequest();
      const booking = createTestBooking(request.id);

      const selfScheduleJob = await enqueueSelfScheduleLinkNotification(
        request,
        'https://example.com/book/test'
      );

      // Simulate booking - need to update request status first
      const bookedRequest = { ...request, status: 'booked' as const };
      const confirmationJob = await enqueueBookingConfirmationNotification(
        bookedRequest,
        booking
      );

      expect(selfScheduleJob.idempotencyKey).not.toBe(confirmationJob.idempotencyKey);
      expect(selfScheduleJob.type).toBe('candidate_self_schedule_link');
      expect(confirmationJob.type).toBe('booking_confirmation');
    });

    it('creates unique keys for resend operations', async () => {
      const request = createTestSchedulingRequest();
      const publicLink = 'https://example.com/book/test';

      // Initial send
      const initialJob = await enqueueSelfScheduleLinkNotification(request, publicLink);

      // Resend should create new job with different key
      const resendJob = await enqueueResendSelfScheduleLink(request, publicLink);

      expect(resendJob.idempotencyKey).not.toBe(initialJob.idempotencyKey);
      expect(resendJob.idempotencyKey).toContain('resend-');
    });
  });

  describe('Availability Request Notifications', () => {
    it('enqueues availability request notification', async () => {
      const request = createTestAvailabilityRequest();
      const publicLink = 'https://example.com/availability/test';

      const job = await enqueueAvailabilityRequestNotification(request, publicLink);

      expect(job).toBeDefined();
      expect(job.type).toBe('candidate_availability_request');
      expect(job.toEmail).toBe('candidate@test.com');
      expect(job.entityType).toBe('availability_request');
      expect(job.entityId).toBe(request.id);
      expect(job.status).toBe('PENDING');
    });

    it('includes correct payload data', async () => {
      const request = createTestAvailabilityRequest();
      const publicLink = 'https://example.com/availability/test';

      const job = await enqueueAvailabilityRequestNotification(request, publicLink);
      const payload = job.payloadJson as Record<string, unknown>;

      expect(payload.candidateName).toBe('Test Candidate');
      expect(payload.reqTitle).toBe('Software Engineer');
      expect(payload.publicLink).toBe(publicLink);
      expect(payload.expiresAt).toBeDefined();
    });
  });

  describe('Self-Schedule Link Notifications', () => {
    it('enqueues self-schedule link notification', async () => {
      const request = createTestSchedulingRequest();
      const publicLink = 'https://example.com/book/test';

      const job = await enqueueSelfScheduleLinkNotification(request, publicLink);

      expect(job).toBeDefined();
      expect(job.type).toBe('candidate_self_schedule_link');
      expect(job.toEmail).toBe('candidate@test.com');
      expect(job.entityType).toBe('scheduling_request');
    });
  });

  describe('Booking Confirmation Notifications', () => {
    it('enqueues booking confirmation', async () => {
      const request = createTestSchedulingRequest();
      request.status = 'booked';
      const booking = createTestBooking(request.id);

      const job = await enqueueBookingConfirmationNotification(request, booking);

      expect(job).toBeDefined();
      expect(job.type).toBe('booking_confirmation');
      expect(job.toEmail).toBe('candidate@test.com');
    });

    it('includes booking details in payload', async () => {
      const request = createTestSchedulingRequest();
      request.status = 'booked';
      const booking = createTestBooking(request.id);

      const job = await enqueueBookingConfirmationNotification(request, booking);
      const payload = job.payloadJson as Record<string, unknown>;

      expect(payload.scheduledStartUtc).toBeDefined();
      expect(payload.scheduledEndUtc).toBeDefined();
      expect(payload.interviewerEmails).toEqual(['interviewer@company.com']);
    });
  });

  describe('Reschedule Confirmation Notifications', () => {
    it('enqueues reschedule confirmation', async () => {
      const request = createTestSchedulingRequest();
      request.status = 'rescheduled';
      const booking = createTestBooking(request.id);
      const oldStart = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const oldEnd = new Date(Date.now() + 25 * 60 * 60 * 1000);

      const job = await enqueueRescheduleConfirmationNotification(
        request, booking, oldStart, oldEnd, 'Schedule conflict'
      );

      expect(job).toBeDefined();
      expect(job.type).toBe('reschedule_confirmation');
    });
  });

  describe('Cancel Notice Notifications', () => {
    it('enqueues cancel notice', async () => {
      const request = createTestSchedulingRequest();

      const job = await enqueueCancelNoticeNotification(
        request, 'Position filled', 'coordinator'
      );

      expect(job).toBeDefined();
      expect(job.type).toBe('cancel_notice');
    });

    it('includes cancellation reason in payload', async () => {
      const request = createTestSchedulingRequest();

      const job = await enqueueCancelNoticeNotification(
        request, 'Position filled', 'coordinator'
      );
      const payload = job.payloadJson as Record<string, unknown>;

      expect(payload.reason).toBe('Position filled');
    });
  });

  describe('Reminder Notifications', () => {
    it('schedules 24h and 2h reminders', async () => {
      const request = createTestSchedulingRequest();
      request.status = 'booked';
      const booking = createTestBooking(request.id);
      booking.scheduledStart = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours from now
      booking.scheduledEnd = new Date(Date.now() + 49 * 60 * 60 * 1000);

      const result = await enqueueReminderNotifications(request, booking);

      expect(result.reminder24h).toBeDefined();
      expect(result.reminder2h).toBeDefined();
      expect(result.reminder24h!.type).toBe('reminder_24h');
      expect(result.reminder2h!.type).toBe('reminder_2h');

      // 24h reminder should be scheduled ~24 hours before interview
      const expected24h = new Date(booking.scheduledStart.getTime() - 24 * 60 * 60 * 1000);
      expect(Math.abs(result.reminder24h!.runAfter.getTime() - expected24h.getTime())).toBeLessThan(1000);

      // 2h reminder should be scheduled ~2 hours before interview
      const expected2h = new Date(booking.scheduledStart.getTime() - 2 * 60 * 60 * 1000);
      expect(Math.abs(result.reminder2h!.runAfter.getTime() - expected2h.getTime())).toBeLessThan(1000);
    });

    it('does not schedule past reminders', async () => {
      const request = createTestSchedulingRequest();
      request.status = 'booked';
      const booking = createTestBooking(request.id);
      // Interview is in 1 hour - too late for 24h and 2h reminders
      booking.scheduledStart = new Date(Date.now() + 60 * 60 * 1000);
      booking.scheduledEnd = new Date(Date.now() + 61 * 60 * 1000);

      const result = await enqueueReminderNotifications(request, booking);

      expect(result.reminder24h).toBeNull();
      expect(result.reminder2h).toBeNull();
    });

    it('schedules only 2h reminder if 24h has passed', async () => {
      const request = createTestSchedulingRequest();
      request.status = 'booked';
      const booking = createTestBooking(request.id);
      // Interview is in 12 hours - 24h reminder would be in past, but 2h is still future
      booking.scheduledStart = new Date(Date.now() + 12 * 60 * 60 * 1000);
      booking.scheduledEnd = new Date(Date.now() + 13 * 60 * 60 * 1000);

      const result = await enqueueReminderNotifications(request, booking);

      expect(result.reminder24h).toBeNull();
      expect(result.reminder2h).toBeDefined();
      expect(result.reminder2h!.type).toBe('reminder_2h');
    });
  });

  describe('Cancel Pending Reminders', () => {
    it('cancels pending reminders for a booking', async () => {
      const bookingId = uuidv4();

      // Create pending reminder jobs manually
      const reminder24h: NotificationJob = {
        id: uuidv4(),
        tenantId: null,
        type: 'reminder_24h',
        entityType: 'booking',
        entityId: bookingId,
        idempotencyKey: `reminder_24h:booking:${bookingId}:scheduled`,
        toEmail: 'candidate@test.com',
        payloadJson: {},
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        runAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
        lastError: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const reminder2h: NotificationJob = {
        id: uuidv4(),
        tenantId: null,
        type: 'reminder_2h',
        entityType: 'booking',
        entityId: bookingId,
        idempotencyKey: `reminder_2h:booking:${bookingId}:scheduled`,
        toEmail: 'candidate@test.com',
        payloadJson: {},
        status: 'PENDING',
        attempts: 0,
        maxAttempts: 5,
        runAfter: new Date(Date.now() + 2 * 60 * 60 * 1000),
        lastError: null,
        sentAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await createNotificationJob(reminder24h);
      await createNotificationJob(reminder2h);

      // Cancel reminders
      const cancelledCount = await cancelPendingReminders(bookingId);

      expect(cancelledCount).toBe(2);

      // Verify jobs are cancelled
      const jobs = await getNotificationJobsByEntityId('booking', bookingId);
      const reminderJobs = jobs.filter(j => j.type.includes('reminder'));
      expect(reminderJobs.every(j => j.status === 'CANCELED')).toBe(true);
    });

    it('does not cancel already sent reminders', async () => {
      const bookingId = uuidv4();

      // Create a sent reminder job
      const sentReminder: NotificationJob = {
        id: uuidv4(),
        tenantId: null,
        type: 'reminder_24h',
        entityType: 'booking',
        entityId: bookingId,
        idempotencyKey: `reminder_24h:booking:${bookingId}:scheduled`,
        toEmail: 'candidate@test.com',
        payloadJson: {},
        status: 'SENT',
        attempts: 1,
        maxAttempts: 5,
        runAfter: new Date(Date.now() - 1000),
        lastError: null,
        sentAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await createNotificationJob(sentReminder);

      // Try to cancel
      const cancelledCount = await cancelPendingReminders(bookingId);

      expect(cancelledCount).toBe(0);

      // Verify job is still SENT
      const jobs = await getNotificationJobsByEntityId('booking', bookingId);
      expect(jobs[0].status).toBe('SENT');
    });
  });

  describe('Resend Operations', () => {
    it('creates new job for resend self-schedule link', async () => {
      const request = createTestSchedulingRequest();
      const publicLink = 'https://example.com/book/test';

      // Initial send
      await enqueueSelfScheduleLinkNotification(request, publicLink);

      // Resend
      const resendJob = await enqueueResendSelfScheduleLink(request, publicLink);

      expect(resendJob).toBeDefined();
      expect(resendJob.type).toBe('candidate_self_schedule_link');
      expect(resendJob.idempotencyKey).toContain('resend-');
    });

    it('creates new job for resend booking confirmation', async () => {
      const request = createTestSchedulingRequest();
      request.status = 'booked';
      const booking = createTestBooking(request.id);

      // Initial confirmation
      await enqueueBookingConfirmationNotification(request, booking);

      // Resend
      const resendJob = await enqueueResendBookingConfirmation(request, booking);

      expect(resendJob).toBeDefined();
      expect(resendJob.type).toBe('booking_confirmation');
      expect(resendJob.idempotencyKey).toContain('resend-');
    });
  });
});
