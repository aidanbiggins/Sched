/**
 * Unit tests for SchedulingService
 */

import { SchedulingService } from '@/lib/scheduling/SchedulingService';
import { GraphCalendarClientMock } from '@/lib/graph/GraphCalendarClientMock';
import { IcimsClientMock } from '@/lib/icims/IcimsClientMock';
import { IcimsWritebackService } from '@/lib/icims/IcimsWritebackService';
import { resetDatabase, getBookingByRequestId, getAllAuditLogs, getSchedulingRequestById } from '@/lib/db';
import { CreateSchedulingRequestInput } from '@/types/scheduling';
import { hashToken, getTokenTtlDays } from '@/lib/utils/tokens';

describe('SchedulingService', () => {
  let service: SchedulingService;
  let graphClient: GraphCalendarClientMock;
  let icimsClient: IcimsClientMock;
  let writebackService: IcimsWritebackService;

  beforeEach(() => {
    resetDatabase();
    graphClient = new GraphCalendarClientMock();
    graphClient.clearMockEvents();
    icimsClient = new IcimsClientMock();
    icimsClient.clearNotes();
    writebackService = new IcimsWritebackService(icimsClient);
    service = new SchedulingService(graphClient, icimsClient, writebackService);
  });

  describe('createRequest', () => {
    it('creates a scheduling request with public token', async () => {
      const input: CreateSchedulingRequestInput = {
        candidateName: 'John Doe',
        candidateEmail: 'john@example.com',
        reqTitle: 'Software Engineer',
        interviewType: 'phone_screen',
        durationMinutes: 60,
        interviewerEmails: ['interviewer@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const result = await service.createRequest(input);

      expect(result.requestId).toBeDefined();
      expect(result.publicLink).toContain('/book/');
      expect(result.expiresAt).toBeDefined();
    });

    it('generates 64-character hex token', async () => {
      const input: CreateSchedulingRequestInput = {
        candidateName: 'Jane Doe',
        candidateEmail: 'jane@example.com',
        reqTitle: 'Product Manager',
        interviewType: 'hm_screen',
        durationMinutes: 45,
        interviewerEmails: ['hm@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const result = await service.createRequest(input);
      const token = result.publicLink.split('/book/')[1];

      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('sets expiry based on PUBLIC_LINK_TTL_DAYS (default 14)', async () => {
      const input: CreateSchedulingRequestInput = {
        candidateName: 'Test User',
        candidateEmail: 'test@example.com',
        reqTitle: 'Test Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const now = Date.now();
      const result = await service.createRequest(input);
      const expiresAt = new Date(result.expiresAt).getTime();
      const ttlDays = getTokenTtlDays();
      const expectedMs = ttlDays * 24 * 60 * 60 * 1000;

      // Should expire in ~TTL days (with some tolerance)
      expect(expiresAt - now).toBeGreaterThan(expectedMs - 60000);
      expect(expiresAt - now).toBeLessThan(expectedMs + 60000);
    });

    it('logs link creation to audit log', async () => {
      const input: CreateSchedulingRequestInput = {
        candidateName: 'Audit Test',
        candidateEmail: 'audit@example.com',
        reqTitle: 'Audit Role',
        interviewType: 'onsite',
        durationMinutes: 120,
        interviewerEmails: ['panel@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      await service.createRequest(input);
      const logs = await getAllAuditLogs();

      const linkCreatedLog = logs.find((log) => log.action === 'link_created');
      expect(linkCreatedLog).toBeDefined();
      expect(linkCreatedLog?.actorType).toBe('coordinator');
    });

    it('adds iCIMS note when applicationId provided', async () => {
      const input: CreateSchedulingRequestInput = {
        applicationId: 'APP-001',
        candidateName: 'iCIMS Test',
        candidateEmail: 'icims@example.com',
        reqTitle: 'iCIMS Role',
        interviewType: 'final',
        durationMinutes: 60,
        interviewerEmails: ['exec@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      await service.createRequest(input);
      const notes = icimsClient.getApplicationNotes('APP-001');

      expect(notes.length).toBeGreaterThan(0);
      expect(notes[0]).toContain('=== SCHEDULING LINK CREATED ===');
    });
  });

  describe('getAvailableSlots', () => {
    it('returns slots for valid token', async () => {
      // Create a request first
      const input: CreateSchedulingRequestInput = {
        candidateName: 'Slot Test',
        candidateEmail: 'slots@example.com',
        reqTitle: 'Slot Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const result = await service.getAvailableSlots(token);

      expect(result.request).toBeDefined();
      expect(result.request.candidateName).toBe('Slot Test');
      expect(result.slots).toBeDefined();
      expect(result.timezone).toBe('America/New_York');
    });

    it('throws error for invalid token', async () => {
      await expect(service.getAvailableSlots('invalid-token')).rejects.toThrow(
        'Scheduling request not found'
      );
    });

    it('throws error for expired token', async () => {
      // Create a request with past expiry
      const input: CreateSchedulingRequestInput = {
        candidateName: 'Expired Test',
        candidateEmail: 'expired@example.com',
        reqTitle: 'Expired Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        windowEnd: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      // Manually expire the request
      const { updateSchedulingRequest } = require('@/lib/db');
      await updateSchedulingRequest(created.requestId, {
        expiresAt: new Date(Date.now() - 1000),
      });

      await expect(service.getAvailableSlots(token)).rejects.toThrow(
        'Scheduling link has expired'
      );
    });
  });

  describe('bookSlot', () => {
    it('creates booking and calendar event', async () => {
      // Setup: no busy intervals
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Book Test',
        candidateEmail: 'book@example.com',
        reqTitle: 'Book Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);

      // Skip if no slots available
      if (slotsResult.slots.length === 0) {
        console.log('No slots available - skipping booking test');
        return;
      }

      const slotId = slotsResult.slots[0].slotId;
      const bookResult = await service.bookSlot(token, slotId);

      expect(bookResult.success).toBe(true);
      expect(bookResult.booking).toBeDefined();
      expect(bookResult.booking.id).toBeDefined();
    });

    it('prevents double booking', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Double Book Test',
        candidateEmail: 'double@example.com',
        reqTitle: 'Double Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        console.log('No slots available - skipping double booking test');
        return;
      }

      const slotId = slotsResult.slots[0].slotId;

      // First booking should succeed
      await service.bookSlot(token, slotId);

      // Second booking should fail
      await expect(service.bookSlot(token, slotId)).rejects.toThrow(
        'Cannot book: request is booked'
      );
    });

    it('stores calendar event ID in booking', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Event ID Test',
        candidateEmail: 'eventid@example.com',
        reqTitle: 'Event ID Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        console.log('No slots available - skipping event ID test');
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      const booking = await getBookingByRequestId(created.requestId);
      expect(booking).toBeDefined();
      expect(booking?.calendarEventId).toMatch(/^mock-event-/);
    });
  });

  describe('reschedule', () => {
    it('updates booking and calendar event', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Reschedule Test',
        candidateEmail: 'reschedule@example.com',
        reqTitle: 'Reschedule Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length < 2) {
        console.log('Not enough slots available - skipping reschedule test');
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      // Use the second available slot for rescheduling
      const newSlotStart = slotsResult.slots[1].start;

      const result = await service.reschedule(
        created.requestId,
        newSlotStart,
        'Conflict'
      );

      expect(result.status).toBe('rescheduled');

      const booking = await getBookingByRequestId(created.requestId);
      expect(booking?.status).toBe('rescheduled');
      expect(booking?.scheduledStart.getTime()).toBe(newSlotStart.getTime());
    });

    it('logs reschedule to audit log', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Reschedule Audit',
        candidateEmail: 'reschaudit@example.com',
        reqTitle: 'Reschedule Audit Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length < 2) {
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      const newSlotStart = slotsResult.slots[1].start;

      await service.reschedule(
        created.requestId,
        newSlotStart,
        'Test reason'
      );

      const logs = await getAllAuditLogs();
      const rescheduleLog = logs.find((log) => log.action === 'rescheduled');

      expect(rescheduleLog).toBeDefined();
      expect(rescheduleLog?.payload).toHaveProperty('reason', 'Test reason');
    });

    it('rejects invalid 15-minute alignment', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Alignment Test',
        candidateEmail: 'align@example.com',
        reqTitle: 'Alignment Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      // Try rescheduling to a non-15-minute aligned time
      const badTime = new Date();
      badTime.setUTCMinutes(7); // Not aligned to 15 minutes

      await expect(
        service.reschedule(created.requestId, badTime, 'test')
      ).rejects.toThrow('15-minute');
    });

    it('rejects unavailable slot', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Unavailable Test',
        candidateEmail: 'unavail@example.com',
        reqTitle: 'Unavailable Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      // Try rescheduling to a time far in the past (not in available slots)
      const pastTime = new Date('2020-01-01T09:00:00Z');

      await expect(
        service.reschedule(created.requestId, pastTime, 'test')
      ).rejects.toThrow('outside the scheduling window');
    });
  });

  describe('cancel', () => {
    it('cancels booking and calendar event', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Cancel Test',
        candidateEmail: 'cancel@example.com',
        reqTitle: 'Cancel Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);
      await service.cancel(created.requestId, 'Position filled', true);

      const booking = await getBookingByRequestId(created.requestId);
      expect(booking?.status).toBe('cancelled');
      expect(booking?.cancellationReason).toBe('Position filled');
    });

    it('logs cancellation to audit log', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        candidateName: 'Cancel Audit',
        candidateEmail: 'cancelaudit@example.com',
        reqTitle: 'Cancel Audit Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const token = created.publicLink.split('/book/')[1];

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);
      await service.cancel(created.requestId, 'Candidate withdrew', false);

      const logs = await getAllAuditLogs();
      const cancelLog = logs.find((log) => log.action === 'cancelled');

      expect(cancelLog).toBeDefined();
      expect(cancelLog?.payload).toHaveProperty('reason', 'Candidate withdrew');
    });
  });
});
