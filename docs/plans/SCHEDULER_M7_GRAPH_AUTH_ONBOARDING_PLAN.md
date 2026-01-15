# Scheduler M7: Microsoft Graph Authentication & Tenant Onboarding

**Version:** 1.0
**Created:** 2026-01-15
**Status:** Planned

This document defines the implementation plan for Milestone M7 - enabling real Microsoft Graph API authentication using app permissions (client credentials flow) with an organizer mailbox pattern.

---

## 1. Current State

### GraphCalendarClient Architecture

The repo has a well-designed abstraction for Graph API operations:

```
src/lib/graph/
├── GraphCalendarClient.ts      # Interface + factory function
├── GraphCalendarClientMock.ts  # Mock implementation (in-memory)
├── types.ts                    # Graph API response types
└── index.ts                    # Exports
```

**Key Files:**
- `GraphCalendarClient.ts:56-67` - Factory function checks `GRAPH_MODE` env var
- `GraphCalendarClientMock.ts` - Full mock with fixture overrides for testing
- `types.ts` - Graph API types already defined (GraphEvent, GraphScheduleItem, etc.)

**Current Mode Selection:**
```typescript
// GraphCalendarClient.ts:56-67
export function getGraphCalendarClient(): GraphCalendarClient {
  const mode = process.env.GRAPH_MODE || 'mock';
  if (mode === 'mock') {
    const { GraphCalendarClientMock } = require('./GraphCalendarClientMock');
    return new GraphCalendarClientMock();
  }
  // TODO: Implement real Graph client
  throw new Error('Real Graph client not yet implemented. Set GRAPH_MODE=mock');
}
```

**Existing Interface Methods:**
1. `getSchedule(emails, startUtc, endUtc, intervalMinutes)` → `InterviewerAvailability[]`
2. `createEvent(organizerEmail, payload)` → `CreatedEvent`
3. `updateEvent(organizerEmail, eventId, payload)` → `void`
4. `cancelEvent(organizerEmail, eventId, cancelMessage?)` → `void`

### Environment Configuration

`.env.example` already defines the expected variables:
```bash
GRAPH_MODE=mock
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
GRAPH_ORGANIZER_EMAIL=scheduling@example.com
```

### Existing Type Definitions

`TenantIntegrationConfig` already defined in `types/scheduling.ts:63-73`:
```typescript
export interface TenantIntegrationConfig {
  id: string;
  graph: {
    tenantId: string;
    clientId: string;
    clientSecretRef: string; // Reference to secret, not the actual secret
    organizerEmail: string;
  };
  createdAt: Date;
  updatedAt: Date;
}
```

---

## 2. Target Authentication Model

### App Permissions (Client Credentials Flow)

We will use **application permissions** (not delegated) because:
1. No user sign-in required - daemon/service pattern
2. Allows scheduling on behalf of organizer mailbox
3. Single set of credentials per tenant
4. Can restrict scope via Exchange Application Access Policies

**Token Flow:**
```
App → Azure AD Token Endpoint → Access Token → Microsoft Graph API
```

No redirect URIs needed for client credentials flow.

### Organizer Mailbox Pattern

All calendar events are created in a **dedicated organizer mailbox** (e.g., `scheduling@company.com`):
- Service owns the calendar
- Interviewers and candidates are attendees
- Single mailbox simplifies permission scoping
- Clear audit trail - all events from one source

---

## 3. Azure AD App Registration Requirements

### App Registration Settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Tenant Type** | Single tenant (this org only) | Enterprise app, not multi-tenant SaaS |
| **Redirect URIs** | None required | Client credentials flow has no redirect |
| **Credentials** | Client Secret (recommended for MVP) | Simpler than certificate; rotate every 2 years |
| **Token Version** | v2.0 | Modern endpoint |

### Required API Permissions (Application)

| Permission | Type | Required For |
|------------|------|--------------|
| `Calendars.ReadBasic.All` | Application | getSchedule (free/busy) for interviewers - **least privileged** |
| `Calendars.ReadWrite` | Application | Create/update/delete events in organizer mailbox |
| `OnlineMeetings.ReadWrite.All` | Application | Create Teams meetings (optional enhancement) |

**Minimum Required (Least Privilege):**
- `Calendars.ReadBasic.All` - Sufficient for `getSchedule` to query free/busy availability; does not expose event details
- `Calendars.ReadWrite` - For event CRUD on organizer mailbox only (scoped via RBAC/Access Policy)

**Why NOT Schedule.Read.All:**
- `Schedule.Read.All` is more permissive than needed
- `Calendars.ReadBasic.All` provides free/busy data without exposing calendar event subjects/bodies
- Aligns with Microsoft's least-privilege guidance for scheduling scenarios

**Note:** Admin consent required for all application permissions.

---

## 4. Microsoft Graph Endpoints

### Endpoints Used in Real Mode

| Operation | HTTP Method | Endpoint |
|-----------|-------------|----------|
| **Get Free/Busy** | POST | `/users/{organizerEmail}/calendar/getSchedule` |
| **Create Event** | POST | `/users/{organizerEmail}/calendar/events` |
| **Update Event** | PATCH | `/users/{organizerEmail}/calendar/events/{eventId}` |
| **Cancel Event** | DELETE | `/users/{organizerEmail}/calendar/events/{eventId}` |

**Request Headers:**
```http
Authorization: Bearer {access_token}
Content-Type: application/json
Prefer: outlook.timezone="UTC"
```

### getSchedule Request Body

```json
{
  "schedules": ["interviewer1@company.com", "interviewer2@company.com"],
  "startTime": { "dateTime": "2026-01-15T09:00:00", "timeZone": "UTC" },
  "endTime": { "dateTime": "2026-01-22T17:00:00", "timeZone": "UTC" },
  "availabilityViewInterval": 30
}
```

### Create Event Request Body

```json
{
  "subject": "Interview: Jane Doe - Software Engineer",
  "body": { "contentType": "HTML", "content": "..." },
  "start": { "dateTime": "2026-01-20T14:00:00", "timeZone": "UTC" },
  "end": { "dateTime": "2026-01-20T14:30:00", "timeZone": "UTC" },
  "attendees": [
    { "emailAddress": { "address": "jane@candidate.com", "name": "Jane Doe" }, "type": "required" },
    { "emailAddress": { "address": "interviewer@company.com", "name": "John Smith" }, "type": "required" }
  ],
  "isOnlineMeeting": true,
  "onlineMeetingProvider": "teamsForBusiness",
  "transactionId": "booking-uuid-here"
}
```

---

## 5. Restricting Scope (Mailbox Access Control)

### Problem

Application permissions like `Calendars.ReadWrite` grant access to **all** mailboxes by default. This is overly permissive.

### Two Approaches

Microsoft provides two mechanisms to restrict application access to specific mailboxes:

| Approach | Status | Complexity | Granularity |
|----------|--------|------------|-------------|
| **Application Access Policies** | Legacy (still supported) | Medium | Group-based |
| **RBAC for Applications** | Modern (recommended) | Higher | Role-based, more flexible |

### Decision: Use Application Access Policies for MVP

**Rationale:**
1. Simpler to configure via PowerShell
2. Well-documented and battle-tested
3. RBAC for Applications is newer with less community documentation
4. Sufficient for single-tenant, organizer-mailbox pattern
5. Can migrate to RBAC later if needed

**Future Consideration:** When multi-tenant support is added, evaluate RBAC for Applications for finer-grained control.

### Solution: Exchange Online Application Access Policy

**Steps:**

1. **Create a mail-enabled security group** in Azure AD
   - Name: `Sched-Allowed-Mailboxes`
   - Add the organizer mailbox (`scheduling@company.com`)
   - Add interviewer mailboxes whose calendars we query for free/busy

2. **Create Application Access Policy** via Exchange Online PowerShell:
   ```powershell
   # Connect to Exchange Online
   Connect-ExchangeOnline -UserPrincipalName admin@company.com

   # Create the policy
   New-ApplicationAccessPolicy `
     -AppId "<GRAPH_CLIENT_ID>" `
     -PolicyScopeGroupId "Sched-Allowed-Mailboxes@company.com" `
     -AccessRight RestrictAccess `
     -Description "Restrict Sched app to scheduling mailboxes"
   ```

3. **Test the policy:**
   ```powershell
   # Should return "Granted" for in-scope mailbox
   Test-ApplicationAccessPolicy `
     -Identity "scheduling@company.com" `
     -AppId "<GRAPH_CLIENT_ID>"

   # Should return "Denied" for out-of-scope mailbox
   Test-ApplicationAccessPolicy `
     -Identity "ceo@company.com" `
     -AppId "<GRAPH_CLIENT_ID>"
   ```

### Scope Validation Checklist

Before going live, verify the policy works correctly:

| Test | Expected Result | Command |
|------|-----------------|---------|
| Organizer mailbox access | `AccessCheckResult: Granted` | `Test-ApplicationAccessPolicy -Identity "scheduling@company.com" -AppId "<CLIENT_ID>"` |
| Interviewer mailbox access | `AccessCheckResult: Granted` | `Test-ApplicationAccessPolicy -Identity "interviewer@company.com" -AppId "<CLIENT_ID>"` |
| Out-of-scope mailbox denied | `AccessCheckResult: Denied` | `Test-ApplicationAccessPolicy -Identity "ceo@company.com" -AppId "<CLIENT_ID>"` |
| API call to in-scope succeeds | HTTP 200 | `POST /users/scheduling@company.com/calendar/getSchedule` |
| API call to out-of-scope fails | HTTP 403 | `POST /users/ceo@company.com/calendar/getSchedule` |

### RBAC for Applications (Future Reference)

For reference, the modern RBAC approach would involve:
1. Creating a custom management scope in Exchange Online
2. Assigning the `Application Mail.Read` or `Application Calendars.ReadWrite` role
3. Binding the service principal to the management scope

This provides more granular control but requires deeper Exchange Online administration knowledge.

---

## 6. Tenant Configuration Model

### Runtime Config Structure

```typescript
interface GraphConfig {
  mode: 'mock' | 'real';
  tenantId: string;
  clientId: string;
  clientSecret: string;        // Loaded from env/secret manager
  organizerEmail: string;
  allowedGroupId?: string;     // For documentation/validation
  tokenEndpoint?: string;      // Override for testing
}
```

### Environment Variables (Production)

```bash
# Mode
GRAPH_MODE=real

# Azure AD App Registration
GRAPH_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GRAPH_CLIENT_ID=yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy
GRAPH_CLIENT_SECRET=<secret-from-vault>

# Organizer Mailbox
GRAPH_ORGANIZER_EMAIL=scheduling@company.com

# Optional: Rate limiting config
GRAPH_MAX_RETRIES=3
GRAPH_RETRY_DELAY_MS=1000
```

### Secrets Management

| Environment | Secret Storage | Approach |
|-------------|---------------|----------|
| **Local Dev** | `.env.local` (gitignored) | Direct value, never commit |
| **CI/CD** | GitHub Actions Secrets | Injected as env vars |
| **Production** | Vercel Environment Variables | Encrypted at rest, injected at runtime |
| **Future** | Azure Key Vault | Reference by name, rotate automatically |

**Current Approach (MVP):**
- Store `GRAPH_CLIENT_SECRET` in Vercel environment variables
- Mark as "sensitive" so it's not exposed in logs
- Rotate every 12-24 months (set reminder)

---

## 7. Error Handling & Observability

### Error Categories

| Category | HTTP Status | Action |
|----------|-------------|--------|
| **Auth failure** | 401 | Refresh token, log to /ops |
| **Forbidden** | 403 | Check permissions, alert ops |
| **Not found** | 404 | Event deleted externally, update state |
| **Rate limited** | 429 | Exponential backoff, use `Retry-After` header |
| **Transient** | 500, 502, 503, 504 | Retry with backoff |
| **Bad request** | 400 | Log details, don't retry, alert ops |

### Token Management

#### Token Cache Strategy

**Cache Key:**
```
graph_token:{tenantId}:{clientId}
```
For single-tenant MVP, this simplifies to a single cached token. Multi-tenant would require per-tenant cache entries.

**TTL and Early Refresh:**
- Azure AD tokens expire in 3600 seconds (1 hour) by default
- Cache with actual `expires_in` from token response
- **Early refresh window:** 300 seconds (5 minutes) before expiry
- Effective cache TTL = `expires_in - 300` seconds

**Single-Flight Locking:**
To prevent thundering herd when multiple requests hit an expired token:
```typescript
class GraphTokenManager {
  private accessToken: string | null = null;
  private expiresAt: number = 0; // Unix timestamp ms
  private refreshPromise: Promise<string> | null = null;

  private readonly EARLY_REFRESH_MS = 300_000; // 5 minutes

  async getToken(): Promise<string> {
    const now = Date.now();

    // Return cached token if valid (with early refresh buffer)
    if (this.accessToken && this.expiresAt - this.EARLY_REFRESH_MS > now) {
      return this.accessToken;
    }

    // Single-flight: if refresh already in progress, wait for it
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    // Start refresh and store promise for concurrent callers
    this.refreshPromise = this.doRefresh();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(): Promise<string> {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
      }),
    });

    if (!response.ok) {
      await this.logTokenFailure(response);
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in * 1000);

    await this.logTokenSuccess();
    return this.accessToken;
  }
}
```

**Cold Start Behavior (Serverless):**
- On Vercel/serverless cold start, in-memory cache is empty
- First request will fetch a new token (adds ~200-500ms latency)
- Subsequent requests in same instance reuse cached token
- Token persists across warm requests for ~1 hour
- **Accepted trade-off:** Cold starts incur token fetch penalty; this is acceptable for interview scheduling (not latency-critical)

**On 401 Response:**
1. Clear cached token immediately
2. Fetch new token
3. Retry original request once
4. If still fails, surface error to caller

### Retry Logic

#### Rate Limiting (429) Handling

**Behavior:**
1. On 429 response, extract `Retry-After` header (seconds or HTTP date)
2. If `Retry-After` present, wait exactly that duration
3. If `Retry-After` absent, use exponential backoff: `min(baseDelay * 2^attempt, maxDelay)`
4. Add jitter to prevent thundering herd: `delay * (0.5 + random() * 0.5)`

**Constants:**
```typescript
const RETRY_BASE_DELAY_MS = 1000;    // 1 second
const RETRY_MAX_DELAY_MS = 30000;    // 30 seconds cap
const MAX_RETRIES = 3;
```

**Implementation:**

```typescript
interface GraphError extends Error {
  status: number;
  retryAfter?: number; // seconds
  isTransient: boolean;
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;

  // Try parsing as seconds
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;

  // Try parsing as HTTP date
  const date = Date.parse(header);
  if (!isNaN(date)) return Math.max(0, date - Date.now());

  return null;
}

function calculateDelay(attempt: number, retryAfterMs: number | null): number {
  if (retryAfterMs !== null) {
    // Use server-specified delay with small jitter
    return retryAfterMs + Math.random() * 500;
  }

  // Exponential backoff with jitter
  const exponentialDelay = Math.min(
    RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1),
    RETRY_MAX_DELAY_MS
  );
  const jitter = exponentialDelay * (0.5 + Math.random() * 0.5);
  return Math.floor(jitter);
}

async function withGraphRetry<T>(
  operation: () => Promise<T>,
  context: { operation: string; entityId?: string }
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const graphError = error as GraphError;

      // Log the error
      await logGraphError(graphError, attempt, context);

      // Don't retry non-transient errors
      if (!graphError.isTransient || attempt >= MAX_RETRIES) {
        throw error;
      }

      // Calculate delay
      const retryAfterMs = graphError.status === 429
        ? parseRetryAfter(graphError.retryAfter?.toString() ?? null)
        : null;
      const delay = calculateDelay(attempt, retryAfterMs);

      // Log retry intent
      console.log(`[Graph] Retry ${attempt}/${MAX_RETRIES} after ${delay}ms for ${context.operation}`);

      await sleep(delay);
    }
  }
  throw new Error('Unreachable');
}

function isTransientError(status: number): boolean {
  return status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}
```

### Observability in /ops

#### Graph Health Dashboard Card

Add to ops health dashboard (`/ops`):
- **Graph API Health** card showing:
  - Last successful call timestamp
  - Error rate (last 24h)
  - Token expiry countdown
  - Current token status (valid/expired/refreshing)

#### Ops Metrics

Track these metrics in the audit log / ops API:

| Metric | Audit Action | Description |
|--------|--------------|-------------|
| Token fetch success | `graph_token_success` | Successful token acquisition |
| Token fetch failure | `graph_token_failed` | Failed token acquisition (with error details) |
| Rate limited (429) | `graph_rate_limited` | 429 response received (includes Retry-After value) |
| Transient error | `graph_transient_error` | 5xx error received |
| API call success | `graph_call_success` | Successful Graph API call |
| API call failed | `graph_call_failed` | Failed Graph API call (after retries exhausted) |

#### Ops API Endpoint

Create `GET /api/ops/graph` returning:
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "tokenStatus": {
    "valid": true,
    "expiresAt": "2026-01-15T10:00:00Z",
    "expiresInSeconds": 2400
  },
  "metrics": {
    "last24h": {
      "totalCalls": 150,
      "successfulCalls": 148,
      "rateLimited": 1,
      "transientErrors": 1,
      "tokenRefreshes": 3,
      "tokenFailures": 0
    }
  },
  "lastSuccessfulCall": "2026-01-15T09:30:00Z",
  "lastError": null
}
```

---

## 8. Assumptions

1. **Single Tenant MVP:** This plan assumes single-tenant deployment. Multi-tenant support would require storing config per tenant in database.

2. **Client Secret:** Using client secret for authentication. Certificate-based auth is more secure but adds operational complexity.

3. **Organizer Mailbox Exists:** Assumes `scheduling@company.com` (or configured email) exists as a licensed Exchange Online mailbox.

4. **Admin Consent Available:** Assumes Azure AD admin can grant application permissions and configure access policies.

5. **No Delegated Auth:** This plan does not cover coordinator sign-in (that's M7 in roadmap). This is strictly Graph API service auth.

6. **Vercel Deployment:** Assumes Vercel for production secrets management. Approach adapts to other platforms.

---

## 9. Implementation Steps

### Step 1: Create GraphCalendarClientReal Class

**Files:**
- Create `src/lib/graph/GraphCalendarClientReal.ts`

**Tasks:**
- Implement `GraphCalendarClient` interface
- Add token management (acquisition, caching, refresh)
- Implement all four methods: getSchedule, createEvent, updateEvent, cancelEvent
- Use existing types from `types.ts`

### Step 2: Create GraphTokenManager

**Files:**
- Create `src/lib/graph/GraphTokenManager.ts`

**Tasks:**
- Implement client credentials token acquisition
- Cache tokens with expiry tracking
- Handle refresh on 401
- Log token events to audit log

### Step 3: Add Retry and Error Handling

**Files:**
- Create `src/lib/graph/graphRetry.ts`
- Create `src/lib/graph/graphErrors.ts`

**Tasks:**
- Implement retry wrapper with exponential backoff
- Parse Graph API error responses
- Extract Retry-After header for 429s
- Map errors to internal error types

### Step 4: Update Factory Function

**Files:**
- Modify `src/lib/graph/GraphCalendarClient.ts`

**Tasks:**
- Load config from environment
- Instantiate `GraphCalendarClientReal` when `GRAPH_MODE=real`
- Validate required config on startup
- Log mode selection

### Step 5: Add Config Validation

**Files:**
- Create `src/lib/graph/validateConfig.ts`

**Tasks:**
- Validate all required env vars present when mode=real
- Validate email format for organizer
- Validate UUID format for tenantId, clientId
- Throw clear errors on misconfiguration

### Step 6: Update Environment Files

**Files:**
- Update `.env.example`
- Update `.env.local` (local only)

**Tasks:**
- Add all new env vars with documentation
- Add GRAPH_MAX_RETRIES, GRAPH_RETRY_DELAY_MS
- Document which are required vs optional

### Step 7: Add Graph Health to Ops Dashboard

**Files:**
- Modify `src/app/ops/page.tsx`
- Create `src/app/api/ops/graph/route.ts`

**Tasks:**
- Add Graph Health card to ops dashboard
- Show token status, last call, error rate
- Add endpoint to fetch Graph health metrics

### Step 8: Add Integration Tests

**Files:**
- Create `__tests__/lib/graph/GraphCalendarClientReal.test.ts`
- Create `__tests__/lib/graph/GraphTokenManager.test.ts`

**Tasks:**
- Unit tests with mocked fetch
- Test token caching and refresh
- Test retry logic
- Test error mapping

### Step 9: Create Onboarding Documentation

**Files:**
- Create `docs/GRAPH_ONBOARDING.md`

**Tasks:**
- Step-by-step Azure AD app registration
- Permission configuration
- Application Access Policy setup
- Environment variable configuration
- Verification checklist

### Step 10: Update Exports and Index

**Files:**
- Update `src/lib/graph/index.ts`

**Tasks:**
- Export new classes and utilities
- Maintain backward compatibility

---

## 10. Test Plan

### Unit Tests
- [ ] Token acquisition and caching
- [ ] Token refresh on expiry
- [ ] Token refresh on 401
- [ ] Retry logic with mock failures
- [ ] Error mapping for all status codes
- [ ] Config validation (valid and invalid)

### Integration Tests (with mocked Graph responses)
- [ ] getSchedule parses response correctly
- [ ] createEvent sends correct payload
- [ ] updateEvent handles partial updates
- [ ] cancelEvent handles not-found gracefully

### Manual Testing Checklist
- [ ] Configure Azure AD app registration
- [ ] Set environment variables
- [ ] Run app with GRAPH_MODE=real
- [ ] Verify token acquisition in logs
- [ ] Create a test booking end-to-end
- [ ] Verify calendar event appears in organizer mailbox
- [ ] Verify attendees receive invite

---

## 11. Success Criteria

### Functional Criteria
- [ ] Real Graph client implements all interface methods (getSchedule, createEvent, updateEvent, cancelEvent)
- [ ] Token management handles refresh automatically with single-flight locking
- [ ] Retry logic handles transient failures (5xx) with exponential backoff
- [ ] 429 rate limiting respects `Retry-After` header with jitter
- [ ] All new code has unit tests with >80% coverage

### Observability Criteria
- [ ] Ops dashboard shows Graph health card with token status and metrics
- [ ] `/api/ops/graph` endpoint returns health status JSON
- [ ] Audit log captures token events, rate limits, and errors

### Security Criteria
- [ ] Application Access Policy configured and tested
- [ ] **Scope validation proof:**
  - [ ] `Test-ApplicationAccessPolicy` returns `Granted` for organizer mailbox
  - [ ] `Test-ApplicationAccessPolicy` returns `Denied` for out-of-scope mailbox
  - [ ] API call to in-scope mailbox returns HTTP 200
  - [ ] API call to out-of-scope mailbox returns HTTP 403
- [ ] Client secret stored securely (Vercel env vars, not in code)

### Documentation Criteria
- [ ] Onboarding documentation complete (Azure AD setup, Access Policy, env vars)
- [ ] Scope validation checklist documented with PowerShell commands

### Integration Criteria
- [ ] End-to-end booking works with real Graph API in staging
- [ ] Calendar event created in organizer mailbox
- [ ] Attendees receive invite

---

## 12. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Token caching in serverless** | Medium | In-memory cache with single-flight locking; accept cold start latency (~300-500ms token fetch); early refresh window prevents mid-request expiry |
| **Thundering herd on token expiry** | Medium | Single-flight pattern ensures only one token fetch; concurrent requests await same promise |
| **Rate limiting during high load** | High | Respect `Retry-After` header; exponential backoff with jitter; queue requests if needed; surface metrics in /ops |
| **Secret rotation causes outage** | Medium | Document rotation procedure; test in staging; use Vercel env vars (no deployment needed for secret update) |
| **Application Access Policy misconfigured** | High | Provide validation checklist with specific PowerShell commands; test both granted and denied scenarios before go-live |
| **Cold start latency impact** | Low | Accept 300-500ms token fetch on cold start; interview scheduling is not latency-critical; monitor cold start frequency in ops |
| **Token endpoint unreachable** | Medium | Retry token fetch with backoff; surface token fetch failures prominently in /ops; alert on repeated failures |

---

## 13. Local Verification

### Running in Real Mode Locally

To test the real Graph client locally with mocked Graph API responses (in tests):

```bash
# Run all tests including Graph client tests
npm test -- --watchAll=false

# Tests mock Graph API responses, so no real credentials needed
# The GraphCalendarClientReal is tested with mocked HTTP responses
```

### Running with Real Graph API

To connect to a real Microsoft Graph API:

1. **Configure environment variables** in `.env.local`:
   ```bash
   GRAPH_MODE=real
   GRAPH_TENANT_ID=<your-azure-ad-tenant-id>
   GRAPH_CLIENT_ID=<your-app-registration-client-id>
   GRAPH_CLIENT_SECRET=<your-client-secret>
   GRAPH_ORGANIZER_EMAIL=scheduling@yourcompany.com
   GRAPH_ENABLE_TEAMS=true  # Optional: enable Teams meeting links
   ```

2. **Verify Azure AD setup**:
   - App registration created with required permissions
   - Admin consent granted for application permissions
   - Application Access Policy configured (see Section 5)

3. **Start the dev server**:
   ```bash
   npm run dev
   ```

4. **Check Graph health**:
   - Visit `/api/ops/graph` to see token status and metrics
   - If unhealthy, check logs for token acquisition errors

### Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| **401 Unauthorized** | Invalid credentials or expired secret | Verify GRAPH_CLIENT_ID and GRAPH_CLIENT_SECRET are correct; regenerate secret if expired |
| **403 Forbidden** | Missing permissions or Access Policy blocking | Verify admin consent granted; check Application Access Policy includes the mailbox |
| **429 Too Many Requests** | Rate limited by Graph API | Wait for Retry-After period; reduce request frequency if persistent |
| **Config validation error** | Missing or invalid env vars | Check all required GRAPH_* variables are set with valid formats |

### Verification Commands

```bash
# Run tests (includes Graph client tests with mocked responses)
npm test -- --watchAll=false

# Build production bundle
npm run build

# Check Graph health endpoint (when running locally)
curl http://localhost:3000/api/ops/graph
```

---

*Last updated: January 2026*
