/**
 * Unit tests for ReconciliationService (M6)
 */

import {
  ReconciliationService,
  getReconciliationService,
} from '@/lib/reconciliation/ReconciliationService';
import {
  resetDatabase,
  createSchedulingRequest,
  createBooking,
  getSchedulingRequestById,
  getBookingById,
  getReconciliationJobsByEntityId,
  getAllAuditLogs,
} from '@/lib/db';
import { SchedulingRequest, Booking, ReconciliationJob } from '@/types/scheduling';
import { v4 as uuidv4 } from 'uuid';

describe('ReconciliationService', () => {
  let service: ReconciliationService;

  beforeEach(() => {
    resetDatabase();
    service = new ReconciliationService();
  });

  function createTestRequest(overrides: Partial<SchedulingRequest> = {}): SchedulingRequest {
    const id = uuidv4();
    return {
      id,
      applicationId: `app-${id}`,
      candidateName: 'Test Candidate',
      candidateEmail: 'test@example.com',
      reqId: 'REQ-001',
      reqTitle: 'Software Engineer',
      interviewType: 'phone_screen',
      durationMinutes: 60,
      interviewerEmails: ['interviewer@example.com'],
      organizerEmail: 'organizer@example.com',
      calendarProvider: 'microsoft',
      graphTenantId: 'test-tenant',
      windowStart: new Date(),
      windowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      candidateTimezone: 'America/New_York',
      publicToken: 'test-token',
      publicTokenHash: 'test-hash',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
      needsAttention: false,
      needsAttentionReason: null,
      createdBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  function createTestBooking(requestId: string, overrides: Partial<Booking> = {}): Booking {
    const id = uuidv4();
    return {
      id,
      requestId,
      scheduledStart: new Date(),
      scheduledEnd: new Date(Date.now() + 60 * 60 * 1000),
      calendarEventId: `cal-${id}`,
      calendarIcalUid: null,
      conferenceJoinUrl: null,
      icimsActivityId: null,
      status: 'confirmed',
      confirmedAt: new Date(),
      cancelledAt: null,
      cancellationReason: null,
      bookedBy: 'candidate',
      bookedAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  describe('detectStateMismatch', () => {
    it('detects expired requests still marked as pending', async () => {
      const request = createTestRequest({
        status: 'pending',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
      });
      await createSchedulingRequest(request);

      const results = await service.detectStateMismatch();

      expect(results).toHaveLength(1);
      expect(results[0].jobType).toBe('state_mismatch');
      expect(results[0].entityId).toBe(request.id);
      expect(results[0].reason).toContain('expired');
    });

    it('detects requests with confirmed booking but still pending status', async () => {
      const request = createTestRequest({ status: 'pending' });
      await createSchedulingRequest(request);

      const booking = createTestBooking(request.id, { status: 'confirmed' });
      await createBooking(booking);

      const results = await service.detectStateMismatch();

      expect(results).toHaveLength(1);
      expect(results[0].jobType).toBe('state_mismatch');
      expect(results[0].entityId).toBe(request.id);
      expect(results[0].reason).toContain('confirmed booking');
    });

    it('does not detect issues for correctly configured requests', async () => {
      const request = createTestRequest({ status: 'booked' });
      await createSchedulingRequest(request);

      const booking = createTestBooking(request.id, { status: 'confirmed' });
      await createBooking(booking);

      const results = await service.detectStateMismatch();

      expect(results).toHaveLength(0);
    });
  });

  describe('detectIcimsNoteMissing', () => {
    it('detects confirmed bookings without iCIMS activity (after stale threshold)', async () => {
      const request = createTestRequest({ status: 'booked' });
      await createSchedulingRequest(request);

      // Create booking confirmed > 24 hours ago
      const booking = createTestBooking(request.id, {
        status: 'confirmed',
        icimsActivityId: null,
        confirmedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      await createBooking(booking);

      const results = await service.detectIcimsNoteMissing();

      expect(results).toHaveLength(1);
      expect(results[0].jobType).toBe('icims_note_missing');
      expect(results[0].entityId).toBe(booking.id);
    });

    it('does not flag recent bookings', async () => {
      const request = createTestRequest({ status: 'booked' });
      await createSchedulingRequest(request);

      // Create booking confirmed < 24 hours ago
      const booking = createTestBooking(request.id, {
        status: 'confirmed',
        icimsActivityId: null,
        confirmedAt: new Date(), // Now
      });
      await createBooking(booking);

      const results = await service.detectIcimsNoteMissing();

      expect(results).toHaveLength(0);
    });

    it('does not flag bookings with iCIMS activity', async () => {
      const request = createTestRequest({ status: 'booked' });
      await createSchedulingRequest(request);

      const booking = createTestBooking(request.id, {
        status: 'confirmed',
        icimsActivityId: 'ICIMS-123',
        confirmedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      await createBooking(booking);

      const results = await service.detectIcimsNoteMissing();

      expect(results).toHaveLength(0);
    });
  });

  describe('detectCalendarEventMissing', () => {
    it('detects confirmed bookings without calendar event (after stale threshold)', async () => {
      const request = createTestRequest({ status: 'booked' });
      await createSchedulingRequest(request);

      const booking = createTestBooking(request.id, {
        status: 'confirmed',
        calendarEventId: null,
        confirmedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      await createBooking(booking);

      const results = await service.detectCalendarEventMissing();

      expect(results).toHaveLength(1);
      expect(results[0].jobType).toBe('calendar_event_missing');
      expect(results[0].entityId).toBe(booking.id);
    });
  });

  describe('runDetection', () => {
    it('creates reconciliation jobs for detected issues', async () => {
      const request = createTestRequest({
        status: 'pending',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      await createSchedulingRequest(request);

      const results = await service.runDetection();

      expect(results).toHaveLength(1);

      const jobs = await getReconciliationJobsByEntityId(request.id);
      expect(jobs).toHaveLength(1);
      expect(jobs[0].jobType).toBe('state_mismatch');
      expect(jobs[0].status).toBe('pending');
    });

    it('does not create duplicate jobs', async () => {
      const request = createTestRequest({
        status: 'pending',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      await createSchedulingRequest(request);

      // Run detection twice
      await service.runDetection();
      await service.runDetection();

      const jobs = await getReconciliationJobsByEntityId(request.id);
      expect(jobs).toHaveLength(1);
    });

    it('logs detection to audit log', async () => {
      const request = createTestRequest({
        status: 'pending',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      await createSchedulingRequest(request);

      await service.runDetection();

      const logs = await getAllAuditLogs();
      const detectionLog = logs.find((l) => l.action === 'reconciliation_detected');
      expect(detectionLog).toBeDefined();
      expect(detectionLog?.payload?.jobType).toBe('state_mismatch');
    });
  });

  describe('processJob', () => {
    it('repairs expired request state mismatch', async () => {
      const request = createTestRequest({
        status: 'pending',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      });
      await createSchedulingRequest(request);

      await service.runDetection();
      const jobs = await getReconciliationJobsByEntityId(request.id);
      const job = jobs[0];

      const result = await service.processJob(job);

      expect(result.success).toBe(true);
      expect(result.action).toContain('expired');

      const updated = await getSchedulingRequestById(request.id);
      expect(updated?.status).toBe('expired');
    });

    it('repairs request with confirmed booking', async () => {
      const request = createTestRequest({ status: 'pending' });
      await createSchedulingRequest(request);

      const booking = createTestBooking(request.id, { status: 'confirmed' });
      await createBooking(booking);

      await service.runDetection();
      const jobs = await getReconciliationJobsByEntityId(request.id);
      const job = jobs[0];

      const result = await service.processJob(job);

      expect(result.success).toBe(true);
      expect(result.action).toContain('booked');

      const updated = await getSchedulingRequestById(request.id);
      expect(updated?.status).toBe('booked');
    });

    it('repairs icims_note_missing by creating activity', async () => {
      const request = createTestRequest({ status: 'booked' });
      await createSchedulingRequest(request);

      const booking = createTestBooking(request.id, {
        status: 'confirmed',
        icimsActivityId: null,
        confirmedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      await createBooking(booking);

      await service.runDetection();
      const jobs = await getReconciliationJobsByEntityId(booking.id);
      const job = jobs[0];

      const result = await service.processJob(job);

      expect(result.success).toBe(true);
      expect(result.action).toContain('iCIMS activity');

      const updated = await getBookingById(booking.id);
      expect(updated?.icimsActivityId).toBeTruthy();
    });

    it('repairs calendar_event_missing by creating event', async () => {
      const request = createTestRequest({ status: 'booked' });
      await createSchedulingRequest(request);

      const booking = createTestBooking(request.id, {
        status: 'confirmed',
        calendarEventId: null,
        icimsActivityId: 'ICIMS-123', // Has iCIMS, but no calendar
        confirmedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
      });
      await createBooking(booking);

      await service.runDetection();
      const jobs = await getReconciliationJobsByEntityId(booking.id);
      const calendarJob = jobs.find((j) => j.jobType === 'calendar_event_missing');
      expect(calendarJob).toBeDefined();

      const result = await service.processJob(calendarJob!);

      expect(result.success).toBe(true);
      expect(result.action).toContain('calendar event');

      const updated = await getBookingById(booking.id);
      expect(updated?.calendarEventId).toBeTruthy();
    });
  });
});

describe('getReconciliationService', () => {
  beforeEach(() => {
    resetDatabase();
  });

  it('returns a singleton instance', () => {
    const service1 = getReconciliationService();
    const service2 = getReconciliationService();
    expect(service1).toBe(service2);
  });
});
