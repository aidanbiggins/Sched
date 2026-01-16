/**
 * Calendar Client Types
 *
 * Unified interface for Google and Microsoft calendar operations.
 */

export interface CalendarConnection {
  id: string;
  userId: string;
  provider: 'google' | 'microsoft';
  email: string;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string[];
  status: 'active' | 'expired' | 'revoked';
}

export interface FreeBusyRequest {
  emails: string[];
  startTime: Date;
  endTime: Date;
}

export interface BusyInterval {
  start: Date;
  end: Date;
}

export interface FreeBusyResponse {
  email: string;
  connected: boolean;
  busyIntervals: BusyInterval[];
  error?: string;
}

export interface CreateEventRequest {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  timeZone: string;
  attendees: Array<{
    email: string;
    displayName?: string;
    optional?: boolean;
  }>;
  conferenceData?: boolean; // Add Google Meet / Teams link
}

export interface CalendarEvent {
  id: string;
  iCalUid: string | null;
  htmlLink: string | null;
  conferenceLink: string | null;
}

export type AttendeeResponseStatus = 'needsAction' | 'declined' | 'tentative' | 'accepted';

export interface AttendeeStatus {
  email: string;
  displayName?: string;
  responseStatus: AttendeeResponseStatus;
  organizer?: boolean;
}

export interface CalendarEventDetails {
  id: string;
  summary: string;
  start: Date;
  end: Date;
  attendees: AttendeeStatus[];
  organizer?: {
    email: string;
    displayName?: string;
  };
}

export interface UpdateEventRequest {
  summary?: string;
  description?: string;
  start?: Date;
  end?: Date;
  timeZone?: string;
}

/**
 * Calendar Client Interface
 *
 * Both Google and Microsoft clients implement this interface.
 */
export interface CalendarClient {
  /**
   * Get free/busy information for one or more calendars
   */
  getFreeBusy(request: FreeBusyRequest): Promise<FreeBusyResponse[]>;

  /**
   * Create a calendar event
   */
  createEvent(request: CreateEventRequest): Promise<CalendarEvent>;

  /**
   * Update an existing event
   */
  updateEvent(eventId: string, request: UpdateEventRequest): Promise<CalendarEvent>;

  /**
   * Delete/cancel an event
   */
  deleteEvent(eventId: string, notifyAttendees?: boolean): Promise<void>;

  /**
   * Get event details including attendee response status
   */
  getEvent(eventId: string): Promise<CalendarEventDetails>;

  /**
   * Refresh the access token if expired
   */
  refreshTokenIfNeeded(): Promise<string>;
}
