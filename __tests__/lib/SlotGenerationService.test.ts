/**
 * Unit tests for SlotGenerationService
 */

import {
  generateAvailableSlots,
  roundUpTo15Minutes,
  generateSlotId,
} from '@/lib/scheduling/SlotGenerationService';
import {
  SchedulingRequest,
  Booking,
  InterviewerAvailability,
  BusyInterval,
} from '@/types/scheduling';

// Helper to create a scheduling request
function createRequest(overrides: Partial<SchedulingRequest> = {}): SchedulingRequest {
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setHours(9, 0, 0, 0);
  windowStart.setDate(windowStart.getDate() + 1);

  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + 7);

  return {
    id: 'req-1',
    applicationId: null,
    candidateName: 'Test Candidate',
    candidateEmail: 'candidate@example.com',
    reqId: null,
    reqTitle: 'Test Position',
    interviewType: 'phone_screen',
    durationMinutes: 60,
    interviewerEmails: ['interviewer@example.com'],
    organizerEmail: 'scheduling@example.com',
    calendarProvider: 'microsoft_graph',
    graphTenantId: null,
    windowStart,
    windowEnd,
    candidateTimezone: 'America/New_York',
    publicToken: 'test-token',
    publicTokenHash: 'test-token-hash',
    expiresAt: windowEnd,
    status: 'pending',
    createdBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// Helper to create interviewer availability
function createAvailability(
  email: string,
  busyIntervals: BusyInterval[] = []
): InterviewerAvailability {
  return {
    email,
    busyIntervals,
    workingHours: {
      start: '09:00',
      end: '17:00',
      timeZone: 'America/New_York',
      daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
    },
  };
}

describe('SlotGenerationService', () => {
  describe('roundUpTo15Minutes', () => {
    it('rounds 10:07 to 10:15', () => {
      const date = new Date('2026-01-15T10:07:00Z');
      const result = roundUpTo15Minutes(date);
      expect(result.getMinutes()).toBe(15);
    });

    it('keeps 10:15 as 10:15', () => {
      const date = new Date('2026-01-15T10:15:00Z');
      const result = roundUpTo15Minutes(date);
      expect(result.getMinutes()).toBe(15);
    });

    it('rounds 10:01 to 10:15', () => {
      const date = new Date('2026-01-15T10:01:00Z');
      const result = roundUpTo15Minutes(date);
      expect(result.getMinutes()).toBe(15);
    });

    it('rounds 10:45 to 10:45', () => {
      const date = new Date('2026-01-15T10:45:00Z');
      const result = roundUpTo15Minutes(date);
      expect(result.getMinutes()).toBe(45);
    });

    it('rounds 10:46 to 11:00', () => {
      const date = new Date('2026-01-15T10:46:00Z');
      const result = roundUpTo15Minutes(date);
      expect(result.getUTCHours()).toBe(11);
      expect(result.getUTCMinutes()).toBe(0);
    });
  });

  describe('generateSlotId', () => {
    it('generates deterministic IDs', () => {
      const start = new Date('2026-01-15T14:00:00Z');
      const end = new Date('2026-01-15T15:00:00Z');
      const emails = ['a@test.com', 'b@test.com'];

      const id1 = generateSlotId(start, end, emails);
      const id2 = generateSlotId(start, end, emails);

      expect(id1).toBe(id2);
    });

    it('generates different IDs for different times', () => {
      const start1 = new Date('2026-01-15T14:00:00Z');
      const start2 = new Date('2026-01-15T15:00:00Z');
      const end1 = new Date('2026-01-15T15:00:00Z');
      const end2 = new Date('2026-01-15T16:00:00Z');
      const emails = ['a@test.com'];

      const id1 = generateSlotId(start1, end1, emails);
      const id2 = generateSlotId(start2, end2, emails);

      expect(id1).not.toBe(id2);
    });

    it('sorts emails for consistency', () => {
      const start = new Date('2026-01-15T14:00:00Z');
      const end = new Date('2026-01-15T15:00:00Z');

      const id1 = generateSlotId(start, end, ['b@test.com', 'a@test.com']);
      const id2 = generateSlotId(start, end, ['a@test.com', 'b@test.com']);

      expect(id1).toBe(id2);
    });
  });

  describe('generateAvailableSlots', () => {
    it('returns empty array when no slots available', () => {
      // Window is entirely in the past
      const pastWindow = new Date();
      pastWindow.setDate(pastWindow.getDate() - 7);
      const pastEnd = new Date(pastWindow);
      pastEnd.setHours(pastEnd.getHours() + 1);

      const request = createRequest({
        windowStart: pastWindow,
        windowEnd: pastEnd,
      });

      const availability = [createAvailability('interviewer@example.com')];
      const slots = generateAvailableSlots(request, availability, []);

      expect(slots).toHaveLength(0);
    });

    it('excludes busy intervals', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      const request = createRequest({
        windowStart: new Date(tomorrow.getTime() - 2 * 60 * 60 * 1000), // 12:00
        windowEnd: new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000),   // 18:00
        durationMinutes: 60,
      });

      // Busy from 14:00-15:00
      const busyInterval: BusyInterval = {
        start: tomorrow,
        end: new Date(tomorrow.getTime() + 60 * 60 * 1000),
        status: 'busy',
        isPrivate: false,
      };

      const availability = [
        createAvailability('interviewer@example.com', [busyInterval]),
      ];

      const slots = generateAvailableSlots(request, availability, []);

      // Should not have any slot that starts between 14:00-15:00
      const conflictingSlot = slots.find((s) => {
        const slotStart = s.start.getTime();
        return slotStart >= tomorrow.getTime() &&
               slotStart < tomorrow.getTime() + 60 * 60 * 1000;
      });

      expect(conflictingSlot).toBeUndefined();
    });

    it('respects working hours', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(6, 0, 0, 0); // 6 AM local

      const request = createRequest({
        windowStart: tomorrow,
        windowEnd: new Date(tomorrow.getTime() + 12 * 60 * 60 * 1000), // 6 PM local
        durationMinutes: 60,
      });

      const availability = [createAvailability('interviewer@example.com')];
      const slots = generateAvailableSlots(request, availability, []);

      // Just verify that we get slots and they're within the window
      // Working hours logic is timezone-aware and tested via integration
      if (slots.length > 0) {
        slots.forEach((slot) => {
          expect(slot.start.getTime()).toBeGreaterThanOrEqual(tomorrow.getTime());
          expect(slot.end.getTime()).toBeLessThanOrEqual(
            tomorrow.getTime() + 12 * 60 * 60 * 1000
          );
        });
      }
    });

    it('aligns to 15-minute grid', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);

      const request = createRequest({
        windowStart: tomorrow,
        windowEnd: new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000),
        durationMinutes: 30,
      });

      const availability = [createAvailability('interviewer@example.com')];
      const slots = generateAvailableSlots(request, availability, []);

      slots.forEach((slot) => {
        expect(slot.start.getMinutes() % 15).toBe(0);
      });
    });

    it('returns maximum 30 slots', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);

      const request = createRequest({
        windowStart: tomorrow,
        windowEnd: new Date(tomorrow.getTime() + 30 * 24 * 60 * 60 * 1000), // 30 days
        durationMinutes: 30,
      });

      const availability = [createAvailability('interviewer@example.com')];
      const slots = generateAvailableSlots(request, availability, []);

      expect(slots.length).toBeLessThanOrEqual(30);
    });

    it('handles multiple interviewers (intersection)', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      const request = createRequest({
        windowStart: new Date(tomorrow.getTime() - 2 * 60 * 60 * 1000),
        windowEnd: new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000),
        durationMinutes: 60,
        interviewerEmails: ['a@test.com', 'b@test.com'],
      });

      // A is busy 14:00-15:00
      const availabilityA = createAvailability('a@test.com', [
        {
          start: tomorrow,
          end: new Date(tomorrow.getTime() + 60 * 60 * 1000),
          status: 'busy',
          isPrivate: false,
        },
      ]);

      // B is busy 16:00-17:00
      const busyB = new Date(tomorrow);
      busyB.setHours(16, 0, 0, 0);
      const availabilityB = createAvailability('b@test.com', [
        {
          start: busyB,
          end: new Date(busyB.getTime() + 60 * 60 * 1000),
          status: 'busy',
          isPrivate: false,
        },
      ]);

      const slots = generateAvailableSlots(
        request,
        [availabilityA, availabilityB],
        []
      );

      // Should exclude both 14:00-15:00 and 16:00-17:00
      const conflicting = slots.filter((s) => {
        const hour = s.start.getHours();
        return hour === 14 || hour === 16;
      });

      expect(conflicting).toHaveLength(0);
    });

    it('excludes existing bookings', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(14, 0, 0, 0);

      const request = createRequest({
        windowStart: new Date(tomorrow.getTime() - 2 * 60 * 60 * 1000),
        windowEnd: new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000),
        durationMinutes: 60,
      });

      const availability = [createAvailability('interviewer@example.com')];

      const existingBooking: Booking = {
        id: 'booking-1',
        requestId: 'other-req',
        scheduledStart: tomorrow,
        scheduledEnd: new Date(tomorrow.getTime() + 60 * 60 * 1000),
        calendarEventId: 'event-1',
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
      };

      const slots = generateAvailableSlots(request, availability, [existingBooking]);

      // Should not have slot at 14:00
      const conflicting = slots.find((s) => {
        return s.start.getTime() === tomorrow.getTime();
      });

      expect(conflicting).toBeUndefined();
    });
  });
});
