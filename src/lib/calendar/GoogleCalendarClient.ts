/**
 * Google Calendar Client
 *
 * Uses delegated OAuth to access the user's Google Calendar.
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

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export class GoogleCalendarClient implements CalendarClient {
  private connection: CalendarConnection;
  private accessToken: string;

  constructor(connection: CalendarConnection) {
    this.connection = connection;
    this.accessToken = connection.accessToken;
  }

  /**
   * Create a client from a user ID
   */
  static async fromUserId(userId: string): Promise<GoogleCalendarClient> {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('calendar_connections')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'google')
      .eq('status', 'active')
      .single();

    if (error || !data) {
      throw new Error('No active Google calendar connection found');
    }

    const connection: CalendarConnection = {
      id: data.id,
      userId: data.user_id,
      provider: 'google',
      email: data.email,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenExpiresAt: data.token_expires_at ? new Date(data.token_expires_at) : null,
      scopes: data.scopes || [],
      status: data.status,
    };

    return new GoogleCalendarClient(connection);
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
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: this.connection.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[GoogleCalendar] Token refresh failed:', error);

      // Mark connection as expired
      const supabase = getSupabaseClient();
      await supabase
        .from('calendar_connections')
        .update({ status: 'expired', last_error: 'Token refresh failed' })
        .eq('id', this.connection.id);

      throw new Error('Failed to refresh Google token - user must re-authenticate');
    }

    const tokens = await response.json();
    this.accessToken = tokens.access_token;

    // Update tokens in database
    const supabase = getSupabaseClient();
    await supabase
      .from('calendar_connections')
      .update({
        access_token: tokens.access_token,
        token_expires_at: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
          : null,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', this.connection.id);

    return this.accessToken;
  }

  /**
   * Make an authenticated request to Google Calendar API
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.refreshTokenIfNeeded();

    const response = await fetch(`${GOOGLE_CALENDAR_API}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[GoogleCalendar] API error (${response.status}):`, error);
      throw new Error(`Google Calendar API error: ${response.status}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json();
  }

  /**
   * Get free/busy information
   */
  async getFreeBusy(request: FreeBusyRequest): Promise<FreeBusyResponse[]> {
    const body = {
      timeMin: request.startTime.toISOString(),
      timeMax: request.endTime.toISOString(),
      items: request.emails.map((email) => ({ id: email })),
    };

    try {
      const result = await this.request<{
        calendars: Record<string, { busy: Array<{ start: string; end: string }> }>;
      }>('/freeBusy', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      return request.emails.map((email) => {
        const calendar = result.calendars[email];
        if (!calendar) {
          return { email, connected: false, busyIntervals: [], error: 'Calendar not found' };
        }

        return {
          email,
          connected: true,
          busyIntervals: calendar.busy.map((b) => ({
            start: new Date(b.start),
            end: new Date(b.end),
          })),
        };
      });
    } catch (error) {
      console.error('[GoogleCalendar] FreeBusy error:', error);
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
      summary: request.summary,
      description: request.description,
      start: {
        dateTime: request.start.toISOString(),
        timeZone: request.timeZone,
      },
      end: {
        dateTime: request.end.toISOString(),
        timeZone: request.timeZone,
      },
      attendees: request.attendees.map((a) => ({
        email: a.email,
        displayName: a.displayName,
        optional: a.optional || false,
      })),
    };

    // Add Google Meet if requested
    if (request.conferenceData) {
      body.conferenceData = {
        createRequest: {
          requestId: `sched-${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      };
    }

    const endpoint = request.conferenceData
      ? '/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all'
      : '/calendars/primary/events?sendUpdates=all';

    const result = await this.request<{
      id: string;
      iCalUID: string;
      htmlLink: string;
      hangoutLink?: string;
      conferenceData?: { entryPoints?: Array<{ uri: string }> };
    }>(endpoint, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    return {
      id: result.id,
      iCalUid: result.iCalUID,
      htmlLink: result.htmlLink,
      conferenceLink:
        result.hangoutLink ||
        result.conferenceData?.entryPoints?.[0]?.uri ||
        null,
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

    if (request.summary) body.summary = request.summary;
    if (request.description) body.description = request.description;
    if (request.start && request.timeZone) {
      body.start = {
        dateTime: request.start.toISOString(),
        timeZone: request.timeZone,
      };
    }
    if (request.end && request.timeZone) {
      body.end = {
        dateTime: request.end.toISOString(),
        timeZone: request.timeZone,
      };
    }

    const result = await this.request<{
      id: string;
      iCalUID: string;
      htmlLink: string;
      hangoutLink?: string;
    }>(`/calendars/primary/events/${eventId}?sendUpdates=all`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });

    return {
      id: result.id,
      iCalUid: result.iCalUID,
      htmlLink: result.htmlLink,
      conferenceLink: result.hangoutLink || null,
    };
  }

  /**
   * Delete/cancel an event
   */
  async deleteEvent(eventId: string, notifyAttendees = true): Promise<void> {
    const sendUpdates = notifyAttendees ? 'all' : 'none';
    await this.request(`/calendars/primary/events/${eventId}?sendUpdates=${sendUpdates}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get event details including attendee response status
   */
  async getEvent(eventId: string): Promise<CalendarEventDetails> {
    const result = await this.request<{
      id: string;
      summary: string;
      start: { dateTime: string; timeZone?: string };
      end: { dateTime: string; timeZone?: string };
      attendees?: Array<{
        email: string;
        displayName?: string;
        responseStatus: string;
        organizer?: boolean;
        self?: boolean;
      }>;
      organizer?: {
        email: string;
        displayName?: string;
        self?: boolean;
      };
    }>(`/calendars/primary/events/${eventId}`);

    // Debug: log raw Google Calendar API response
    console.log('[GoogleCalendar] Raw event from API:', JSON.stringify({
      id: result.id,
      organizer: result.organizer,
      attendees: result.attendees
    }, null, 2));

    // Map Google's response status to our type
    const mapResponseStatus = (status: string): AttendeeResponseStatus => {
      switch (status) {
        case 'accepted':
          return 'accepted';
        case 'declined':
          return 'declined';
        case 'tentative':
          return 'tentative';
        default:
          return 'needsAction';
      }
    };

    return {
      id: result.id,
      summary: result.summary,
      start: new Date(result.start.dateTime),
      end: new Date(result.end.dateTime),
      attendees: (result.attendees || []).map((a) => ({
        email: a.email,
        displayName: a.displayName,
        responseStatus: mapResponseStatus(a.responseStatus),
        organizer: a.organizer,
      })),
      organizer: result.organizer,
    };
  }
}
