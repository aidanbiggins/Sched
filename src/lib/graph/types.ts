/**
 * Microsoft Graph API Types
 * These mirror the actual Graph API response structures
 */

// ============================================
// getSchedule Response
// ============================================

export interface GraphDateTimeTimeZone {
  dateTime: string;
  timeZone: string;
}

export interface GraphScheduleItem {
  status: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
  start: GraphDateTimeTimeZone;
  end: GraphDateTimeTimeZone;
  subject?: string;
  location?: string;
  isPrivate?: boolean;
}

export interface GraphWorkingHours {
  startTime: string; // "09:00:00.0000000"
  endTime: string;   // "17:00:00.0000000"
  timeZone: {
    name: string;
  };
  daysOfWeek: string[]; // ["monday", "tuesday", ...]
}

export interface GraphScheduleInformation {
  scheduleId: string;
  availabilityView: string;
  scheduleItems: GraphScheduleItem[];
  workingHours?: GraphWorkingHours;
  error?: {
    message: string;
    responseCode: string;
  };
}

export interface GraphGetScheduleResponse {
  value: GraphScheduleInformation[];
}

// ============================================
// Event Types
// ============================================

export interface GraphAttendee {
  emailAddress: {
    address: string;
    name: string;
  };
  type: 'required' | 'optional' | 'resource';
  status?: {
    response: 'none' | 'organizer' | 'tentativelyAccepted' | 'accepted' | 'declined' | 'notResponded';
    time: string;
  };
}

export interface GraphEventBody {
  contentType: 'HTML' | 'Text';
  content: string;
}

export interface GraphOnlineMeeting {
  joinUrl: string;
  conferenceId?: string;
  tollNumber?: string;
  tollFreeNumber?: string;
}

export interface GraphEvent {
  id: string;
  iCalUId: string;
  subject: string;
  body: GraphEventBody;
  start: GraphDateTimeTimeZone;
  end: GraphDateTimeTimeZone;
  attendees: GraphAttendee[];
  organizer: {
    emailAddress: {
      address: string;
      name: string;
    };
  };
  isOnlineMeeting: boolean;
  onlineMeeting?: GraphOnlineMeeting;
  webLink: string;
  transactionId?: string;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

export interface GraphCreateEventRequest {
  subject: string;
  body: GraphEventBody;
  start: GraphDateTimeTimeZone;
  end: GraphDateTimeTimeZone;
  attendees: GraphAttendee[];
  isOnlineMeeting?: boolean;
  onlineMeetingProvider?: 'teamsForBusiness' | 'skypeForBusiness' | 'skypeForConsumer';
  transactionId?: string;
  allowNewTimeProposals?: boolean;
}

export interface GraphUpdateEventRequest {
  subject?: string;
  body?: GraphEventBody;
  start?: GraphDateTimeTimeZone;
  end?: GraphDateTimeTimeZone;
  attendees?: GraphAttendee[];
}
