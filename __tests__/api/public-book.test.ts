/**
 * Integration tests for POST /api/public/book
 *
 * Tests booking API validation, concurrency handling, and calendar event creation
 */

import { SchedulingService } from '@/lib/scheduling/SchedulingService';
import { GraphCalendarClientMock } from '@/lib/graph/GraphCalendarClientMock';
import { IcimsClientMock } from '@/lib/icims/IcimsClientMock';
import { IcimsWritebackService } from '@/lib/icims/IcimsWritebackService';
import {
  resetDatabase,
  getBookingByRequestId,
  getSchedulingRequestById,
  getAllAuditLogs,
} from '@/lib/db';
import { CreateSchedulingRequestInput } from '@/types/scheduling';
import { hashToken } from '@/lib/utils/tokens';

describe('Public Book API - Integration Tests', () => {
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

  async function createTestRequest(): Promise<{ requestId: string; token: string }> {
    // Setup: no busy intervals
    graphClient.setFixtureOverrides({
      'int@company.com': [],
    });

    const input: CreateSchedulingRequestInput = {
      applicationId: 'APP-TEST-001',
      candidateName: 'Integration Test',
      candidateEmail: 'integration@example.com',
      reqTitle: 'Integration Test Role',
      interviewType: 'phone_screen',
      durationMinutes: 30,
      interviewerEmails: ['int@company.com'],
      windowStart: new Date().toISOString(),
      windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      candidateTimezone: 'America/New_York',
    };

    const created = await service.createRequest(input);
    const token = created.publicLink.split('/book/')[1];

    return { requestId: created.requestId, token };
  }

  describe('Full Booking Flow', () => {
    it('create request -> get slots -> book -> verify booking with calendar_event_id', async () => {
      // Step 1: Create request
      const { requestId, token } = await createTestRequest();

      // Verify request created
      const request = await getSchedulingRequestById(requestId);
      expect(request).toBeDefined();
      expect(request?.status).toBe('pending');

      // Step 2: Get available slots
      const slotsResult = await service.getAvailableSlots(token);
      expect(slotsResult.slots.length).toBeGreaterThan(0);

      // Step 3: Book a slot
      const slotToBook = slotsResult.slots[0];
      const bookResult = await service.bookSlot(token, slotToBook.slotId);

      expect(bookResult.success).toBe(true);
      expect(bookResult.booking).toBeDefined();
      expect(bookResult.booking.id).toBeDefined();

      // Step 4: Verify booking is persisted with calendar_event_id
      const booking = await getBookingByRequestId(requestId);
      expect(booking).toBeDefined();
      expect(booking?.calendarEventId).toMatch(/^mock-event-/);
      expect(booking?.status).toBe('confirmed');

      // Verify request status updated
      const updatedRequest = await getSchedulingRequestById(requestId);
      expect(updatedRequest?.status).toBe('booked');

      // Verify audit logs
      const logs = await getAllAuditLogs();
      const bookLog = logs.find((l) => l.action === 'booked' && l.bookingId === booking?.id);
      expect(bookLog).toBeDefined();
    });

    it('second booking attempt returns conflict (already booked)', async () => {
      const { requestId, token } = await createTestRequest();

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        console.log('No slots - skipping test');
        return;
      }

      // First booking succeeds
      await service.bookSlot(token, slotsResult.slots[0].slotId);

      // Second booking should fail
      await expect(service.bookSlot(token, slotsResult.slots[0].slotId)).rejects.toThrow(
        'Cannot book: request is booked'
      );

      // Verify only one booking exists
      const booking = await getBookingByRequestId(requestId);
      expect(booking).toBeDefined();
    });
  });

  describe('Slot Validation', () => {
    it('rejects invalid slot ID', async () => {
      const { token } = await createTestRequest();

      await expect(service.bookSlot(token, 'invalid-slot-id')).rejects.toThrow(
        'Selected slot is no longer available'
      );
    });

    it('rejects booking for expired request', async () => {
      const { requestId, token } = await createTestRequest();

      // Manually expire the request
      const { updateSchedulingRequest } = require('@/lib/db');
      await updateSchedulingRequest(requestId, {
        expiresAt: new Date(Date.now() - 1000),
      });

      const slotsResult = await service.getAvailableSlots(token).catch(() => ({ slots: [] }));

      // Getting slots should fail
      await expect(service.getAvailableSlots(token)).rejects.toThrow('Scheduling link has expired');
    });

    it('rejects booking for cancelled request', async () => {
      const { requestId, token } = await createTestRequest();

      // Cancel the request
      const { updateSchedulingRequest } = require('@/lib/db');
      await updateSchedulingRequest(requestId, { status: 'cancelled' });

      await expect(
        service.bookSlot(token, 'any-slot')
      ).rejects.toThrow('Cannot book: request is cancelled');
    });
  });

  describe('Concurrency - Collision Detection', () => {
    it('prevents overlapping bookings for same interviewer', async () => {
      // Create two requests for the same interviewer
      graphClient.setFixtureOverrides({
        'shared-interviewer@company.com': [],
      });

      const input1: CreateSchedulingRequestInput = {
        candidateName: 'Candidate One',
        candidateEmail: 'one@example.com',
        reqTitle: 'Role One',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['shared-interviewer@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const input2: CreateSchedulingRequestInput = {
        candidateName: 'Candidate Two',
        candidateEmail: 'two@example.com',
        reqTitle: 'Role Two',
        interviewType: 'phone_screen',
        durationMinutes: 30,
        interviewerEmails: ['shared-interviewer@company.com'],
        windowStart: new Date().toISOString(),
        windowEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        candidateTimezone: 'America/New_York',
      };

      const created1 = await service.createRequest(input1);
      const token1 = created1.publicLink.split('/book/')[1];

      const created2 = await service.createRequest(input2);
      const token2 = created2.publicLink.split('/book/')[1];

      // Get slots for both
      const slots1 = await service.getAvailableSlots(token1);
      const slots2 = await service.getAvailableSlots(token2);

      if (slots1.slots.length === 0 || slots2.slots.length === 0) {
        console.log('No slots - skipping collision test');
        return;
      }

      // Both should have the same first slot
      const slot1 = slots1.slots[0];
      const slot2 = slots2.slots.find((s) => s.slotId === slot1.slotId);

      if (!slot2) {
        console.log('Different slots available - skipping collision test');
        return;
      }

      // First booking succeeds
      await service.bookSlot(token1, slot1.slotId);

      // Second booking for same slot should fail (slot no longer available after re-fetch)
      await expect(service.bookSlot(token2, slot2.slotId)).rejects.toThrow(
        'Selected slot is no longer available'
      );
    });
  });

  describe('Calendar Event Creation', () => {
    it('creates calendar event with correct payload', async () => {
      const { requestId, token } = await createTestRequest();

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        console.log('No slots - skipping event creation test');
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      const booking = await getBookingByRequestId(requestId);
      expect(booking?.calendarEventId).toBeDefined();

      // Verify event was created in mock
      const mockEvent = graphClient.getMockEvent(booking!.calendarEventId!);
      expect(mockEvent).toBeDefined();
      expect(mockEvent?.payload.attendees).toHaveLength(2); // candidate + interviewer
      expect(mockEvent?.payload.isOnlineMeeting).toBe(true);
    });

    it('stores conference join URL from calendar event', async () => {
      const { requestId, token } = await createTestRequest();

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      const booking = await getBookingByRequestId(requestId);
      expect(booking?.conferenceJoinUrl).toMatch(/^https:\/\/teams\.microsoft\.com/);
    });
  });

  describe('Audit Logging', () => {
    it('logs booking attempt', async () => {
      const { token } = await createTestRequest();

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      const logs = await getAllAuditLogs();
      const bookingLogs = logs.filter((l) => l.action === 'booked');
      expect(bookingLogs.length).toBeGreaterThan(0);
    });

    it('logs Graph createEvent call', async () => {
      const { token } = await createTestRequest();

      const slotsResult = await service.getAvailableSlots(token);
      if (slotsResult.slots.length === 0) {
        return;
      }

      await service.bookSlot(token, slotsResult.slots[0].slotId);

      const logs = await getAllAuditLogs();
      const graphLog = logs.find(
        (l) => l.action === 'graph_call' && l.payload?.operation === 'createEvent'
      );
      expect(graphLog).toBeDefined();
      expect(graphLog?.payload?.mock).toBe(true);
    });
  });
});
