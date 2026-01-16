# Scheduler M7.5: Standalone Mode (Personal Calendar Integration)

**Version:** 1.0
**Created:** 2026-01-15
**Status:** Planning

This milestone makes the scheduling tool standalone - usable without enterprise Azure AD setup or ATS integration. Users connect their personal Google or Microsoft calendars via OAuth.

---

## 1. Goals

1. **No Enterprise Setup Required** - Works with personal Gmail/Outlook accounts
2. **Multi-User Support** - Multiple coordinators, each with their own calendar
3. **Automatic Availability** - Query interviewer calendars when connected
4. **ATS-Optional** - iCIMS integration becomes optional, not required
5. **Both Calendar Providers** - Google Calendar and Microsoft (Outlook/Office 365)

---

## 2. User Flows

### 2.1 Coordinator Onboarding

```
1. Coordinator visits /signup
2. Signs in with Google or Microsoft (OAuth)
3. Grants calendar permissions (read/write events, read free/busy)
4. Lands on dashboard - ready to create scheduling requests
```

### 2.2 Creating a Scheduling Request

```
1. Coordinator clicks "New Request"
2. Enters: candidate name, email, interview type, duration
3. Adds interviewers by email
4. System checks which interviewers have connected calendars
5. For connected interviewers: auto-query availability
6. For non-connected: coordinator specifies time windows manually
7. System generates candidate booking link
```

### 2.3 Interviewer Calendar Connection

```
1. Interviewer receives email: "Connect your calendar for scheduling"
2. Clicks link, signs in with Google/Microsoft
3. Grants read-only free/busy access
4. Future requests auto-check their availability
```

### 2.4 Candidate Booking (unchanged)

```
1. Candidate receives booking link
2. Views available slots (already filtered by interviewer availability)
3. Selects slot, confirms
4. Event created in coordinator's calendar with all attendees
```

---

## 3. Architecture

### 3.1 Authentication

Use **NextAuth.js** for simplicity:
- Providers: Google, Microsoft (Azure AD with personal accounts)
- Session management built-in
- JWT or database sessions

```typescript
// auth options
providers: [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorization: {
      params: {
        scope: 'openid email profile https://www.googleapis.com/auth/calendar',
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  }),
  AzureADProvider({
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
    tenantId: 'common', // Allow personal + work accounts
    authorization: {
      params: {
        scope: 'openid email profile offline_access Calendars.ReadWrite',
      },
    },
  }),
]
```

### 3.2 Database Schema

```sql
-- Users (coordinators and interviewers)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'coordinator', -- 'coordinator' | 'interviewer'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Calendar connections (one per user per provider)
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL, -- 'google' | 'microsoft'
  provider_account_id TEXT NOT NULL, -- Google/Microsoft user ID
  email TEXT NOT NULL, -- Calendar email
  access_token TEXT NOT NULL, -- Encrypted
  refresh_token TEXT, -- Encrypted
  token_expires_at TIMESTAMP,
  scopes TEXT[], -- Granted scopes
  is_primary BOOLEAN DEFAULT false, -- Primary calendar for this user
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, provider)
);

-- Interviewer invitations (pending calendar connections)
CREATE TABLE interviewer_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  invited_by UUID REFERENCES users(id),
  token TEXT UNIQUE NOT NULL, -- For invitation link
  accepted_at TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Update scheduling_requests to reference coordinator
ALTER TABLE scheduling_requests
  ADD COLUMN coordinator_id UUID REFERENCES users(id),
  ADD COLUMN calendar_connection_id UUID REFERENCES calendar_connections(id);
```

### 3.3 Calendar Client Interface

```typescript
// Unified interface for both providers
interface CalendarClient {
  // Get free/busy for emails (only works for connected users)
  getFreeBusy(
    emails: string[],
    startTime: Date,
    endTime: Date
  ): Promise<FreeBusyResponse[]>;

  // Create event in user's primary calendar
  createEvent(payload: CreateEventPayload): Promise<CreatedEvent>;

  // Update event
  updateEvent(eventId: string, payload: UpdateEventPayload): Promise<void>;

  // Cancel/delete event
  cancelEvent(eventId: string, notifyAttendees: boolean): Promise<void>;
}

interface FreeBusyResponse {
  email: string;
  connected: boolean; // Whether we could query this user
  busyIntervals: BusyInterval[];
  error?: string; // If query failed
}
```

### 3.4 File Structure

```
src/
├── lib/
│   ├── auth/
│   │   ├── authOptions.ts        # NextAuth configuration
│   │   └── index.ts
│   ├── calendar/
│   │   ├── CalendarClient.ts     # Interface
│   │   ├── GoogleCalendarClient.ts
│   │   ├── MicrosoftCalendarClient.ts
│   │   ├── CalendarClientFactory.ts
│   │   └── index.ts
│   ├── users/
│   │   ├── UserService.ts
│   │   └── index.ts
│   └── ...existing...
├── app/
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...nextauth]/route.ts
│   │   ├── calendar/
│   │   │   ├── connect/route.ts   # OAuth callback handling
│   │   │   └── status/route.ts    # Check connection status
│   │   ├── interviewers/
│   │   │   ├── invite/route.ts    # Send invitation
│   │   │   └── [token]/route.ts   # Accept invitation
│   │   └── ...existing...
│   ├── (auth)/
│   │   ├── signin/page.tsx
│   │   └── signup/page.tsx
│   ├── settings/
│   │   └── page.tsx               # Manage calendar connections
│   └── ...existing...
```

---

## 4. Calendar Provider Details

### 4.1 Google Calendar

**OAuth Scopes:**
- `https://www.googleapis.com/auth/calendar` - Full calendar access (for coordinators)
- `https://www.googleapis.com/auth/calendar.readonly` - Read-only (for interviewers)
- `https://www.googleapis.com/auth/calendar.freebusy` - Free/busy only (minimal interviewer scope)

**API Endpoints:**
- Free/Busy: `POST https://www.googleapis.com/calendar/v3/freeBusy`
- Create Event: `POST https://www.googleapis.com/calendar/v3/calendars/primary/events`
- Update Event: `PATCH https://www.googleapis.com/calendar/v3/calendars/primary/events/{eventId}`
- Delete Event: `DELETE https://www.googleapis.com/calendar/v3/calendars/primary/events/{eventId}`

**Setup:**
1. Create project in Google Cloud Console
2. Enable Google Calendar API
3. Configure OAuth consent screen
4. Create OAuth 2.0 credentials
5. Add authorized redirect URIs

### 4.2 Microsoft (Personal + Work)

**OAuth Scopes:**
- `Calendars.ReadWrite` - Full calendar access (for coordinators)
- `Calendars.Read` - Read-only (for interviewers)
- `offline_access` - Refresh tokens

**Tenant Configuration:**
- Use `common` tenant to allow both personal Microsoft accounts and work/school accounts
- Or use `consumers` for personal-only, `organizations` for work-only

**API Endpoints:**
- Free/Busy: `POST https://graph.microsoft.com/v1.0/me/calendar/getSchedule`
- Create Event: `POST https://graph.microsoft.com/v1.0/me/calendar/events`
- Update Event: `PATCH https://graph.microsoft.com/v1.0/me/calendar/events/{eventId}`
- Delete Event: `DELETE https://graph.microsoft.com/v1.0/me/calendar/events/{eventId}`

**Note:** For personal accounts, free/busy queries only work for the signed-in user's own calendar. To query other users, they must also be connected.

---

## 5. Token Management

### 5.1 Storage

- Store tokens encrypted in database (use `crypto` module or similar)
- Environment variable for encryption key: `TOKEN_ENCRYPTION_KEY`

### 5.2 Refresh Logic

```typescript
class TokenManager {
  async getValidToken(connectionId: string): Promise<string> {
    const connection = await getCalendarConnection(connectionId);

    // Check if token expires within 5 minutes
    if (connection.tokenExpiresAt < Date.now() + 5 * 60 * 1000) {
      return this.refreshToken(connection);
    }

    return decrypt(connection.accessToken);
  }

  async refreshToken(connection: CalendarConnection): Promise<string> {
    const provider = connection.provider;
    const refreshToken = decrypt(connection.refreshToken);

    // Provider-specific refresh
    const newTokens = provider === 'google'
      ? await this.refreshGoogleToken(refreshToken)
      : await this.refreshMicrosoftToken(refreshToken);

    // Update database
    await updateCalendarConnection(connection.id, {
      accessToken: encrypt(newTokens.accessToken),
      refreshToken: newTokens.refreshToken ? encrypt(newTokens.refreshToken) : undefined,
      tokenExpiresAt: newTokens.expiresAt,
    });

    return newTokens.accessToken;
  }
}
```

---

## 6. Availability Logic

### 6.1 Mixed Availability (Connected + Manual)

When creating a scheduling request:

```typescript
async function getInterviewerAvailability(
  interviewerEmails: string[],
  startTime: Date,
  endTime: Date,
  manualWindows?: TimeWindow[]
): Promise<AvailabilityResult> {
  // 1. Check which interviewers have connected calendars
  const connections = await getCalendarConnectionsByEmails(interviewerEmails);
  const connectedEmails = new Set(connections.map(c => c.email));

  // 2. Query connected calendars
  const freeBusyResults: FreeBusyResponse[] = [];

  for (const connection of connections) {
    const client = CalendarClientFactory.create(connection);
    const result = await client.getFreeBusy([connection.email], startTime, endTime);
    freeBusyResults.push(...result);
  }

  // 3. For non-connected, use manual windows or flag as "unknown"
  const notConnected = interviewerEmails.filter(e => !connectedEmails.has(e));

  return {
    connected: freeBusyResults,
    notConnected,
    manualWindows: manualWindows || null,
  };
}
```

### 6.2 Slot Generation Update

Update `SlotGenerationService` to handle mixed availability:

```typescript
function generateSlots(
  availability: AvailabilityResult,
  duration: number,
  candidateTimezone: string
): AvailableSlot[] {
  // If any interviewer is not connected and no manual windows provided,
  // use coordinator-specified windows as the constraint

  // Merge busy intervals from all connected interviewers
  // Apply manual windows as additional constraints
  // Generate slots that work for everyone
}
```

---

## 7. ATS-Optional Mode

### 7.1 Configuration

```bash
# .env
ATS_MODE=disabled  # 'icims' | 'disabled'
```

### 7.2 Code Changes

```typescript
// IcimsWritebackService.ts
class IcimsWritebackService {
  async writeNote(requestId: string, noteType: string, payload: any) {
    if (process.env.ATS_MODE === 'disabled') {
      console.log('[ATS] Skipping writeback - ATS disabled');
      return { success: true, skipped: true };
    }

    // Existing iCIMS logic...
  }
}
```

Remove applicationId requirement from scheduling request creation when ATS disabled.

---

## 8. UI Changes

### 8.1 New Pages

| Page | Purpose |
|------|---------|
| `/signin` | Sign in with Google or Microsoft |
| `/signup` | Same as signin (OAuth handles both) |
| `/settings` | Manage calendar connections |
| `/settings/calendar` | Connect/disconnect calendars |
| `/invite/[token]` | Interviewer invitation acceptance |

### 8.2 Dashboard Updates

- Show which interviewers have connected calendars
- Warning when creating request with non-connected interviewers
- Option to send calendar connection invitations

### 8.3 Onboarding Flow

```
/welcome
  └── Step 1: Connect your calendar (required)
  └── Step 2: Invite your team (optional)
  └── Step 3: Create first request
```

---

## 9. Implementation Phases

### Phase 1: Authentication & Database (2-3 days)
- [ ] Set up NextAuth.js with Google and Microsoft providers
- [ ] Create database migrations for users, calendar_connections
- [ ] Basic signin/signout flow
- [ ] Protected routes middleware

### Phase 2: Google Calendar Integration (2-3 days)
- [ ] GoogleCalendarClient implementation
- [ ] Token storage and refresh
- [ ] Free/busy queries
- [ ] Event CRUD operations
- [ ] Integration tests

### Phase 3: Microsoft Calendar Integration (2 days)
- [ ] MicrosoftCalendarClient (delegated flow)
- [ ] Token storage and refresh
- [ ] Free/busy queries
- [ ] Event CRUD operations
- [ ] Integration tests

### Phase 4: Interviewer Invitations (1-2 days)
- [ ] Invitation creation and email sending
- [ ] Invitation acceptance flow
- [ ] Interviewer calendar connection (read-only)
- [ ] Mixed availability logic

### Phase 5: ATS-Optional Mode (1 day)
- [ ] ATS_MODE configuration
- [ ] Skip writeback when disabled
- [ ] Remove applicationId requirement
- [ ] Update UI to hide ATS fields

### Phase 6: UI & Polish (2-3 days)
- [ ] Settings page for calendar management
- [ ] Onboarding wizard
- [ ] Dashboard updates for interviewer status
- [ ] Error handling and edge cases

---

## 10. Environment Variables

```bash
# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<random-secret>

# Google OAuth
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Microsoft OAuth (common tenant for personal + work)
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=

# Token encryption
TOKEN_ENCRYPTION_KEY=<32-byte-hex-key>

# ATS Mode
ATS_MODE=disabled  # or 'icims'

# Existing (when ATS_MODE=icims)
ICIMS_API_KEY=
ICIMS_BASE_URL=
```

---

## 11. Security Considerations

1. **Token Encryption** - All OAuth tokens encrypted at rest
2. **Minimal Scopes** - Request only necessary permissions
3. **Token Refresh** - Handle token expiry gracefully
4. **Session Security** - Use secure, httpOnly cookies
5. **CSRF Protection** - NextAuth handles this
6. **Interviewer Scope** - Read-only access for interviewers

---

## 12. Success Criteria

- [ ] User can sign up with Google or Microsoft account
- [ ] Calendar events created in user's own calendar
- [ ] Interviewer calendar connection flow works
- [ ] Mixed availability (connected + manual) generates correct slots
- [ ] App works fully without ATS configuration
- [ ] Existing flows (candidate booking, coordinator dashboard) still work
- [ ] All existing tests pass + new tests for calendar clients

---

## 13. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| OAuth token expiry during booking | High | Proactive refresh, graceful error handling |
| Google/Microsoft API rate limits | Medium | Caching, batch requests where possible |
| Mixed provider complexity | Medium | Unified interface, thorough testing |
| Migration from app-only to delegated | Medium | Support both modes, feature flag |
| Interviewer doesn't connect calendar | Low | Fall back to manual time windows |

---

*Last updated: January 2026*
