/**
 * Microsoft Calendar Client
 *
 * Uses delegated OAuth to access the user's Outlook/Microsoft 365 Calendar.
 * Tokens are stored in the calendar_connections table.
 */

import { getSupabaseClient } from '../supabase/client';
import type {
  CalendarClient,
  CalendarConnection,
  FreeBusyRequest,
  FreeBusyResponse,
  CreateEventRequest,
  CalendarEvent,
  UpdateEventRequest,
  CalendarEventDetails,
  AttendeeResponseStatus,
} from './types';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const MICROSOFT_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export class MicrosoftCalendarClient implements CalendarClient {
  private connection: CalendarConnection;
  private accessToken: string;

  constructor(connection: CalendarConnection) {
    this.connection = connection;
    this.accessToken = connection.accessToken;
  }

  /**
   * Create a client from a user ID
   */
  static async fromUserId(userId: string): Promise<MicrosoftCalendarClient> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'microsoft')
      .eq('status', 'active')
      .single();

    if (error || !data) {
      throw new Error('No active Microsoft calendar connection found');
    }

    const connection: CalendarConnection = {
      id: data.id,
      userId: data.user_id,
      provider: 'microsoft',
      email: data.email,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
      scopes: data.scopes || [],
      status: data.status,
    };

    return new MicrosoftCalendarClient(connection);
  }

  /**
   * Refresh the access token if it's expired or about to expire
   */
  async refreshTokenIfNeeded(): Promise<string> {
    // Check if token expires within 5 minutes
    const now = Date.now();
    const expiresAt = this.connection.tokenExpiresAt?.getTime() || 0;
    const bufferMs = 5 * 60 * 1000;

    if (expiresAt > now + bufferMs) {
      return this.accessToken;
    }

    if (!this.connection.refreshToken) {
      throw new Error('No refresh token available - user must re-authenticate');
    }

    // Refresh the token
    const response = await fetch(MICROSOFT_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID || '',
        client_secret: process.env.MICROSOFT_CLIENT_SECRET || '',
        refresh_token: this.connection.refreshToken,
        grant_type: 'refresh_token',
        scope: 'openid email profile offline_access Calendars.ReadWrite',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[MicrosoftCalendar] Token refresh failed:', error);

      // Mark connection as expired
      const supabase = getSupabaseClient();
      await supabase
        .from('calendar_connections')
        .update({ status: 'expired', last_error: 'Token refresh failed' })
        .eq('id', this.connection.id);

      throw new Error('Failed to refresh Microsoft token - user must re-authenticate');
    }

    const tokens = await response.json();
    this.accessToken = tokens.access_token;

    // Update tokens in database
    const supabase = getSupabaseClient();
    await supabase
      .from('calendar_connections')
      .update({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || this.connection.refreshToken,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', this.connection.id);

    return this.accessToken;
  }

  /**
   * Make an authenticated request to Microsoft Graph API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.refreshTokenIfNeeded();

    const response = await fetch(`${GRAPH_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[MicrosoftCalendar] API error (${response.status}):`, error);
      throw new Error(`Microsoft Graph API error: ${response.status}`);
    }

    if (response.status === 204 || response.status === 202) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Get free/busy information
   */
  async getFreeBusy(request: FreeBusyRequest): Promise<FreeBusyResponse[]> {
    // Microsoft uses getSchedule endpoint for free/busy
    const body = {
      schedules: request.emails,
      startTime: {
        dateTime: request.startTime.toISOString(),
        timeZone: 'UTC',
      },
      endTime: {
        dateTime: request.endTime.toISOString(),
        timeZone: 'UTC',
      },
      availabilityViewInterval: 30, // 30 minute intervals
    };

    try {
      const result = await this.request<{
        value: Array<{
          scheduleId: string;
          availabilityView: string;
          scheduleItems: Array<{
            start: { dateTime: string };
            end: { dateTime: string };
            status: string;
          }>;
          error?: { message: string };
        }>;
      }>('/me/calendar/getSchedule', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      return result.value.map((schedule) => {
        if (schedule.error) {
          return {
            email: schedule.scheduleId,
            connected: false,
            busyIntervals: [],
            error: schedule.error.message,
          };
        }

        return {
          email: schedule.scheduleId,
          connected: true,
          busyIntervals: schedule.scheduleItems
            .filter((item) => item.status === 'busy' || item.status === 'tentative')
            .map((item) => ({
              start: new Date(item.start.dateTime + 'Z'),
              end: new Date(item.end.dateTime + 'Z'),
            })),
        };
      });
    } catch (error) {
      console.error('[MicrosoftCalendar] FreeBusy error:', error);
      return request.emails.map((email) => ({
        email,
        connected: false,
        busyIntervals: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }

  /**
   * Create a calendar event
   */
  async createEvent(request: CreateEventRequest): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {
      subject: request.summary,
      body: {
        contentType: 'HTML',
        content: request.description || '',
      },
      start: {
        dateTime: request.start.toISOString().replace('Z', ''),
        timeZone: request.timeZone,
      },
      end: {
        dateTime: request.end.toISOString().replace('Z', ''),
        timeZone: request.timeZone,
      },
      attendees: request.attendees.map((a) => ({
        emailAddress: {
          address: a.email,
          name: a.displayName || a.email,
        },
        type: a.optional ? 'optional' : 'required',
      })),
    };

    // Add Teams meeting if requested
    if (request.conferenceData) {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = 'teamsForBusiness';
    }

    const result = await this.request<{
      id: string;
      iCalUId: string;
      webLink: string;
      onlineMeeting?: { joinUrl: string };
    }>('/me/calendar/events', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      id: result.id,
      iCalUid: result.iCalUId,
      htmlLink: result.webLink,
      conferenceLink: result.onlineMeeting?.joinUrl || null,
    };
  }

  /**
   * Update an existing event
   */
  async updateEvent(
    eventId: string,
    request: UpdateEventRequest
  ): Promise<CalendarEvent> {
    const body: Record<string, unknown> = {};

    if (request.summary) body.subject = request.summary;
    if (request.description) {
      body.body = {
        contentType: 'HTML',
        content: request.description,
      };
    }
    if (request.start && request.timeZone) {
      body.start = {
        dateTime: request.start.toISOString().replace('Z', ''),
        timeZone: request.timeZone,
      };
    }
    if (request.end && request.timeZone) {
      body.end = {
        dateTime: request.end.toISOString().replace('Z', ''),
        timeZone: request.timeZone,
      };
    }

    const result = await this.request<{
      id: string;
      iCalUId: string;
      webLink: string;
      onlineMeeting?: { joinUrl: string };
    }>(`/me/calendar/events/${eventId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    return {
      id: result.id,
      iCalUid: result.iCalUId,
      htmlLink: result.webLink,
      conferenceLink: result.onlineMeeting?.joinUrl || null,
    };
  }

  /**
   * Delete/cancel an event
   */
  async deleteEvent(eventId: string, notifyAttendees = true): Promise<void> {
    if (notifyAttendees) {
      // Cancel the event (sends notifications)
      await this.request(`/me/calendar/events/${eventId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ comment: 'This meeting has been cancelled.' }),
      });
    } else {
      // Just delete without notifications
      await this.request(`/me/calendar/events/${eventId}`, {
        method: 'DELETE',
      });
    }
  }

  /**
   * Get event details including attendee response status
   */
  async getEvent(eventId: string): Promise<CalendarEventDetails> {
    const result = await this.request<{
      id: string;
      subject: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
      attendees?: Array<{
        emailAddress: { address: string; name?: string };
        status: { response: string };
        type: string;
      }>;
      organizer?: {
        emailAddress: { address: string; name?: string };
      };
    }>(`/me/calendar/events/${eventId}`);

    // Map Microsoft's response status to our type
    const mapResponseStatus = (status: string): AttendeeResponseStatus => {
      switch (status) {
        case 'accepted':
          return 'accepted';
        case 'declined':
          return 'declined';
        case 'tentativelyAccepted':
          return 'tentative';
        default:
          return 'needsAction';
      }
    };

    return {
      id: result.id,
      summary: result.subject,
      start: new Date(result.start.dateTime + 'Z'),
      end: new Date(result.end.dateTime + 'Z'),
      attendees: (result.attendees || []).map((a) => ({
        email: a.emailAddress.address,
        displayName: a.emailAddress.name,
        responseStatus: mapResponseStatus(a.status.response),
        organizer: a.emailAddress.address === result.organizer?.emailAddress.address,
      })),
      organizer: result.organizer
        ? {
            email: result.organizer.emailAddress.address,
            displayName: result.organizer.emailAddress.name,
          }
        : undefined,
    };
  }
}
