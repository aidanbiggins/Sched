/**
 * GraphCalendarClientMock
 *
 * Mock implementation of GraphCalendarClient for local development and testing.
 * Uses fixture files for deterministic responses.
 */

import { v4 as uuidv4 } from 'uuid';
import { DateTime } from 'luxon';
import { GraphCalendarClient } from './GraphCalendarClient';
import {
  InterviewerAvailability,
  BusyInterval,
  CreatedEvent,
  CreateEventPayload,
  UpdateEventPayload,
  AuditLog,
} from '@/types/scheduling';
import { createAuditLog } from '@/lib/db';
import {
  GraphGetScheduleResponse,
  GraphScheduleInformation,
} from './types';

// ============================================
// Default Fixture Data
// ============================================

const DEFAULT_BUSY_INTERVALS: Record<string, BusyInterval[]> = {
  // Default: some busy slots
  'default': [
    {
      start: DateTime.now().plus({ hours: 2 }).startOf('hour').toJSDate(),
      end: DateTime.now().plus({ hours: 3 }).startOf('hour').toJSDate(),
      status: 'busy',
      isPrivate: false,
    },
    {
      start: DateTime.now().plus({ days: 1, hours: 3 }).startOf('hour').toJSDate(),
      end: DateTime.now().plus({ days: 1, hours: 4 }).startOf('hour').toJSDate(),
      status: 'busy',
      isPrivate: false,
    },
  ],
};

const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '17:00',
  timeZone: 'America/New_York',
  daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
};

// In-memory store for created events
const mockEvents: Map<string, {
  eventId: string;
  organizerEmail: string;
  payload: CreateEventPayload;
  iCalUId: string;
  joinUrl: string | null;
  cancelled: boolean;
}> = new Map();

export class GraphCalendarClientMock implements GraphCalendarClient {
  private fixtureOverrides: Record<string, BusyInterval[]> = {};

  /**
   * Set fixture overrides for specific emails (useful for testing)
   */
  setFixtureOverrides(overrides: Record<string, BusyInterval[]>): void {
    this.fixtureOverrides = overrides;
  }

  /**
   * Get free/busy schedule for multiple users
   */
  async getSchedule(
    emails: string[],
    startUtc: Date,
    endUtc: Date,
    intervalMinutes: number
  ): Promise<InterviewerAvailability[]> {
    // Log the call
    await this.logGraphCall('getSchedule', {
      emails,
      startUtc: startUtc.toISOString(),
      endUtc: endUtc.toISOString(),
      intervalMinutes,
    });

    const results: InterviewerAvailability[] = [];

    for (const email of emails) {
      // Check for fixture overrides first
      let busyIntervals = this.fixtureOverrides[email.toLowerCase()];

      // Fall back to default intervals
      if (!busyIntervals) {
        busyIntervals = DEFAULT_BUSY_INTERVALS['default'].map(bi => ({
          ...bi,
          // Adjust times relative to the query window
          start: new Date(Math.max(bi.start.getTime(), startUtc.getTime())),
          end: new Date(Math.min(bi.end.getTime(), endUtc.getTime())),
        })).filter(bi => bi.start < bi.end);
      }

      // Filter to only intervals within the query window
      const filteredIntervals = busyIntervals.filter(
        (bi) => bi.start < endUtc && bi.end > startUtc
      );

      results.push({
        email,
        busyIntervals: filteredIntervals,
        workingHours: DEFAULT_WORKING_HOURS,
      });
    }

    return results;
  }

  /**
   * Create a calendar event
   */
  async createEvent(
    organizerEmail: string,
    payload: CreateEventPayload
  ): Promise<CreatedEvent> {
    const eventId = `mock-event-${uuidv4()}`;
    const iCalUId = `${uuidv4()}@mock.calendar`;
    const joinUrl = payload.isOnlineMeeting
      ? `https://teams.microsoft.com/l/meetup-join/mock-meeting-${uuidv4()}`
      : null;

    // Store the event
    mockEvents.set(eventId, {
      eventId,
      organizerEmail,
      payload,
      iCalUId,
      joinUrl,
      cancelled: false,
    });

    // Log the call
    await this.logGraphCall('createEvent', {
      organizerEmail,
      eventId,
      subject: payload.subject,
      start: payload.start.toISOString(),
      end: payload.end.toISOString(),
      attendees: payload.attendees.map((a) => a.email),
      isOnlineMeeting: payload.isOnlineMeeting,
      transactionId: payload.transactionId,
    });

    return {
      eventId,
      iCalUId,
      joinUrl,
      webLink: `https://outlook.office.com/calendar/item/${eventId}`,
    };
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(
    organizerEmail: string,
    eventId: string,
    payload: UpdateEventPayload
  ): Promise<void> {
    const existing = mockEvents.get(eventId);
    if (!existing) {
      throw new Error(`Event not found: ${eventId}`);
    }

    if (existing.cancelled) {
      throw new Error(`Event has been cancelled: ${eventId}`);
    }

    // Update the stored event
    if (payload.start) {
      existing.payload.start = payload.start;
    }
    if (payload.end) {
      existing.payload.end = payload.end;
    }
    if (payload.subject) {
      existing.payload.subject = payload.subject;
    }

    // Log the call
    await this.logGraphCall('updateEvent', {
      organizerEmail,
      eventId,
      updates: {
        start: payload.start?.toISOString(),
        end: payload.end?.toISOString(),
        subject: payload.subject,
      },
    });
  }

  /**
   * Cancel (delete) a calendar event
   */
  async cancelEvent(
    organizerEmail: string,
    eventId: string,
    cancelMessage?: string
  ): Promise<void> {
    const existing = mockEvents.get(eventId);
    if (!existing) {
      throw new Error(`Event not found: ${eventId}`);
    }

    // Mark as cancelled
    existing.cancelled = true;

    // Log the call
    await this.logGraphCall('cancelEvent', {
      organizerEmail,
      eventId,
      cancelMessage,
    });
  }

  /**
   * Helper to log Graph API calls to audit log
   */
  private async logGraphCall(
    operation: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const log: AuditLog = {
      id: uuidv4(),
      requestId: null,
      bookingId: null,
      action: 'graph_call',
      actorType: 'system',
      actorId: null,
      payload: {
        operation,
        ...payload,
        mock: true,
      },
      createdAt: new Date(),
    };

    await createAuditLog(log);
  }

  /**
   * Get a stored mock event (for testing)
   */
  getMockEvent(eventId: string) {
    return mockEvents.get(eventId);
  }

  /**
   * Clear all mock events (for testing)
   */
  clearMockEvents(): void {
    mockEvents.clear();
  }
}

/**
 * Parse a Graph API getSchedule response into our internal format
 * This would be used by the real client
 */
export function parseGetScheduleResponse(
  response: GraphGetScheduleResponse
): InterviewerAvailability[] {
  return response.value.map((schedule: GraphScheduleInformation) => {
    const busyIntervals: BusyInterval[] = schedule.scheduleItems
      .filter((item) => item.status !== 'free')
      .map((item) => ({
        start: new Date(item.start.dateTime + 'Z'),
        end: new Date(item.end.dateTime + 'Z'),
        status: item.status as BusyInterval['status'],
        isPrivate: item.isPrivate || false,
      }));

    // Parse working hours
    const workingHours = schedule.workingHours
      ? {
          start: schedule.workingHours.startTime.substring(0, 5),
          end: schedule.workingHours.endTime.substring(0, 5),
          timeZone: schedule.workingHours.timeZone.name,
          daysOfWeek: schedule.workingHours.daysOfWeek.map(dayNameToNumber),
        }
      : DEFAULT_WORKING_HOURS;

    return {
      email: schedule.scheduleId,
      busyIntervals,
      workingHours,
    };
  });
}

function dayNameToNumber(day: string): number {
  const days: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return days[day.toLowerCase()] ?? 1;
}
