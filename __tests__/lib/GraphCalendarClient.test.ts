/**
 * Unit tests for GraphCalendarClient
 */

import {
  GraphCalendarClientMock,
  parseGetScheduleResponse,
} from '@/lib/graph/GraphCalendarClientMock';
import { GraphGetScheduleResponse } from '@/lib/graph/types';
import { resetDatabase } from '@/lib/db';

describe('GraphCalendarClientMock', () => {
  let client: GraphCalendarClientMock;

  beforeEach(() => {
    resetDatabase();
    client = new GraphCalendarClientMock();
    client.clearMockEvents();
  });

  describe('getSchedule', () => {
    it('returns availability for requested emails', async () => {
      const emails = ['user1@test.com', 'user2@test.com'];
      const start = new Date();
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

      const result = await client.getSchedule(emails, start, end, 15);

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('user1@test.com');
      expect(result[1].email).toBe('user2@test.com');
    });

    it('returns busy intervals within the query window', async () => {
      const start = new Date();
      const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);

      const result = await client.getSchedule(['user@test.com'], start, end, 15);

      // Should have some default busy intervals
      expect(result[0].busyIntervals).toBeDefined();
      expect(Array.isArray(result[0].busyIntervals)).toBe(true);
    });

    it('includes working hours in response', async () => {
      const start = new Date();
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

      const result = await client.getSchedule(['user@test.com'], start, end, 15);

      expect(result[0].workingHours).toBeDefined();
      expect(result[0].workingHours.start).toBe('09:00');
      expect(result[0].workingHours.end).toBe('17:00');
    });

    it('respects fixture overrides', async () => {
      const customBusy = [
        {
          start: new Date('2026-01-15T14:00:00Z'),
          end: new Date('2026-01-15T15:00:00Z'),
          status: 'busy' as const,
          isPrivate: false,
        },
      ];

      client.setFixtureOverrides({
        'custom@test.com': customBusy,
      });

      const result = await client.getSchedule(
        ['custom@test.com'],
        new Date('2026-01-15T00:00:00Z'),
        new Date('2026-01-16T00:00:00Z'),
        15
      );

      expect(result[0].busyIntervals).toHaveLength(1);
      expect(result[0].busyIntervals[0].status).toBe('busy');
    });
  });

  describe('createEvent', () => {
    it('creates an event and returns event details', async () => {
      const payload = {
        subject: 'Test Interview',
        body: { contentType: 'HTML' as const, content: '<p>Test</p>' },
        start: new Date('2026-01-15T14:00:00Z'),
        end: new Date('2026-01-15T15:00:00Z'),
        timeZone: 'America/New_York',
        attendees: [{ email: 'candidate@test.com', name: 'Candidate', type: 'required' as const }],
        isOnlineMeeting: true,
        transactionId: 'tx-123',
      };

      const result = await client.createEvent('organizer@test.com', payload);

      expect(result.eventId).toMatch(/^mock-event-/);
      expect(result.joinUrl).toBeTruthy(); // Should have Teams link since isOnlineMeeting=true
      expect(result.iCalUId).toBeTruthy();
    });

    it('stores event for later retrieval', async () => {
      const payload = {
        subject: 'Test Interview',
        body: { contentType: 'HTML' as const, content: '<p>Test</p>' },
        start: new Date('2026-01-15T14:00:00Z'),
        end: new Date('2026-01-15T15:00:00Z'),
        timeZone: 'America/New_York',
        attendees: [],
        isOnlineMeeting: false,
        transactionId: 'tx-456',
      };

      const result = await client.createEvent('organizer@test.com', payload);
      const stored = client.getMockEvent(result.eventId);

      expect(stored).toBeDefined();
      expect(stored?.payload.subject).toBe('Test Interview');
    });

    it('does not include join URL when isOnlineMeeting is false', async () => {
      const payload = {
        subject: 'In-Person Interview',
        body: { contentType: 'HTML' as const, content: '<p>Test</p>' },
        start: new Date('2026-01-15T14:00:00Z'),
        end: new Date('2026-01-15T15:00:00Z'),
        timeZone: 'America/New_York',
        attendees: [],
        isOnlineMeeting: false,
        transactionId: 'tx-789',
      };

      const result = await client.createEvent('organizer@test.com', payload);

      expect(result.joinUrl).toBeNull();
    });
  });

  describe('updateEvent', () => {
    it('updates an existing event', async () => {
      // First create an event
      const createPayload = {
        subject: 'Original Subject',
        body: { contentType: 'HTML' as const, content: '<p>Test</p>' },
        start: new Date('2026-01-15T14:00:00Z'),
        end: new Date('2026-01-15T15:00:00Z'),
        timeZone: 'America/New_York',
        attendees: [],
        isOnlineMeeting: false,
        transactionId: 'tx-update-1',
      };

      const created = await client.createEvent('organizer@test.com', createPayload);

      // Update it
      await client.updateEvent('organizer@test.com', created.eventId, {
        start: new Date('2026-01-16T14:00:00Z'),
        end: new Date('2026-01-16T15:00:00Z'),
      });

      const stored = client.getMockEvent(created.eventId);
      expect(stored?.payload.start.toISOString()).toBe('2026-01-16T14:00:00.000Z');
    });

    it('throws error for non-existent event', async () => {
      await expect(
        client.updateEvent('organizer@test.com', 'non-existent', {
          start: new Date(),
        })
      ).rejects.toThrow('Event not found');
    });
  });

  describe('cancelEvent', () => {
    it('marks an event as cancelled', async () => {
      // First create an event
      const createPayload = {
        subject: 'To Be Cancelled',
        body: { contentType: 'HTML' as const, content: '<p>Test</p>' },
        start: new Date('2026-01-15T14:00:00Z'),
        end: new Date('2026-01-15T15:00:00Z'),
        timeZone: 'America/New_York',
        attendees: [],
        isOnlineMeeting: false,
        transactionId: 'tx-cancel-1',
      };

      const created = await client.createEvent('organizer@test.com', createPayload);

      // Cancel it
      await client.cancelEvent('organizer@test.com', created.eventId, 'Position filled');

      const stored = client.getMockEvent(created.eventId);
      expect(stored?.cancelled).toBe(true);
    });

    it('throws error for non-existent event', async () => {
      await expect(
        client.cancelEvent('organizer@test.com', 'non-existent', 'Test')
      ).rejects.toThrow('Event not found');
    });
  });
});

describe('parseGetScheduleResponse', () => {
  it('parses Graph API response correctly', () => {
    const response: GraphGetScheduleResponse = {
      value: [
        {
          scheduleId: 'user@test.com',
          availabilityView: '000022220000',
          scheduleItems: [
            {
              status: 'busy',
              start: { dateTime: '2026-01-15T14:00:00', timeZone: 'UTC' },
              end: { dateTime: '2026-01-15T15:00:00', timeZone: 'UTC' },
              isPrivate: false,
            },
          ],
          workingHours: {
            startTime: '09:00:00.0000000',
            endTime: '17:00:00.0000000',
            timeZone: { name: 'America/New_York' },
            daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
          },
        },
      ],
    };

    const result = parseGetScheduleResponse(response);

    expect(result).toHaveLength(1);
    expect(result[0].email).toBe('user@test.com');
    expect(result[0].busyIntervals).toHaveLength(1);
    expect(result[0].busyIntervals[0].status).toBe('busy');
    expect(result[0].workingHours.start).toBe('09:00');
    expect(result[0].workingHours.end).toBe('17:00');
    expect(result[0].workingHours.daysOfWeek).toContain(1); // Monday
  });

  it('filters out free slots', () => {
    const response: GraphGetScheduleResponse = {
      value: [
        {
          scheduleId: 'user@test.com',
          availabilityView: '0000',
          scheduleItems: [
            {
              status: 'free',
              start: { dateTime: '2026-01-15T14:00:00', timeZone: 'UTC' },
              end: { dateTime: '2026-01-15T15:00:00', timeZone: 'UTC' },
            },
          ],
        },
      ],
    };

    const result = parseGetScheduleResponse(response);

    expect(result[0].busyIntervals).toHaveLength(0);
  });

  it('marks private events correctly', () => {
    const response: GraphGetScheduleResponse = {
      value: [
        {
          scheduleId: 'user@test.com',
          availabilityView: '2222',
          scheduleItems: [
            {
              status: 'busy',
              start: { dateTime: '2026-01-15T14:00:00', timeZone: 'UTC' },
              end: { dateTime: '2026-01-15T15:00:00', timeZone: 'UTC' },
              isPrivate: true,
            },
          ],
        },
      ],
    };

    const result = parseGetScheduleResponse(response);

    expect(result[0].busyIntervals[0].isPrivate).toBe(true);
  });
});
