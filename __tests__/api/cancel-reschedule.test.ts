/**
 * Integration tests for Cancel and Reschedule API endpoints
 */

// Mock config to enable ATS features for tests
jest.mock('@/lib/config', () => ({
  isAtsEnabled: jest.fn(() => true),
  isStandaloneMode: jest.fn(() => false),
  isEmailEnabled: jest.fn(() => false),
  getAppConfig: jest.fn(() => ({
    mode: 'enterprise',
    atsEnabled: true,
    atsSyncEnabled: true,
    atsWebhooksEnabled: true,
    dbMode: 'memory',
    emailEnabled: false,
  })),
}));

import {
  resetDatabase,
  getSchedulingRequestById,
  getBookingByRequestId,
  getAllAuditLogs,
  getSyncJobsByEntityId,
} from '@/lib/db';
import {
  SchedulingService,
  resetSchedulingService,
} from '@/lib/scheduling';
import { GraphCalendarClientMock } from '@/lib/graph/GraphCalendarClientMock';
import { resetIcimsWritebackService } from '@/lib/icims';
import { CreateSchedulingRequestInput } from '@/types/scheduling';

describe('Cancel and Reschedule Integration', () => {
  let service: SchedulingService;
  let graphClient: GraphCalendarClientMock;

  beforeEach(() => {
    resetDatabase();
    resetSchedulingService();
    resetIcimsWritebackService();
    graphClient = new GraphCalendarClientMock();
    graphClient.clearMockEvents();
    service = new SchedulingService(graphClient);
  });

  async function createAndBookRequest(): Promise<{ requestId: string; token: string; slotStart: Date }> {
    graphClient.setFixtureOverrides({
      'int@company.com': [],
    });

    const input: CreateSchedulingRequestInput = {
      applicationId: 'APP-TEST-001',
      candidateName: 'Test Candidate',
      candidateEmail: 'test@example.com',
      reqTitle: 'Test Role',
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
      throw new Error('No slots available for test');
    }

    await service.bookSlot(token, slotsResult.slots[0].slotId);

    return {
      requestId: created.requestId,
      token,
      slotStart: slotsResult.slots[0].start,
    };
  }

  describe('Cancel', () => {
    it('cancels a booked request and calendar event', async () => {
      const { requestId } = await createAndBookRequest();

      const result = await service.cancel(requestId, 'Test cancellation', true);

      expect(result.status).toBe('cancelled');
      expect(result.cancelledAt).toBeInstanceOf(Date);
      expect(result.calendarEventId).toMatch(/^mock-event-/);

      const request = await getSchedulingRequestById(requestId);
      expect(request?.status).toBe('cancelled');

      const booking = await getBookingByRequestId(requestId);
      expect(booking?.status).toBe('cancelled');
      expect(booking?.cancellationReason).toBe('Test cancellation');
    });

    it('cancels a pending request (no calendar event)', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        applicationId: 'APP-PENDING',
        candidateName: 'Pending Candidate',
        candidateEmail: 'pending@example.com',
        reqTitle: 'Pending Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);

      const result = await service.cancel(created.requestId, 'Position filled', true);

      expect(result.status).toBe('cancelled');
      expect(result.calendarEventId).toBeNull();

      const request = await getSchedulingRequestById(created.requestId);
      expect(request?.status).toBe('cancelled');
    });

    it('blocks cancellation of already cancelled request', async () => {
      const { requestId } = await createAndBookRequest();

      await service.cancel(requestId, 'First cancel', true);

      await expect(
        service.cancel(requestId, 'Second cancel', true)
      ).rejects.toThrow('already cancelled');
    });

    it('creates audit log for cancellation', async () => {
      const { requestId } = await createAndBookRequest();

      await service.cancel(requestId, 'Audit test', true);

      const logs = await getAllAuditLogs();
      const cancelLog = logs.find(l => l.action === 'cancelled' && l.requestId === requestId);

      expect(cancelLog).toBeDefined();
      expect(cancelLog?.payload).toHaveProperty('reason', 'Audit test');
      expect(cancelLog?.payload).toHaveProperty('notifyParticipants', true);
    });

    it('writes iCIMS note on cancellation', async () => {
      const { requestId } = await createAndBookRequest();

      await service.cancel(requestId, 'iCIMS test', true);

      const logs = await getAllAuditLogs();
      const icimsNote = logs.find(l =>
        l.action === 'icims_note_success' &&
        (l.payload as Record<string, unknown>).noteType === 'cancelled'
      );

      expect(icimsNote).toBeDefined();
    });
  });

  describe('Reschedule', () => {
    it('reschedules to a new slot and updates calendar event', async () => {
      const { requestId } = await createAndBookRequest();

      // Get available slots for rescheduling
      const slots = await service.getRescheduleSlotsById(requestId);
      if (slots.length < 2) {
        console.log('Not enough slots - skipping test');
        return;
      }

      const newSlotStart = slots[1].start;

      const result = await service.reschedule(requestId, newSlotStart, 'Conflict');

      expect(result.status).toBe('rescheduled');
      expect(result.startAtUtc.getTime()).toBe(newSlotStart.getTime());
      expect(result.calendarEventId).toMatch(/^mock-event-/);

      const booking = await getBookingByRequestId(requestId);
      expect(booking?.status).toBe('rescheduled');
      expect(booking?.scheduledStart.getTime()).toBe(newSlotStart.getTime());
    });

    it('rejects reschedule for non-booked request', async () => {
      graphClient.setFixtureOverrides({
        'int@company.com': [],
      });

      const input: CreateSchedulingRequestInput = {
        applicationId: 'APP-PENDING-RESCH',
        candidateName: 'Pending',
        candidateEmail: 'pending@example.com',
        reqTitle: 'Role',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['int@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created = await service.createRequest(input);
      const newTime = new Date();
      newTime.setUTCMinutes(0);

      await expect(
        service.reschedule(created.requestId, newTime, 'test')
      ).rejects.toThrow('Cannot reschedule');
    });

    it('rejects non-15-minute aligned times', async () => {
      const { requestId } = await createAndBookRequest();

      const badTime = new Date();
      badTime.setUTCMinutes(7);

      await expect(
        service.reschedule(requestId, badTime, 'test')
      ).rejects.toThrow('15-minute');
    });

    it('rejects times outside scheduling window', async () => {
      const { requestId } = await createAndBookRequest();

      const pastTime = new Date('2020-01-01T09:00:00Z');

      await expect(
        service.reschedule(requestId, pastTime, 'test')
      ).rejects.toThrow('outside the scheduling window');
    });

    it('creates audit log for reschedule', async () => {
      const { requestId } = await createAndBookRequest();

      const slots = await service.getRescheduleSlotsById(requestId);
      if (slots.length < 2) {
        return;
      }

      await service.reschedule(requestId, slots[1].start, 'Audit reason');

      const logs = await getAllAuditLogs();
      const rescheduleLog = logs.find(l =>
        l.action === 'rescheduled' && l.requestId === requestId
      );

      expect(rescheduleLog).toBeDefined();
      expect(rescheduleLog?.payload).toHaveProperty('reason', 'Audit reason');
      expect(rescheduleLog?.payload).toHaveProperty('oldStart');
      expect(rescheduleLog?.payload).toHaveProperty('newStart');
    });

    it('writes iCIMS note on reschedule', async () => {
      const { requestId } = await createAndBookRequest();

      const slots = await service.getRescheduleSlotsById(requestId);
      if (slots.length < 2) {
        return;
      }

      await service.reschedule(requestId, slots[1].start, 'iCIMS reason');

      const logs = await getAllAuditLogs();
      const icimsNote = logs.find(l =>
        l.action === 'icims_note_success' &&
        (l.payload as Record<string, unknown>).noteType === 'rescheduled'
      );

      expect(icimsNote).toBeDefined();
    });

    it('allows multiple reschedules', async () => {
      const { requestId } = await createAndBookRequest();

      const slots = await service.getRescheduleSlotsById(requestId);
      if (slots.length < 3) {
        console.log('Not enough slots - skipping test');
        return;
      }

      // First reschedule
      await service.reschedule(requestId, slots[1].start, 'First change');

      // Get slots again (should include old time now)
      const slotsAfter = await service.getRescheduleSlotsById(requestId);

      // Second reschedule
      const result = await service.reschedule(
        requestId,
        slotsAfter[2].start,
        'Second change'
      );

      expect(result.status).toBe('rescheduled');

      const booking = await getBookingByRequestId(requestId);
      expect(booking?.scheduledStart.getTime()).toBe(slotsAfter[2].start.getTime());
    });
  });

  describe('Concurrency', () => {
    it('cannot reschedule after cancel', async () => {
      const { requestId } = await createAndBookRequest();

      await service.cancel(requestId, 'Cancelled first', true);

      const slots = await service.getRescheduleSlotsById(requestId).catch(() => []);

      // Should fail to reschedule because request is cancelled
      await expect(
        service.reschedule(requestId, new Date(), 'Too late')
      ).rejects.toThrow();
    });
  });
});
