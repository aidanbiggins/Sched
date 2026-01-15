# Scheduler v2: Microsoft Graph Calendar Integration

**Version:** 2.0
**Created:** 2026-01-12
**Updated:** 2026-01-13
**Status:** Implemented (MVP Complete with Booking, Cancel, Reschedule + iCIMS Writeback)

This document defines the implementation plan for Scheduler v2 - a standalone interview scheduling system that reads Outlook availability via Microsoft Graph API and creates real calendar events. iCIMS is the ATS system of record.

## Implementation Status

All core features are implemented and working:

| Feature | Status | Notes |
|---------|--------|-------|
| Project setup | Complete | Next.js 14, TypeScript, Tailwind |
| Database schema | Complete | In-memory for dev (Supabase-ready) |
| GraphCalendarClient | Complete | Mock adapter with fixture support |
| SlotGenerationService | Complete | 15-min grid, max 30 slots |
| SchedulingService | Complete | Full orchestration layer |
| IcimsClient | Complete | Mock adapter with logging |
| IcimsWritebackService | Complete | Note writeback with retry mechanism |
| Webhook endpoint | Complete | HMAC signature verification |
| API routes | Complete | All CRUD + booking + v2 public endpoints |
| Coordinator UI | Complete | Dashboard, create request, sync status |
| Candidate booking UI | Complete | 3-step flow: Select → Confirm → Done |
| Token security | Complete | Hash-based token storage (v2) |
| Booking flow | Complete | Creates calendar events, concurrency protection |
| Sync jobs & retry | Complete | Exponential backoff, 5 attempts max |
| Cancel API | Complete | Graph event deletion, iCIMS notes |
| Reschedule API | Complete | Slot validation, Graph event update |
| Unit tests | Complete | 155+ unit tests passing |
| Integration tests | Complete | 26+ integration tests passing |

**Total: 193 tests passing, build successful.**

### Quick Start

```bash
cd /Users/aidanbiggins/AI-Projects/Sched
npm install
npm run dev -- -p 3001  # Start development server (http://localhost:3001)
npm test                # Run all tests (112 tests)
npm run build           # Production build

# Optional: Run sync worker for iCIMS retries
npm run scheduler:sync       # Continuous polling
npm run scheduler:sync:once  # Single run
```

### v2 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scheduling-requests` | Create scheduling request (v2 format) |
| GET | `/api/scheduling-requests` | List requests with filters, search, pagination |
| GET | `/api/scheduling-requests/:id` | Get request detail with timeline and sync status |
| POST | `/api/scheduling-requests/:id/cancel` | Cancel request/booking |
| GET | `/api/scheduling-requests/:id/reschedule` | Get available reschedule slots |
| POST | `/api/scheduling-requests/:id/reschedule` | Reschedule to a new slot |
| POST | `/api/scheduling-requests/:id/resend-link` | Get/resend scheduling link |
| POST | `/api/scheduling-requests/:id/sync/retry` | Retry failed sync jobs |
| POST | `/api/scheduling-requests/bulk-cancel` | Bulk cancel multiple requests |
| GET | `/api/public/scheduling-requests/:token` | Get slots for candidate (public) |
| POST | `/api/public/book` | Book a slot (v2 format) |
| POST | `/api/scheduling/requests` | Create scheduling request (legacy) |
| GET | `/api/scheduling/slots?token=` | Get available slots (legacy) |
| POST | `/api/scheduling/book` | Book a slot (legacy) |

### Cancel API

**POST** `/api/scheduling-requests/:id/cancel`

Cancels a scheduling request (pending or booked).

**Request:**
```json
{
  "reason": "Position filled",
  "notifyParticipants": true
}
```

**Response:**
```json
{
  "success": true,
  "status": "cancelled",
  "cancelledAt": "2026-01-13T10:00:00Z",
  "calendarEventId": "mock-event-xxx"
}
```

**Behavior:**
- If status is BOOKED and calendar event exists, calls `GraphCalendarClient.cancelEvent()`
- Updates request status to CANCELLED
- Writes iCIMS cancellation note (async, won't block if fails)
- Returns 404 if request not found
- Returns 400 if already cancelled or invalid status

### List API (Coordinator)

**GET** `/api/scheduling-requests`

Lists scheduling requests with filtering, search, and pagination.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Comma-separated: pending,booked,cancelled,rescheduled |
| `search` | string | Search by email, application ID, or request ID |
| `ageRange` | string | 0-2d, 3-7d, 8-14d, 15+d |
| `needsSync` | boolean | Filter requests with failed sync jobs |
| `interviewerEmail` | string | Filter by interviewer email |
| `page` | number | Page number (default: 1) |
| `limit` | number | Items per page (default: 20, max: 100) |
| `sortBy` | string | Sort field (default: status) |
| `sortOrder` | string | asc or desc (default: asc) |

**Response:**
```json
{
  "requests": [
    {
      "requestId": "...",
      "candidateName": "...",
      "candidateEmail": "...",
      "reqTitle": "...",
      "interviewType": "phone_screen",
      "interviewerEmails": ["..."],
      "status": "pending",
      "createdAt": "2026-01-13T...",
      "ageDays": 2,
      "booking": null,
      "syncStatus": {
        "hasPendingSync": false,
        "hasFailedSync": false
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  },
  "counts": {
    "all": 45,
    "pending": 20,
    "booked": 18,
    "cancelled": 5,
    "rescheduled": 2
  }
}
```

### Detail API (Coordinator)

**GET** `/api/scheduling-requests/:id`

Returns full request details including timeline and sync status.

**Response:**
```json
{
  "request": {
    "id": "...",
    "applicationId": "APP-12345",
    "candidateName": "John Doe",
    "candidateEmail": "john@example.com",
    "reqTitle": "Software Engineer",
    "interviewType": "phone_screen",
    "durationMinutes": 60,
    "interviewerEmails": ["interviewer@company.com"],
    "organizerEmail": "scheduling@company.com",
    "status": "booked",
    "publicToken": "abc123...",
    "expiresAt": "2026-01-27T...",
    "createdAt": "2026-01-13T...",
    "ageDays": 0
  },
  "booking": {
    "id": "...",
    "scheduledStart": "2026-01-15T14:00:00Z",
    "scheduledEnd": "2026-01-15T15:00:00Z",
    "calendarEventId": "...",
    "conferenceJoinUrl": "https://teams.microsoft.com/...",
    "status": "confirmed",
    "bookedAt": "2026-01-13T..."
  },
  "timeline": [
    {
      "id": "...",
      "action": "link_created",
      "actorId": "coordinator@company.com",
      "payload": {},
      "createdAt": "2026-01-13T10:00:00Z"
    },
    {
      "id": "...",
      "action": "booked",
      "actorId": "candidate",
      "payload": { "slotId": "..." },
      "createdAt": "2026-01-13T11:30:00Z"
    }
  ],
  "syncStatus": {
    "hasPendingSync": false,
    "hasFailedSync": false,
    "pendingCount": 0,
    "failedCount": 0,
    "jobs": []
  }
}
```

### Resend Link API

**POST** `/api/scheduling-requests/:id/resend-link`

Gets the scheduling link and email content for a pending request.

**Request (optional):**
```json
{
  "sendEmail": true
}
```

**Response:**
```json
{
  "success": true,
  "method": "copy",
  "message": "SMTP not configured. Copy the link or email content to send manually.",
  "link": "https://sched.example.com/book/abc123...",
  "emailContent": {
    "to": "candidate@example.com",
    "subject": "Schedule Your Interview - Software Engineer",
    "body": "Hi John,\n\nWe're excited to move forward..."
  },
  "expiresAt": "2026-01-27T..."
}
```

### Sync Retry API

**POST** `/api/scheduling-requests/:id/sync/retry`

Retries failed sync jobs for a scheduling request.

**Request (optional):**
```json
{
  "jobId": "specific-job-id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Queued 1 sync job(s) for retry",
  "jobs": [
    {
      "id": "new-job-id",
      "type": "icims_writeback",
      "entityType": "booking",
      "status": "pending"
    }
  ]
}
```

### Bulk Cancel API

**POST** `/api/scheduling-requests/bulk-cancel`

Cancels multiple scheduling requests at once.

**Request:**
```json
{
  "requestIds": ["id1", "id2", "id3"],
  "reason": "Position filled"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Cancelled 3 of 3 requests",
  "results": [
    { "requestId": "id1", "success": true },
    { "requestId": "id2", "success": true },
    { "requestId": "id3", "success": true }
  ],
  "successCount": 3,
  "failureCount": 0
}
```

### Reschedule API

**GET** `/api/scheduling-requests/:id/reschedule`

Gets available slots for rescheduling (excludes current booking time).

**Response:**
```json
{
  "request": {
    "id": "...",
    "candidateName": "...",
    "status": "booked"
  },
  "slots": [
    {
      "slotId": "abc123",
      "start": "2026-01-16T14:00:00Z",
      "end": "2026-01-16T14:30:00Z",
      "displayStart": "Wed, Jan 16 at 9:00 AM",
      "displayEnd": "Wed, Jan 16 at 9:30 AM"
    }
  ],
  "timezone": "America/New_York"
}
```

**POST** `/api/scheduling-requests/:id/reschedule`

Reschedules a booking to a new time slot.

**Request:**
```json
{
  "newSlotStartAtUtc": "2026-01-16T14:00:00Z",
  "reason": "Interviewer conflict"
}
```

**Response:**
```json
{
  "success": true,
  "status": "rescheduled",
  "bookingId": "...",
  "startAtUtc": "2026-01-16T14:00:00Z",
  "endAtUtc": "2026-01-16T14:30:00Z",
  "calendarEventId": "mock-event-xxx",
  "joinUrl": "https://teams.microsoft.com/..."
}
```

**Validation:**
- Request must be BOOKED or RESCHEDULED
- `newSlotStartAtUtc` must be 15-minute aligned
- New slot must be within the scheduling window
- New slot must be actually available (server-side validation via Graph)

**Behavior:**
- Calls `GraphCalendarClient.updateEvent()` to update calendar
- Updates booking start/end times
- Writes iCIMS rescheduled note (async)
- Returns 409 if slot is no longer available
- Returns 502 if Graph update fails

### Booking Flow

1. **Create Request**: Coordinator creates a scheduling request → gets public link
2. **View Slots**: Candidate opens link → sees available time slots grouped by date
3. **Select & Confirm**: Candidate selects slot → confirms booking
4. **Calendar Event**: System creates Outlook event via Graph API (mock in dev)
5. **Confirmation**: Candidate sees confirmation with meeting details/join URL

### Concurrency Strategy

The booking system prevents double-bookings through:
1. **Request-level**: Check `scheduling_requests.status` is PENDING
2. **Booking-level**: Check no existing booking for the request
3. **Interviewer-level**: Check no overlapping bookings for interviewer
4. **Slot validation**: Re-verify slot availability server-side before booking

In production with a real database, use transactions with row-level locking.

### Environment Variables

```bash
# Required for production
GRAPH_MODE=mock|real              # Default: mock
GRAPH_ORGANIZER_EMAIL=            # Scheduling mailbox
TOKEN_HASH_PEPPER=                # Secret for token hashing (CHANGE IN PROD!)
PUBLIC_LINK_TTL_DAYS=14           # Token expiry in days

# Optional
ICIMS_WEBHOOK_SECRET=             # For webhook verification
```

### Token Security (v2)

Public scheduling tokens are now stored as SHA-256 hashes:
- Raw token is sent to candidate in URL (never stored)
- Only hash is stored in database (`publicTokenHash`)
- Lookup by hashing incoming token with pepper
- Raw tokens are never logged

### Folder Structure (v2)

```
src/
├── app/
│   ├── book/[token]/                    # Candidate booking page (3-step UI)
│   ├── coordinator/                      # Coordinator dashboard
│   └── api/
│       ├── scheduling-requests/          # v2 create endpoint
│       ├── public/
│       │   ├── scheduling-requests/      # v2 public slot retrieval
│       │   └── book/                     # v2 public booking
│       └── scheduling/                   # Legacy endpoints
├── lib/
│   ├── utils/
│   │   └── tokens.ts                    # Token generation/hashing
│   ├── graph/
│   ├── scheduling/
│   └── db/
└── types/
```

### iCIMS Writeback System

The scheduler writes notes to iCIMS for all scheduling events. The writeback system is designed for resilience:

**Note Types:**
- **Link Created** - When coordinator generates a scheduling link
- **Interview Booked** - When candidate confirms a time slot
- **Interview Cancelled** - When booking is cancelled
- **Interview Rescheduled** - When booking time is changed

**Retry Mechanism:**
- Initial write attempts immediately during the booking flow
- Failures don't block the main flow (calendar events still created)
- Failed writes create sync jobs with exponential backoff
- Backoff intervals: 1min → 5min → 15min → 30min → 60min
- Max 5 attempts before permanent failure

**Running the Sync Worker:**
```bash
npm run scheduler:sync       # Continuous polling (30s intervals)
npm run scheduler:sync:once  # Single run (for cron jobs)
```

**Sync Health API:**
The coordinator detail page (`/api/scheduling/requests/[id]`) returns sync status:
```json
{
  "syncStatus": {
    "hasPendingSync": false,
    "hasFailedSync": false,
    "pendingCount": 0,
    "failedCount": 0,
    "jobs": [...]
  }
}
```

**Key Files:**
- `src/lib/icims/IcimsClient.ts` - Client interface and mock
- `src/lib/icims/IcimsWritebackService.ts` - Writeback orchestration
- `src/lib/icims/noteFormatter.ts` - Deterministic note templates
- `src/lib/db/index.ts` - Sync jobs table
- `scripts/sync-worker.ts` - Background worker

### Running Mock Mode

The scheduler runs in mock mode by default (`GRAPH_MODE=mock`):
- GraphCalendarClient returns deterministic busy intervals
- Default busy times: 2 hours from now, and tomorrow at 3pm
- Working hours: 9am-5pm Mon-Fri (America/New_York)
- Fixtures can be overridden in tests via `setFixtureOverrides()`

### Mock Graph createEvent Behavior

When booking in mock mode:
- `GraphCalendarClientMock.createEvent()` generates a mock event ID (`mock-event-XXXX`)
- Returns a mock Teams join URL when `isOnlineMeeting: true`
- Stores event data in memory for later retrieval in tests
- Logs the event creation to AuditLog for observability

### Candidate UI Features

The booking page (`/book/:token`) includes:
- **3-step flow**: Select → Confirm → Done with progress indicator
- **Date grouping**: Slots grouped by date for easy scanning
- **Timezone selector**: Pre-populated list of common timezones + auto-detection
- **Loading skeleton**: Smooth loading state with animated placeholders
- **Empty state**: Clear messaging when no slots available with refresh button
- **Error handling**: Retry button, inline error messages
- **Accessibility**: ARIA labels, keyboard navigation for slot selection
- **Responsive design**: Works on mobile and desktop

---

## 1. Repo Reality Check

### What Apps Exist Today

**Project:** Sched (v2 MVP implemented)
**Location:** `/Users/aidanbiggins/AI-Projects/Sched`

The repository contains a fully functional MVP interview scheduling application.

### Where UI Lives

**Implemented structure:**
```
src/
├── app/                    # Next.js App Router pages
│   ├── coordinator/        # Coordinator dashboard
│   ├── book/[token]/       # Candidate booking page
│   └── api/                # API routes
├── lib/                    # Business logic and clients
│   ├── db/                 # In-memory database
│   ├── graph/              # Microsoft Graph client
│   ├── icims/              # iCIMS client
│   ├── scheduling/         # Core services
│   └── webhook/            # Webhook handling
└── types/                  # TypeScript types
```

### Where API/Server Code Lives

**Implemented:** Next.js API routes in `src/app/api/`:
- `/api/scheduling/requests` - CRUD for scheduling requests
- `/api/scheduling/slots` - Get available slots
- `/api/scheduling/book` - Book a slot
- `/api/webhooks/icims` - iCIMS webhook handler

### How Data Is Stored Today

**In-memory database** (`src/lib/db/index.ts`) for development. Ready to swap for Supabase PostgreSQL in production.

### Testing Framework and How Tests Are Run

**Configured:** Jest + React Testing Library

**Commands:**
```bash
npm test                     # Jest watch mode
npm test -- --watchAll=false # CI mode (70 tests passing)
npm run build                # Production build
```

### Build Commands and Constraints

**Tech stack decision (greenfield):**

| Layer | Technology | Rationale |
|-------|------------|-----------|
| Framework | Next.js 14 (App Router) | Server components, API routes, modern React |
| Language | TypeScript (strict) | Type safety |
| Database | Supabase PostgreSQL | Managed Postgres, RLS, Auth |
| Auth | Supabase Auth | Built-in, handles coordinator login |
| Calendar API | Microsoft Graph | Outlook/M365 integration |
| Styling | Tailwind CSS | Utility-first, fast iteration |
| Testing | Jest + RTL | Standard React testing |
| Deployment | Vercel | Native Next.js hosting |

**Assumptions:**
- Single-tenant initially (one organization)
- Coordinators authenticate via Supabase Auth
- Candidates access public booking links (no auth required)
- Microsoft Graph accessed via application permissions (organizer mailbox pattern)

---

## 2. Architecture (Target State for v2)

### Proposed Folder Structure

```
sched/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── layout.tsx                # Root layout
│   │   ├── page.tsx                  # Landing/redirect
│   │   ├── (auth)/                   # Auth group
│   │   │   ├── login/page.tsx
│   │   │   └── callback/page.tsx
│   │   ├── (coordinator)/            # Authenticated coordinator pages
│   │   │   ├── layout.tsx            # Auth check wrapper
│   │   │   ├── dashboard/page.tsx    # Main coordinator view
│   │   │   ├── requests/
│   │   │   │   ├── page.tsx          # Request list
│   │   │   │   ├── new/page.tsx      # Create request
│   │   │   │   └── [id]/page.tsx     # Request detail
│   │   │   └── settings/page.tsx     # Configuration
│   │   ├── book/                     # Public candidate pages
│   │   │   └── [token]/page.tsx      # Booking page
│   │   └── api/                      # API routes
│   │       ├── scheduling/
│   │       │   ├── requests/route.ts
│   │       │   ├── slots/route.ts
│   │       │   └── book/route.ts
│   │       └── webhooks/
│   │           └── icims/route.ts
│   ├── components/
│   │   ├── ui/                       # Base UI components
│   │   ├── scheduling/               # Scheduling-specific components
│   │   │   ├── SlotPicker.tsx
│   │   │   ├── RequestForm.tsx
│   │   │   ├── RequestList.tsx
│   │   │   └── BookingConfirmation.tsx
│   │   └── layout/                   # Layout components
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── client.ts             # Browser client
│   │   │   ├── server.ts             # Server client
│   │   │   └── admin.ts              # Service role client
│   │   ├── graph/
│   │   │   └── GraphCalendarClient.ts
│   │   ├── icims/
│   │   │   └── IcimsClient.ts
│   │   ├── scheduling/
│   │   │   ├── SlotGenerationService.ts
│   │   │   └── SchedulingService.ts
│   │   └── utils/
│   │       ├── timezone.ts
│   │       └── tokens.ts
│   └── types/
│       ├── scheduling.ts
│       ├── graph.ts
│       └── database.ts
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql
│   └── functions/                    # Edge Functions (Deno)
│       ├── graph-get-schedule/
│       ├── graph-create-event/
│       ├── graph-update-event/
│       └── graph-cancel-event/
├── __tests__/
│   ├── lib/
│   │   ├── SlotGenerationService.test.ts
│   │   ├── GraphCalendarClient.test.ts
│   │   └── SchedulingService.test.ts
│   ├── components/
│   │   └── SlotPicker.test.tsx
│   └── fixtures/
│       ├── graph/
│       └── scheduling/
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.js
└── jest.config.js
```

### Clear Separation of Concerns

| Layer | Responsibility | Location |
|-------|----------------|----------|
| **IcimsClient** | ATS adapter - read candidate/req data, write scheduling notes | `lib/icims/` |
| **GraphCalendarClient** | Calendar adapter - free/busy queries, event CRUD | `lib/graph/` |
| **SlotGenerationService** | Pure function: busy intervals + constraints → available slots | `lib/scheduling/` |
| **SchedulingService** | Orchestration: coordinates all services, handles transactions | `lib/scheduling/` |
| **Supabase** | Persistence: requests, bookings, audit logs | `supabase/` |
| **API Routes** | HTTP layer: request validation, auth checks | `app/api/` |
| **UI Components** | Presentation: coordinator dashboard, candidate booking | `components/` |

### Dependency Flow

```
UI (React Components)
        ↓
API Routes (Next.js)
        ↓
SchedulingService (orchestrator)
        ↓
┌───────────────────────────────────────────────────┐
│ IcimsClient │ GraphCalendarClient │ SlotGenService │
└───────────────────────────────────────────────────┘
        ↓                   ↓
   Supabase DB      Supabase Edge Functions
        ↓                   ↓
   PostgreSQL       Microsoft Graph API
```

---

## 3. Integration Approach Decision

### Options Analysis

**Option A: Organizer Mailbox Pattern (Application Permissions)**
- App authenticates as itself (client credentials flow)
- Creates events on behalf of a designated "organizer" mailbox (e.g., `scheduling@company.com`)
- Uses Exchange application access policy to restrict mailbox access

**Option B: Delegated User Pattern**
- Each coordinator authenticates with their own M365 account
- App acts on behalf of the signed-in user
- Events created appear as "from" that coordinator

### Tradeoffs

| Factor | Organizer Mailbox (A) | Delegated User (B) |
|--------|----------------------|-------------------|
| **Auth complexity** | Simpler - single service principal | Complex - OAuth per user, token storage |
| **Consent model** | Admin grants once | Each user must consent |
| **Event ownership** | All from `scheduling@company.com` | From individual coordinators |
| **Token management** | Single token, centralized refresh | Per-user tokens, refresh logic needed |
| **Offline capability** | Always works (app token) | Fails if user token expires |
| **Audit trail** | Clear: all actions from service account | Mixed with user's manual calendar actions |
| **Implementation effort** | Lower | Higher |
| **User experience** | No OAuth popup for coordinators | OAuth popup required |
| **Scalability** | Single credential set | Grows with user count |
| **Security boundary** | Controlled via Exchange policy | User's own access |

### Decision: **Organizer Mailbox Pattern (Option A)**

**Rationale:**
1. Simpler implementation for greenfield project
2. Supabase Edge Functions can use environment secrets for credentials
3. Events from `scheduling@company.com` clearly identify automated bookings
4. Exchange application access policy provides security boundary
5. No per-user token storage or refresh logic
6. Better audit trail - all scheduling actions traceable to app

**Implementation approach:**
- Register Azure AD application with application permissions
- Configure Exchange application access policy to restrict to organizer mailbox
- Store client credentials in Supabase Edge Function environment variables
- All events created with organizer = `scheduling@company.com`

---

## 4. Microsoft Graph Scope and Flows

### Exact Graph Operations

#### 4.1 getSchedule (Free/Busy)

**Purpose:** Query availability of interviewers for a time range.

**Endpoint:** `POST /users/{organizer}/calendar/getSchedule`

**Request shape:**
```typescript
interface GetScheduleRequest {
  schedules: string[];              // Email addresses to query
  startTime: {
    dateTime: string;               // ISO 8601: "2026-01-15T09:00:00"
    timeZone: string;               // IANA: "America/New_York"
  };
  endTime: {
    dateTime: string;
    timeZone: string;
  };
  availabilityViewInterval: number; // Minutes (15 for our grid)
}
```

**Response shape (from Graph):**
```typescript
interface GetScheduleResponse {
  value: Array<{
    scheduleId: string;             // Email
    availabilityView: string;       // "0000222200002222..." (0=free, 2=busy)
    scheduleItems: Array<{
      status: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere';
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
      subject?: string;             // Null for private events
      isPrivate: boolean;
    }>;
    workingHours: {
      startTime: string;            // "09:00:00.0000000"
      endTime: string;              // "17:00:00.0000000"
      timeZone: { name: string };
      daysOfWeek: string[];
    };
  }>;
}
```

**Normalized internal type:**
```typescript
interface BusyInterval {
  start: Date;                      // UTC
  end: Date;                        // UTC
  status: 'busy' | 'tentative' | 'oof';
  isPrivate: boolean;
}

interface InterviewerAvailability {
  email: string;
  busyIntervals: BusyInterval[];
  workingHours: {
    start: string;                  // "09:00"
    end: string;                    // "17:00"
    timeZone: string;               // IANA timezone
    daysOfWeek: number[];           // 0=Sun, 1=Mon, etc.
  };
}
```

#### 4.2 Create Event

**Endpoint:** `POST /users/{organizer}/events`

**Request shape:**
```typescript
interface CreateEventRequest {
  subject: string;                  // "Interview: {Candidate} for {Role}"
  body: {
    contentType: 'HTML';
    content: string;                // Interview details, instructions
  };
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees: Array<{
    emailAddress: { address: string; name: string };
    type: 'required' | 'optional';
  }>;
  isOnlineMeeting: boolean;
  onlineMeetingProvider: 'teamsForBusiness';
  transactionId: string;            // Idempotency key
}
```

**Response (normalized):**
```typescript
interface CalendarEvent {
  eventId: string;                  // Graph event ID
  iCalUId: string;                  // iCal UID
  webLink: string;                  // Outlook link
  onlineMeeting?: {
    joinUrl: string;                // Teams link
  };
}
```

#### 4.3 Update Event

**Endpoint:** `PATCH /users/{organizer}/events/{eventId}`

**Request:** Partial CreateEventRequest fields.

#### 4.4 Cancel Event

**Endpoint:** `DELETE /users/{organizer}/events/{eventId}`

**Request body (optional):** Cancellation message.

### Time Zone Handling

**Principle:** Store UTC, display local.

```typescript
// Storage: Always UTC
booking.scheduled_start = "2026-01-15T19:00:00Z";

// Display: Convert to candidate's timezone
import { DateTime } from 'luxon';
const display = DateTime.fromISO(booking.scheduled_start)
  .setZone(candidateTimezone)
  .toFormat("ccc, LLL d 'at' h:mm a ZZZZ");
// → "Wed, Jan 15 at 2:00 PM EST"
```

**Graph API handling:**
- Send requests with explicit `timeZone` field (IANA format)
- Parse responses, normalize to UTC immediately
- Never store local times in database

### Private Events Handling

- Private events return `status: 'busy'` but no `subject`
- `isPrivate: true` flag preserved internally
- Slot generation excludes these intervals
- UI never displays private event details

### Room/Resource Calendars

**v3 scope.** Not included in v2.

Future approach: Query room availability via same `getSchedule` API, add as `type: 'resource'` attendee.

### Permissions Plan

**Required Graph permissions (application):**

| Permission | Type | Purpose |
|------------|------|---------|
| `Calendars.Read` | Application | Read free/busy via getSchedule |
| `Calendars.ReadWrite` | Application | Create/update/delete events |
| `OnlineMeetings.ReadWrite.All` | Application | Generate Teams meeting links |

**Exchange Application Access Policy:**

Restrict the app to only access the organizer mailbox:

```powershell
# Create mail-enabled security group
New-DistributionGroup -Name "Scheduler Access" -Type Security

# Add organizer mailbox to group
Add-DistributionGroupMember -Identity "Scheduler Access" -Member scheduling@company.com

# Create access policy
New-ApplicationAccessPolicy `
  -AppId "{azure-app-client-id}" `
  -PolicyScopeGroupId "Scheduler Access" `
  -AccessRight RestrictAccess `
  -Description "Restrict Scheduler app to organizer mailbox only"
```

### Failure Modes and Retries

| Failure | Detection | Recovery |
|---------|-----------|----------|
| **Throttling (429)** | Status code, `Retry-After` header | Exponential backoff, honor header |
| **Transient 5xx** | Status 500, 502, 503, 504 | Retry 3x with 1s, 2s, 4s delays |
| **Token expired (401)** | `InvalidAuthenticationToken` | Refresh token, retry once |
| **Event created, DB fails** | Exception after Graph success | Store orphan event ID, reconcile async |
| **Concurrent booking** | DB unique constraint violation | Return "slot taken", refresh slots |
| **Network timeout** | Request timeout | Retry with same transactionId |

**Idempotency:**
- Generate `transactionId` (UUID) before Graph call
- Store in DB with `pending` status
- Graph dedupes using transactionId
- On retry, same transactionId returns existing event

---

## 5. iCIMS Scope and Flows (v2)

### What v2 Writes to iCIMS

**v2 approach:** Stub adapter that logs locally. No real iCIMS API calls.

**Actions logged:**
1. **Link created** - "Scheduling link generated: {link_id} by {coordinator} at {timestamp}"
2. **Booking confirmed** - "Interview scheduled: {datetime} with {interviewers} - Event: {calendar_event_id}"
3. **Rescheduled** - "Interview rescheduled from {old} to {new} by {actor}"
4. **Cancelled** - "Interview cancelled by {actor}. Reason: {reason}"

### What v2 Reads from iCIMS

**Required context for scheduling:**
- Candidate email (for calendar invite)
- Candidate name (for invite subject)
- Requisition title (for invite subject)
- Hiring manager email (if HM is interviewer)

**v2 source:** Manual entry in coordinator UI, or passed via webhook payload.

**Assumption:** Coordinator enters candidate/req info when creating scheduling request. No live iCIMS query in v2.

### Evolution to Real iCIMS (v3)

**Adapter interface:**

```typescript
interface IIcimsClient {
  addNote(candidateId: string, reqId: string, note: string): Promise<void>;
  getCandidateDetails(candidateId: string): Promise<CandidateDetails>;
  getRequisitionDetails(reqId: string): Promise<RequisitionDetails>;
}
```

**v2 stub:**
```typescript
class IcimsClientStub implements IIcimsClient {
  async addNote(candidateId: string, reqId: string, note: string): Promise<void> {
    // Log to scheduling_audit table
    await supabase.from('scheduling_audit').insert({
      action: 'icims_note_stub',
      payload: { candidateId, reqId, note }
    });
  }

  async getCandidateDetails(candidateId: string): Promise<CandidateDetails> {
    // Return from local scheduling_requests table
    throw new Error('Not available in v2 stub - use manual entry');
  }
}
```

**v3 real implementation:**
```typescript
class IcimsClientReal implements IIcimsClient {
  constructor(private apiKey: string, private baseUrl: string) {}

  async addNote(candidateId: string, reqId: string, note: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/v1/candidates/${candidateId}/notes`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${this.apiKey}` },
      body: JSON.stringify({ content: note })
    });
  }
}
```

**Migration:** Feature flag `USE_REAL_ICIMS` toggles implementation.

---

## 6. Data Model Changes (v2)

### Table: `scheduling_requests`

Coordinator's request to schedule an interview.

```sql
CREATE TABLE scheduling_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context (manual entry in v2, iCIMS-sourced in v3)
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  req_id TEXT,                            -- Optional iCIMS req ID
  req_title TEXT NOT NULL,
  interview_type TEXT NOT NULL,           -- 'phone_screen' | 'hm_screen' | 'onsite' | 'final'
  duration_minutes INTEGER NOT NULL DEFAULT 60,

  -- Participants
  interviewer_emails TEXT[] NOT NULL,
  organizer_email TEXT NOT NULL,          -- scheduling@company.com

  -- Scheduling window
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  candidate_timezone TEXT NOT NULL DEFAULT 'America/New_York',

  -- Public link
  public_token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'booked' | 'cancelled' | 'expired'

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_requests_token ON scheduling_requests(public_token);
CREATE INDEX idx_requests_status ON scheduling_requests(status);
CREATE INDEX idx_requests_created ON scheduling_requests(created_at DESC);
```

### Table: `scheduling_bookings`

Confirmed interview booking.

```sql
CREATE TABLE scheduling_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES scheduling_requests(id),

  -- Calendar event
  calendar_provider TEXT NOT NULL DEFAULT 'microsoft_graph',
  calendar_event_id TEXT NOT NULL,
  calendar_ical_uid TEXT,

  -- Scheduled time
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,

  -- Conference
  conference_join_url TEXT,
  conference_type TEXT DEFAULT 'teams',   -- 'teams' | 'zoom' | 'in_person'

  -- Status
  status TEXT NOT NULL DEFAULT 'confirmed', -- 'confirmed' | 'rescheduled' | 'cancelled'
  cancelled_at TIMESTAMPTZ,
  cancellation_reason TEXT,

  -- Audit
  booked_at TIMESTAMPTZ DEFAULT NOW(),
  booked_by TEXT,                         -- 'candidate' or coordinator user_id

  UNIQUE(calendar_provider, calendar_event_id)
);

CREATE INDEX idx_bookings_request ON scheduling_bookings(request_id);
CREATE INDEX idx_bookings_time ON scheduling_bookings(scheduled_start);
CREATE INDEX idx_bookings_event ON scheduling_bookings(calendar_event_id);
```

### Table: `scheduling_audit`

Audit log for all actions.

```sql
CREATE TABLE scheduling_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  request_id UUID REFERENCES scheduling_requests(id),
  booking_id UUID REFERENCES scheduling_bookings(id),

  action TEXT NOT NULL,                   -- 'link_created' | 'slots_viewed' | 'booked' | 'rescheduled' | 'cancelled'
  actor_type TEXT NOT NULL,               -- 'coordinator' | 'candidate' | 'system'
  actor_id TEXT,

  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_request ON scheduling_audit(request_id);
CREATE INDEX idx_audit_time ON scheduling_audit(created_at DESC);
```

### Migration Strategy

**File:** `supabase/migrations/001_initial_schema.sql`

Contains all three tables, indexes, and RLS policies.

**RLS Policies:**

```sql
-- Enable RLS
ALTER TABLE scheduling_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_audit ENABLE ROW LEVEL SECURITY;

-- Coordinators can see all requests they created
CREATE POLICY "coordinators_own_requests" ON scheduling_requests
  FOR ALL USING (auth.uid() = created_by);

-- Public access for candidate booking (via token, handled in API)
-- No RLS policy - API validates token and uses service role

-- Bookings visible to request creator
CREATE POLICY "coordinators_see_bookings" ON scheduling_bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scheduling_requests
      WHERE scheduling_requests.id = scheduling_bookings.request_id
      AND scheduling_requests.created_by = auth.uid()
    )
  );
```

---

## 7. API and UI Specs (v2)

### API Routes

#### 7.1 Create Scheduling Request

**Route:** `POST /api/scheduling/requests`

**Auth:** Coordinator (Supabase session required)

**Request:**
```typescript
interface CreateRequestBody {
  candidateName: string;
  candidateEmail: string;
  reqId?: string;
  reqTitle: string;
  interviewType: 'phone_screen' | 'hm_screen' | 'onsite' | 'final';
  durationMinutes: number;
  interviewerEmails: string[];
  windowStart: string;            // ISO 8601
  windowEnd: string;
  candidateTimezone: string;      // IANA
}
```

**Response:**
```typescript
interface CreateRequestResponse {
  requestId: string;
  publicLink: string;             // https://sched.app/book/{token}
  expiresAt: string;
}
```

#### 7.2 Get Available Slots (Public)

**Route:** `GET /api/scheduling/slots?token={token}`

**Auth:** None (public, validated via token)

**Response:**
```typescript
interface GetSlotsResponse {
  request: {
    candidateName: string;
    reqTitle: string;
    interviewType: string;
    durationMinutes: number;
  };
  slots: Array<{
    slotId: string;
    start: string;                // UTC ISO
    end: string;
    displayStart: string;         // Formatted in candidate TZ
    displayEnd: string;
  }>;
  timezone: string;
}
```

#### 7.3 Book Slot (Public)

**Route:** `POST /api/scheduling/book`

**Auth:** None (public, validated via token)

**Request:**
```typescript
interface BookSlotBody {
  token: string;
  slotId: string;
}
```

**Response:**
```typescript
interface BookSlotResponse {
  success: boolean;
  booking: {
    scheduledStart: string;
    scheduledEnd: string;
    conferenceJoinUrl?: string;
  };
  message: string;
}
```

#### 7.4 Reschedule (Coordinator)

**Route:** `PATCH /api/scheduling/requests/{id}/reschedule`

**Auth:** Coordinator

**Request:**
```typescript
interface RescheduleBody {
  newStart: string;
  newEnd: string;
  reason?: string;
}
```

#### 7.5 Cancel (Coordinator)

**Route:** `DELETE /api/scheduling/requests/{id}`

**Auth:** Coordinator

**Request:**
```typescript
interface CancelBody {
  reason: string;
  notifyParticipants: boolean;
}
```

#### 7.6 iCIMS Webhook (v3 stub)

**Route:** `POST /api/webhooks/icims`

**Auth:** HMAC signature verification

**v2 behavior:** Log to audit table, no action.

### Auth Model

**Coordinator authentication:**
- Supabase Auth (email/password or OAuth)
- Session stored in HTTP-only cookie
- API routes check `getUser()` from Supabase server client

**Candidate access:**
- No authentication required
- Token in URL validates request
- Rate limited: 10 requests/minute per IP

### Public Token Model

**Generation:**
```typescript
function generatePublicToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
// Result: 64-character hex string (256 bits entropy)
```

**Link format:** `https://sched.example.com/book/{token}`

**Security:**
- Token is unique identifier (not hashed in DB - not a secret, just unguessable)
- Default expiry: 7 days
- Single-use per booking (status changes to 'booked')

**Rate limiting:**
- Track requests per IP in Redis or Supabase table
- Return 429 if > 10 requests/minute
- Implement in API middleware

---

## 8. Deterministic Slot Generation Spec

### Slot Rules

| Rule | Value |
|------|-------|
| Grid interval | 15 minutes |
| Working hours | 9:00 AM - 5:00 PM (interviewer local) |
| Max slots returned | 30 |
| Exclusions | Graph busy intervals, existing bookings |

### Algorithm

```typescript
function generateAvailableSlots(
  request: SchedulingRequest,
  availability: InterviewerAvailability[],
  existingBookings: SchedulingBooking[]
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const durationMs = request.duration_minutes * 60 * 1000;

  // Start at next 15-minute boundary
  let current = roundUpTo15Minutes(new Date(Math.max(
    request.window_start.getTime(),
    Date.now()
  )));

  while (current < request.window_end && slots.length < 30) {
    const slotEnd = new Date(current.getTime() + durationMs);

    // All interviewers must be available
    const allFree = availability.every(ia =>
      isWithinWorkingHours(current, slotEnd, ia) &&
      !overlapsAnyInterval(current, slotEnd, ia.busyIntervals)
    );

    // No existing booking conflict
    const noConflict = !existingBookings.some(b =>
      current < new Date(b.scheduled_end) &&
      slotEnd > new Date(b.scheduled_start)
    );

    if (allFree && noConflict) {
      slots.push({
        slotId: generateSlotId(current, slotEnd, request.interviewer_emails),
        start: current,
        end: slotEnd,
        displayStart: formatInTimezone(current, request.candidate_timezone),
        displayEnd: formatInTimezone(slotEnd, request.candidate_timezone)
      });
    }

    // Next 15-minute slot
    current = new Date(current.getTime() + 15 * 60 * 1000);
  }

  return slots;
}

function roundUpTo15Minutes(date: Date): Date {
  const ms = date.getTime();
  const interval = 15 * 60 * 1000;
  return new Date(Math.ceil(ms / interval) * interval);
}

function isWithinWorkingHours(
  start: Date,
  end: Date,
  availability: InterviewerAvailability
): boolean {
  const tz = availability.workingHours.timeZone;
  const startLocal = DateTime.fromJSDate(start).setZone(tz);
  const endLocal = DateTime.fromJSDate(end).setZone(tz);

  const dayOfWeek = startLocal.weekday % 7; // Luxon: 1=Mon, 7=Sun → convert
  if (!availability.workingHours.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }

  const [startHour, startMin] = availability.workingHours.start.split(':').map(Number);
  const [endHour, endMin] = availability.workingHours.end.split(':').map(Number);

  const workStart = startLocal.set({ hour: startHour, minute: startMin });
  const workEnd = startLocal.set({ hour: endHour, minute: endMin });

  return startLocal >= workStart && endLocal <= workEnd;
}

function generateSlotId(start: Date, end: Date, emails: string[]): string {
  const data = `${start.toISOString()}|${end.toISOString()}|${emails.sort().join(',')}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 16);
}
```

### Timezone Handling

**UTC storage:**
```typescript
// All database timestamps in UTC
booking.scheduled_start = '2026-01-15T19:00:00Z';
```

**Candidate display:**
```typescript
function formatInTimezone(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date)
    .setZone(timezone)
    .toFormat("ccc, LLL d 'at' h:mm a ZZZZ");
}
// → "Wed, Jan 15 at 2:00 PM EST"
```

### Daylight Saving Time Edge Cases

**Handled scenarios:**

1. **DST transition during scheduling window:**
   - Luxon handles conversion correctly
   - Graph API returns accurate busy intervals
   - Working hours comparison uses local time

2. **Interviewer and candidate in different DST zones:**
   - Each sees their correct local time
   - UTC storage ensures no confusion

3. **Spring forward / fall back:**
   - Working in UTC avoids "missing hour" or "duplicate hour" issues
   - Display conversion handles presentation

**Safeguard:**
```typescript
// Always validate IANA timezone names
function isValidTimezone(tz: string): boolean {
  return DateTime.local().setZone(tz).isValid;
}
```

---

## 9. Test Plan

### Unit Tests

**Location:** `__tests__/lib/`

#### SlotGenerationService.test.ts

```typescript
describe('SlotGenerationService', () => {
  describe('generateAvailableSlots', () => {
    it('excludes busy intervals from Graph', () => {
      const availability = [{
        email: 'interviewer@co.com',
        busyIntervals: [
          { start: new Date('2026-01-15T14:00:00Z'), end: new Date('2026-01-15T15:00:00Z') }
        ],
        workingHours: { start: '09:00', end: '17:00', timeZone: 'America/New_York', daysOfWeek: [1,2,3,4,5] }
      }];

      const slots = generateAvailableSlots(request, availability, []);

      expect(slots.find(s =>
        s.start >= new Date('2026-01-15T14:00:00Z') &&
        s.start < new Date('2026-01-15T15:00:00Z')
      )).toBeUndefined();
    });

    it('respects interviewer working hours', () => { /* ... */ });
    it('aligns to 15-minute grid', () => { /* ... */ });
    it('returns max 30 slots', () => { /* ... */ });
    it('handles multiple interviewers (intersection)', () => { /* ... */ });
    it('excludes existing bookings', () => { /* ... */ });
  });

  describe('roundUpTo15Minutes', () => {
    it('rounds 10:07 to 10:15', () => { /* ... */ });
    it('keeps 10:15 as 10:15', () => { /* ... */ });
  });
});
```

#### GraphCalendarClient.test.ts

```typescript
describe('GraphCalendarClient', () => {
  describe('parseGetScheduleResponse', () => {
    it('normalizes busy intervals to UTC', () => { /* ... */ });
    it('marks private events as busy without details', () => { /* ... */ });
    it('extracts working hours', () => { /* ... */ });
  });

  describe('createEvent', () => {
    it('includes transactionId for idempotency', () => { /* ... */ });
    it('generates Teams meeting link when requested', () => { /* ... */ });
  });

  describe('error handling', () => {
    it('retries on 429 with Retry-After', () => { /* ... */ });
    it('retries on transient 5xx', () => { /* ... */ });
  });
});
```

#### SchedulingService.test.ts

```typescript
describe('SchedulingService', () => {
  describe('bookSlot', () => {
    it('creates calendar event and booking record', () => { /* ... */ });
    it('handles concurrent booking (returns slot taken)', () => { /* ... */ });
    it('rejects expired token', () => { /* ... */ });
  });

  describe('createRequest', () => {
    it('generates secure token', () => { /* ... */ });
    it('sets 7-day expiry', () => { /* ... */ });
  });
});
```

#### Token tests

```typescript
describe('Token utilities', () => {
  it('generates 64-character hex token', () => {
    const token = generatePublicToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, generatePublicToken));
    expect(tokens.size).toBe(100);
  });
});
```

### UI Tests

**Location:** `__tests__/components/`

```typescript
describe('SlotPicker', () => {
  it('renders available slots', () => { /* ... */ });
  it('calls onSelect when slot clicked', () => { /* ... */ });
  it('shows loading state', () => { /* ... */ });
  it('shows empty state when no slots', () => { /* ... */ });
});

describe('CandidateBookingPage', () => {
  it('fetches slots on mount', () => { /* ... */ });
  it('shows confirmation after booking', () => { /* ... */ });
  it('shows error for expired link', () => { /* ... */ });
});
```

### Fixture Strategy

```
__tests__/fixtures/
├── graph/
│   ├── getScheduleResponse.json      # Standard response
│   ├── privateEvents.json            # Response with private events
│   ├── emptyCalendar.json            # Fully free calendar
│   └── createdEvent.json             # Event creation response
└── scheduling/
    ├── request.json                  # Sample scheduling request
    ├── booking.json                  # Sample booking
    └── availability.json             # Parsed interviewer availability
```

### CI Commands

```bash
# Must pass before merge
npm test -- --watchAll=false --coverage
npm run build
npm run lint
npx tsc --noEmit
```

---

## 10. Build Plan (Phased)

### Phase 1: Project Setup

**Files created:**
- `package.json` - Next.js 14, TypeScript, Tailwind, dependencies
- `tsconfig.json` - Strict TypeScript config
- `tailwind.config.ts` - Tailwind setup
- `next.config.js` - Next.js config
- `jest.config.js` - Jest setup
- `.env.example` - Environment variable template

**Key setup:**
```bash
npx create-next-app@latest sched --typescript --tailwind --app
npm install @supabase/supabase-js @supabase/ssr luxon
npm install -D @types/luxon jest @testing-library/react
```

**Manual verification:**
- `npm run dev` starts successfully
- `npm test` runs (no tests yet)

---

### Phase 2: Database Schema

**Files created:**
- `supabase/migrations/001_initial_schema.sql`

**Tables added:**
- `scheduling_requests`
- `scheduling_bookings`
- `scheduling_audit`

**Manual verification:**
- Run migration: `supabase db push`
- Verify tables: `supabase db dump`

---

### Phase 3: Types and Interfaces

**Files created:**
- `src/types/scheduling.ts` - Domain types
- `src/types/graph.ts` - Graph API types
- `src/types/database.ts` - Supabase row types

**Key types:**
- `SchedulingRequest`, `SchedulingBooking`, `AvailableSlot`
- `GetScheduleResponse`, `CalendarEvent`
- `Database` (generated from Supabase)

**Manual verification:**
- TypeScript compiles: `npx tsc --noEmit`

---

### Phase 4: Supabase Client Setup

**Files created:**
- `src/lib/supabase/client.ts` - Browser client
- `src/lib/supabase/server.ts` - Server component client
- `src/lib/supabase/admin.ts` - Service role client
- `src/lib/supabase/middleware.ts` - Auth middleware

**Manual verification:**
- Import clients without error

---

### Phase 5: Slot Generation Service

**Files created:**
- `src/lib/scheduling/SlotGenerationService.ts`
- `__tests__/lib/SlotGenerationService.test.ts`
- `__tests__/fixtures/scheduling/availability.json`

**Functions:**
- `generateAvailableSlots()`
- `roundUpTo15Minutes()`
- `isWithinWorkingHours()`
- `overlapsAnyInterval()`
- `generateSlotId()`

**Tests:** 10+ test cases covering all rules

**Manual verification:**
- All tests pass
- Coverage > 90%

---

### Phase 6: Graph Calendar Client

**Files created:**
- `src/lib/graph/GraphCalendarClient.ts`
- `supabase/functions/graph-get-schedule/index.ts`
- `supabase/functions/graph-create-event/index.ts`
- `__tests__/lib/GraphCalendarClient.test.ts`
- `__tests__/fixtures/graph/*.json`

**Functions:**
- `getSchedule()` - Calls Edge Function
- `createEvent()` - Calls Edge Function
- `updateEvent()`, `cancelEvent()`
- `parseGetScheduleResponse()` - Normalizes Graph response

**Manual verification:**
- Deploy Edge Functions: `supabase functions deploy`
- Test with real Graph API

---

### Phase 7: iCIMS Client Stub

**Files created:**
- `src/lib/icims/IcimsClient.ts`
- `src/lib/icims/IcimsClientStub.ts`
- `__tests__/lib/IcimsClient.test.ts`

**Functions:**
- `addNote()` - Logs to audit table
- `getCandidateDetails()` - Throws "not available in v2"

**Manual verification:**
- Stub logs correctly

---

### Phase 8: Scheduling Service

**Files created:**
- `src/lib/scheduling/SchedulingService.ts`
- `__tests__/lib/SchedulingService.test.ts`

**Functions:**
- `createRequest()`
- `getAvailableSlots()`
- `bookSlot()`
- `reschedule()`
- `cancel()`

**Manual verification:**
- Integration test with all dependencies mocked

---

### Phase 9: API Routes

**Files created:**
- `src/app/api/scheduling/requests/route.ts`
- `src/app/api/scheduling/slots/route.ts`
- `src/app/api/scheduling/book/route.ts`
- `src/middleware.ts` - Rate limiting

**Manual verification:**
- Test with curl/Postman
- Verify auth checks work

---

### Phase 10: Coordinator UI

**Files created:**
- `src/app/(coordinator)/layout.tsx`
- `src/app/(coordinator)/dashboard/page.tsx`
- `src/app/(coordinator)/requests/page.tsx`
- `src/app/(coordinator)/requests/new/page.tsx`
- `src/components/scheduling/RequestForm.tsx`
- `src/components/scheduling/RequestList.tsx`

**Manual verification:**
- Login flow works
- Create request shows link
- List shows requests

---

### Phase 11: Candidate Booking Page

**Files created:**
- `src/app/book/[token]/page.tsx`
- `src/components/scheduling/SlotPicker.tsx`
- `src/components/scheduling/BookingConfirmation.tsx`
- `__tests__/components/SlotPicker.test.tsx`

**Manual verification:**
- Access booking page without login
- Select slot, confirm booking
- See confirmation with calendar invite

---

### Phase 12: Polish and Launch

**Tasks:**
- Add loading states and error handling
- Implement rate limiting
- Add audit logging
- Write README with setup instructions
- Configure production environment
- Deploy to Vercel

**Manual verification:**
- Full end-to-end flow works
- All tests pass in CI

---

## Summary

This plan defines a complete greenfield implementation of Scheduler v2 for the Sched repo. Key decisions:

- **Tech stack:** Next.js 14 + TypeScript + Supabase + Tailwind
- **Calendar integration:** Microsoft Graph with organizer mailbox pattern
- **iCIMS:** Stub adapter in v2, real integration in v3
- **Slot generation:** 15-minute grid, max 30 slots, deterministic algorithm
- **Auth:** Supabase Auth for coordinators, public tokens for candidates

The 12-phase build plan provides incremental milestones from project setup through production launch.

---

## Coordinator UX (M5)

The coordinator dashboard at `/coordinator` provides a production-ready interface for daily scheduling operations.

### Dashboard Features

**Status Tabs:**
- All, Pending, Booked, Cancelled, Rescheduled
- Each tab shows live count
- Click to filter by status

**Filters:**
- Age range: 0-2d, 3-7d, 8-14d, 15+d
- Needs Sync: Show only requests with failed sync jobs
- Interviewer: Filter by interviewer email

**Search:**
- Search by candidate email (substring match)
- Search by application ID (substring match)
- Search by request ID (exact match)
- 300ms debounce with loading indicator

**Bulk Operations:**
- Multi-select rows via checkboxes
- Bulk cancel with required reason
- Partial failure handling with per-row status

**Pagination:**
- 20 items per page (configurable)
- URL state sync for shareable filters

### Request Detail Page

**Header:**
- Status badge (pending/booked/cancelled/rescheduled)
- Sync health indicator (OK/PENDING/FAILED)
- Quick actions: Copy Link, Resend Link

**Timeline Panel:**
- Chronological history of all actions
- link_created, booked, rescheduled, cancelled events
- Timestamps and actor information

**Sync Status Panel:**
- Shows all sync jobs for the request
- Failed jobs display: last error, attempts, last run time
- "Retry Sync" button for failed jobs

**Actions:**
- Cancel request (requires reason)
- Reschedule (opens slot picker)
- Copy scheduling link (if pending)

### Error Handling

All coordinator pages include error boundaries with:
- Clear error messages
- Retry buttons where safe
- Context for common errors:
  - 404: Request not found
  - 409: Conflict (slot taken, already cancelled)
  - 410: Link expired
  - 502: Calendar service unavailable

---

## Operator Playbook

### Handling FAILED Sync

When a sync job fails (iCIMS writeback), follow these steps:

1. **Identify the failure:**
   - Dashboard shows red "FAILED" chip on affected requests
   - Use "Needs Sync" filter to find all failed requests

2. **View error details:**
   - Click request to open detail page
   - Sync Status panel shows:
     - Error message
     - Number of attempts (max 5)
     - Last attempted timestamp

3. **Common failure causes:**
   - Network timeout: Transient, retry will likely succeed
   - 401 Unauthorized: iCIMS credentials expired
   - 400 Bad Request: Invalid candidate/req ID

4. **Retry the sync:**
   - Click "Retry Sync" button on the detail page
   - Creates new sync job with status "pending"
   - Worker will process on next run (30s intervals)

5. **If retry fails repeatedly:**
   - Check iCIMS system status
   - Verify credentials in environment variables
   - Contact iCIMS support if issue persists
   - Manual note entry may be required as fallback

### Handling Expired Links

When a scheduling link expires:

1. **Candidate reports expired link:**
   - Search for request by candidate email
   - Check `expiresAt` timestamp on detail page

2. **Options:**
   - Create new scheduling request with same details
   - Extend window if request is still valid (not yet implemented)

3. **Prevention:**
   - Default TTL is 14 days
   - Configure `PUBLIC_LINK_TTL_DAYS` for longer windows
   - Monitor "Pending" requests with high age

### Handling Booking Conflicts

When a slot becomes unavailable after candidate selection:

1. **Candidate sees "Slot no longer available":**
   - Interviewer's calendar changed after slots were generated
   - Multiple candidates booked same slot (race condition)

2. **Resolution:**
   - Candidate can select another available slot
   - Coordinator can reschedule if already booked

3. **Prevention:**
   - Shorter scheduling windows reduce drift
   - Real-time availability check on confirmation

### Handling Graph (Calendar) Failures

When calendar operations fail:

1. **Event creation failed (booking):**
   - Database booking is NOT created
   - Candidate sees error, can retry
   - No orphan calendar events

2. **Event update failed (reschedule):**
   - Original event unchanged
   - Booking record unchanged
   - Retry reschedule operation

3. **Event deletion failed (cancel):**
   - Booking marked cancelled in database
   - Calendar event may persist (orphan)
   - Manual cleanup may be needed

4. **Common causes:**
   - Graph API throttling (429): Wait and retry
   - Token expired: Check service account credentials
   - Mailbox unavailable: Check organizer mailbox status

### Daily Operations Checklist

1. **Morning review:**
   - Check "Pending" tab for requests needing attention
   - Review "Needs Sync" filter for failed writebacks
   - Check requests with age > 7 days

2. **Throughout the day:**
   - Monitor new bookings in "Booked" tab
   - Handle candidate reschedule requests
   - Process cancellations promptly

3. **End of day:**
   - Retry any remaining failed syncs
   - Follow up on stale pending requests
   - Review cancelled requests for patterns

### Filter Bookmarks

Useful URL bookmarks for common views:

```
# All pending, oldest first
/coordinator?status=pending&sortBy=createdAt&sortOrder=asc

# Requests needing sync attention
/coordinator?needsSync=true

# Old pending requests (>7 days)
/coordinator?status=pending&ageRange=8-14d,15+d

# Today's bookings
/coordinator?status=booked&ageRange=0-2d
```
