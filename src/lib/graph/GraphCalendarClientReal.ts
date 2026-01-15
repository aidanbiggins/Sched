/**
 * GraphCalendarClientReal
 *
 * Real Microsoft Graph API implementation using client credentials flow.
 * Uses organizer mailbox pattern - all events created in a single service mailbox.
 *
 * Features:
 * - Client credentials authentication (app permissions)
 * - Token caching with single-flight locking
 * - Retry logic with 429/5xx handling
 * - Metrics tracking for ops dashboard
 */

import { GraphCalendarClient } from './GraphCalendarClient';
import { GraphTokenManager, GraphTokenError } from './GraphTokenManager';
import {
  withGraphRetry,
  graphFetch,
  GraphApiError,
} from './graphRetry';
import {
  GraphGetScheduleResponse,
  GraphEvent,
} from './types';
import {
  InterviewerAvailability,
  CreatedEvent,
  CreateEventPayload,
  UpdateEventPayload,
  BusyInterval,
} from '@/types/scheduling';

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

export interface GraphClientConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  organizerEmail: string;
  tokenEndpoint?: string; // Override for testing
}

export class GraphCalendarClientReal implements GraphCalendarClient {
  private readonly config: GraphClientConfig;
  private readonly tokenManager: GraphTokenManager;

  constructor(config: GraphClientConfig) {
    this.config = config;
    this.tokenManager = new GraphTokenManager({
      tenantId: config.tenantId,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tokenEndpoint: config.tokenEndpoint,
    });
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
    return withGraphRetry(
      async () => {
        const token = await this.getTokenWithRetry();
        const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(this.config.organizerEmail)}/calendar/getSchedule`;

        const response = await graphFetch<GraphGetScheduleResponse>(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'outlook.timezone="UTC"',
          },
          body: JSON.stringify({
            schedules: emails,
            startTime: {
              dateTime: formatGraphDateTime(startUtc),
              timeZone: 'UTC',
            },
            endTime: {
              dateTime: formatGraphDateTime(endUtc),
              timeZone: 'UTC',
            },
            availabilityViewInterval: intervalMinutes,
          }),
        });

        return response.value.map((schedule) =>
          this.mapScheduleToAvailability(schedule)
        );
      },
      { operation: 'getSchedule' }
    );
  }

  /**
   * Create a calendar event
   */
  async createEvent(
    organizerEmail: string,
    payload: CreateEventPayload
  ): Promise<CreatedEvent> {
    return withGraphRetry(
      async () => {
        const token = await this.getTokenWithRetry();
        // Always use configured organizer email, ignore parameter (it's for interface compatibility)
        const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(this.config.organizerEmail)}/calendar/events`;

        // Only enable Teams meeting if both the payload requests it AND GRAPH_ENABLE_TEAMS=true
        const teamsEnabled = process.env.GRAPH_ENABLE_TEAMS === 'true';
        const includeOnlineMeeting = payload.isOnlineMeeting && teamsEnabled;

        const graphPayload = {
          subject: payload.subject,
          body: payload.body,
          start: {
            dateTime: formatGraphDateTime(payload.start),
            timeZone: payload.timeZone,
          },
          end: {
            dateTime: formatGraphDateTime(payload.end),
            timeZone: payload.timeZone,
          },
          attendees: payload.attendees.map((a) => ({
            emailAddress: { address: a.email, name: a.name },
            type: a.type,
          })),
          isOnlineMeeting: includeOnlineMeeting,
          onlineMeetingProvider: includeOnlineMeeting ? 'teamsForBusiness' : undefined,
          transactionId: payload.transactionId,
          allowNewTimeProposals: false,
        };

        const event = await graphFetch<GraphEvent>(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'outlook.timezone="UTC"',
          },
          body: JSON.stringify(graphPayload),
        });

        return {
          eventId: event.id,
          iCalUId: event.iCalUId ?? null,
          joinUrl: event.onlineMeeting?.joinUrl ?? null,
          webLink: event.webLink ?? null,
        };
      },
      { operation: 'createEvent', entityId: payload.transactionId }
    );
  }

  /**
   * Update an existing calendar event
   */
  async updateEvent(
    organizerEmail: string,
    eventId: string,
    payload: UpdateEventPayload
  ): Promise<void> {
    return withGraphRetry(
      async () => {
        const token = await this.getTokenWithRetry();
        const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(this.config.organizerEmail)}/calendar/events/${encodeURIComponent(eventId)}`;

        const graphPayload: Record<string, unknown> = {};

        if (payload.subject) {
          graphPayload.subject = payload.subject;
        }
        if (payload.body) {
          graphPayload.body = payload.body;
        }
        if (payload.start) {
          graphPayload.start = {
            dateTime: formatGraphDateTime(payload.start),
            timeZone: payload.timeZone ?? 'UTC',
          };
        }
        if (payload.end) {
          graphPayload.end = {
            dateTime: formatGraphDateTime(payload.end),
            timeZone: payload.timeZone ?? 'UTC',
          };
        }

        await graphFetch<void>(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: 'outlook.timezone="UTC"',
          },
          body: JSON.stringify(graphPayload),
        });
      },
      { operation: 'updateEvent', entityId: eventId }
    );
  }

  /**
   * Cancel a calendar event and notify attendees
   */
  async cancelEvent(
    organizerEmail: string,
    eventId: string,
    cancelMessage?: string
  ): Promise<void> {
    return withGraphRetry(
      async () => {
        const token = await this.getTokenWithRetry();
        const url = `${GRAPH_BASE_URL}/users/${encodeURIComponent(this.config.organizerEmail)}/events/${encodeURIComponent(eventId)}/cancel`;

        // Use POST /cancel endpoint to notify attendees with cancellation message
        await graphFetch<void>(url, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            comment: cancelMessage || 'This meeting has been cancelled.',
          }),
        });
      },
      { operation: 'cancelEvent', entityId: eventId }
    );
  }

  /**
   * Get token status for ops dashboard
   */
  getTokenStatus() {
    return this.tokenManager.getTokenStatus();
  }

  /**
   * Get token metrics for ops dashboard
   */
  getTokenMetrics() {
    return this.tokenManager.getMetrics();
  }

  /**
   * Get token with automatic retry on 401
   */
  private async getTokenWithRetry(): Promise<string> {
    try {
      return await this.tokenManager.getToken();
    } catch (error) {
      if (error instanceof GraphTokenError) {
        throw new GraphApiError(
          `Token acquisition failed: ${error.message}`,
          error.status
        );
      }
      throw error;
    }
  }

  /**
   * Map Graph API schedule response to domain type
   */
  private mapScheduleToAvailability(
    schedule: GraphGetScheduleResponse['value'][number]
  ): InterviewerAvailability {
    // Handle error response from Graph
    if (schedule.error) {
      console.warn(
        `[Graph] Schedule error for ${schedule.scheduleId}: ${schedule.error.message}`
      );
      // Return empty availability on error
      return {
        email: schedule.scheduleId,
        busyIntervals: [],
        workingHours: {
          start: '09:00',
          end: '17:00',
          timeZone: 'UTC',
          daysOfWeek: [1, 2, 3, 4, 5],
        },
      };
    }

    const busyIntervals: BusyInterval[] = schedule.scheduleItems
      .filter((item) => item.status !== 'free')
      .map((item) => ({
        start: new Date(item.start.dateTime + 'Z'),
        end: new Date(item.end.dateTime + 'Z'),
        status: item.status as BusyInterval['status'],
        isPrivate: item.isPrivate ?? false,
      }));

    // Parse working hours
    const workingHours = schedule.workingHours
      ? {
          start: schedule.workingHours.startTime.substring(0, 5), // "09:00:00.0000000" -> "09:00"
          end: schedule.workingHours.endTime.substring(0, 5),
          timeZone: schedule.workingHours.timeZone?.name ?? 'UTC',
          daysOfWeek: schedule.workingHours.daysOfWeek.map(dayNameToNumber),
        }
      : {
          start: '09:00',
          end: '17:00',
          timeZone: 'UTC',
          daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
        };

    return {
      email: schedule.scheduleId,
      busyIntervals,
      workingHours,
    };
  }
}

/**
 * Format Date to Graph API datetime string (without Z suffix)
 */
function formatGraphDateTime(date: Date): string {
  return date.toISOString().replace('Z', '');
}

/**
 * Convert day name to number (0=Sun, 1=Mon, etc.)
 */
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
