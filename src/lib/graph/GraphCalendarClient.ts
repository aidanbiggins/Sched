/**
 * GraphCalendarClient Interface
 *
 * Abstraction for Microsoft Graph Calendar API operations.
 * Allows swapping between mock and real implementations.
 */

import {
  InterviewerAvailability,
  CreatedEvent,
  CreateEventPayload,
  UpdateEventPayload,
} from '@/types/scheduling';

export interface GraphCalendarClient {
  /**
   * Get free/busy schedule for multiple users
   */
  getSchedule(
    emails: string[],
    startUtc: Date,
    endUtc: Date,
    intervalMinutes: number
  ): Promise<InterviewerAvailability[]>;

  /**
   * Create a calendar event
   */
  createEvent(
    organizerEmail: string,
    payload: CreateEventPayload
  ): Promise<CreatedEvent>;

  /**
   * Update an existing calendar event
   */
  updateEvent(
    organizerEmail: string,
    eventId: string,
    payload: UpdateEventPayload
  ): Promise<void>;

  /**
   * Cancel (delete) a calendar event
   */
  cancelEvent(
    organizerEmail: string,
    eventId: string,
    cancelMessage?: string
  ): Promise<void>;
}

// Singleton instance for real client (preserves token cache across requests)
let realClientInstance: GraphCalendarClient | null = null;

/**
 * Factory function to get the appropriate client based on environment
 */
export function getGraphCalendarClient(): GraphCalendarClient {
  const mode = process.env.GRAPH_MODE || 'mock';

  if (mode === 'mock') {
    // Dynamic import to avoid bundling mock in production
    const { GraphCalendarClientMock } = require('./GraphCalendarClientMock');
    return new GraphCalendarClientMock();
  }

  if (mode === 'real') {
    // Return singleton to preserve token cache
    if (!realClientInstance) {
      const { validateGraphConfig } = require('./validateConfig');
      const { GraphCalendarClientReal } = require('./GraphCalendarClientReal');

      const config = validateGraphConfig();
      realClientInstance = new GraphCalendarClientReal({
        tenantId: config.tenantId,
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        organizerEmail: config.organizerEmail,
      });

      console.log('[Graph] Initialized real Graph client');
    }
    // Non-null assertion safe here because we just assigned it above if it was null
    return realClientInstance!;
  }

  throw new Error(`Invalid GRAPH_MODE: ${mode}. Must be 'mock' or 'real'.`);
}

/**
 * Get the real client instance if available (for ops dashboard metrics)
 */
export function getRealClientInstance(): GraphCalendarClient | null {
  return realClientInstance;
}

/**
 * Reset the real client instance (for testing)
 */
export function resetRealClientInstance(): void {
  realClientInstance = null;
}
