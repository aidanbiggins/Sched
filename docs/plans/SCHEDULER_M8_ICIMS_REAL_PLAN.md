# M8.5: Real iCIMS Integration Plan

**Version:** 1.1
**Created:** 2026-01-15
**Updated:** 2026-01-15
**Status:** Complete

This document defines the implementation plan for real iCIMS API integration, replacing the current mock/stub implementation.

## Implementation Summary

The following components have been implemented:

| Component | File | Description |
|-----------|------|-------------|
| Config validation | `src/lib/icims/icimsConfig.ts` | Environment validation for real mode |
| Error types | `src/lib/icims/icimsErrors.ts` | Typed errors with retry classification |
| HTTP helper | `src/lib/icims/icimsHttp.ts` | Request with retries and idempotency |
| Metrics | `src/lib/icims/icimsMetrics.ts` | API call tracking for ops |
| Real client | `src/lib/icims/IcimsClientReal.ts` | Production iCIMS client |
| Ops endpoint | `src/app/api/ops/icims/route.ts` | Health status API |

### Final Environment Variables

```bash
# Required for ICIMS_MODE=real
ICIMS_MODE=real           # or 'mock' (default)
ICIMS_BASE_URL=https://api.icims.com
ICIMS_API_KEY=your-api-key-here
```

### How to Run Real Mode Locally

1. Set environment variables in `.env.local`:
   ```bash
   ICIMS_MODE=real
   ICIMS_BASE_URL=https://your-icims-instance.com
   ICIMS_API_KEY=your-actual-api-key
   ```

2. Start the dev server:
   ```bash
   npm run dev
   ```

3. Monitor iCIMS health at `/ops` or via API:
   ```bash
   curl http://localhost:3000/api/ops/icims
   ```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| "ICIMS_BASE_URL is required" | Set `ICIMS_BASE_URL` in .env.local |
| "ICIMS_API_KEY appears invalid" | Ensure API key is at least 10 characters |
| 401 errors | Check API key is valid, not expired |
| 429 rate limits | System will auto-retry with backoff |
| 5xx server errors | System will retry up to 3 times |

---

## Current State

### IcimsClient Interface (`src/lib/icims/IcimsClient.ts`)

```typescript
export interface IcimsClient {
  getApplication(applicationId: string): Promise<IcimsApplication>;
  addApplicationNote(applicationId: string, noteText: string): Promise<void>;
}
```

The factory function (`getIcimsClient()`) checks `ICIMS_MODE` env var:
- `mock` (default): Returns `IcimsClientMock`
- `real`: Currently throws "not yet implemented"

### Usage Points in SchedulingService

The `IcimsWritebackService` is called at these points with `isAtsEnabled()` guard:

| Event | Method Called | Location |
|-------|---------------|----------|
| Request created | `writeLinkCreatedNote()` | `SchedulingService.createSchedulingRequest()` |
| Slot booked | `writeBookedNote()` | `SchedulingService.bookSlot()` |
| Booking rescheduled | `writeRescheduledNote()` | `SchedulingService.rescheduleBooking()` |
| Booking cancelled | `writeCancelledNote()` | `SchedulingService.cancelSchedulingRequest()` |

### Retry Mechanism

- **Backoff intervals:** 1min → 5min → 15min → 30min → 60min
- **Max attempts:** 5
- **Sync worker:** Polls every 30s for pending jobs
- **Status tracking:** `pending` → `processing` → `completed`/`failed`

---

## iCIMS API Research

### Authentication Model Options

| Option | Description | Pros | Cons |
|--------|-------------|------|------|
| **OAuth 2.0 Client Credentials** | Service-to-service auth | Standard, secure, auto-refreshing | Requires app registration |
| **API Key** | Static key in header | Simple, no token management | Less secure, manual rotation |
| **Basic Auth** | Username/password | Simplest | Deprecated, not recommended |

**Recommendation:** OAuth 2.0 Client Credentials (if supported by iCIMS), fall back to API Key.

### Endpoints Needed

#### 1. Get Application

**Purpose:** Validate applicationId exists, get candidate details for verification.

**Expected endpoint:**
```
GET /api/v1/applications/{applicationId}
```

**Response shape (expected):**
```json
{
  "id": "APP-12345",
  "candidateName": "John Doe",
  "candidateEmail": "john@example.com",
  "requisitionId": "REQ-456",
  "requisitionTitle": "Software Engineer",
  "status": "active"
}
```

#### 2. Add Application Note

**Purpose:** Write scheduling events to application timeline.

**Expected endpoint:**
```
POST /api/v1/applications/{applicationId}/notes
```

**Request shape:**
```json
{
  "content": "Interview scheduled: 2026-01-16 at 2:00 PM EST with interviewer@company.com",
  "noteType": "scheduling"
}
```

**Response:** 201 Created with note ID.

### Rate Limits (Expected)

Based on typical ATS API patterns:

| Limit Type | Expected Value | Handling |
|------------|----------------|----------|
| Requests/minute | 60-120 | Track, throttle client-side |
| Requests/day | 10,000-50,000 | Monitor, alert at 80% |
| Concurrent requests | 5-10 | Connection pooling |

**Retry-After header:** Honor if returned on 429 responses.

---

## Implementation Design

### IcimsClientReal Class

```typescript
// src/lib/icims/IcimsClientReal.ts

export class IcimsClientReal implements IcimsClient {
  private baseUrl: string;
  private apiKey: string;
  private tokenManager?: IcimsTokenManager; // For OAuth

  constructor(config: IcimsConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  async getApplication(applicationId: string): Promise<IcimsApplication> {
    const response = await this.request('GET', `/applications/${applicationId}`);
    return this.mapApplication(response);
  }

  async addApplicationNote(applicationId: string, noteText: string): Promise<void> {
    await this.request('POST', `/applications/${applicationId}/notes`, {
      content: noteText,
      noteType: 'scheduling',
      idempotencyKey: this.generateIdempotencyKey(applicationId, noteText),
    });
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    // Implementation with retry logic
  }
}
```

### Idempotency Key Strategy

To prevent duplicate notes on retries:

```typescript
function generateIdempotencyKey(applicationId: string, noteText: string): string {
  // Hash of: applicationId + note content hash + date (day precision)
  const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const contentHash = createHash('sha256')
    .update(noteText)
    .digest('hex')
    .substring(0, 8);

  return `sched-${applicationId}-${contentHash}-${dateKey}`;
}
```

**Rationale:**
- Same note on same day = same key (prevents duplicates on retry)
- Different day = new key (allows reposting if needed)
- Content-based = different events always different keys

### Retry Logic with iCIMS Errors

```typescript
const ICIMS_RETRYABLE_ERRORS = [
  429, // Rate limited
  500, // Internal server error
  502, // Bad gateway
  503, // Service unavailable
  504, // Gateway timeout
];

const ICIMS_NON_RETRYABLE_ERRORS = [
  400, // Bad request (invalid data)
  401, // Unauthorized (bad credentials)
  403, // Forbidden (missing permissions)
  404, // Not found (invalid applicationId)
];
```

### Environment Variables

```bash
# Required for ICIMS_MODE=real
ICIMS_BASE_URL=https://api.icims.com
ICIMS_API_KEY=your-api-key
ICIMS_MODE=real  # or 'mock' (default)

# Optional OAuth (if supported)
ICIMS_CLIENT_ID=
ICIMS_CLIENT_SECRET=
ICIMS_TOKEN_URL=
```

---

## Sync Jobs Integration

### Current sync_jobs Table

```sql
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY,
  type TEXT NOT NULL,           -- 'icims_note'
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL,    -- 'scheduling_request' | 'booking'
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  status TEXT NOT NULL,         -- 'pending' | 'processing' | 'completed' | 'failed'
  last_error TEXT,
  payload JSONB,
  run_after TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### Sync Worker Enhancement

The existing `scripts/sync-worker.ts` will be enhanced:

```typescript
// Existing flow
1. Poll for pending jobs where run_after <= NOW
2. Mark job as 'processing'
3. Call IcimsWritebackService.retryJob(job)
4. On success: mark 'completed'
5. On failure: increment attempts, set new run_after, update last_error
6. If attempts >= max_attempts: mark 'failed'

// New additions for real API
- Parse iCIMS error responses for actionable info
- Extract rate limit headers for adaptive throttling
- Log full request/response for debugging (without sensitive data)
```

### Ops Metrics for iCIMS

New endpoint: `GET /api/ops/icims`

```json
{
  "status": "healthy" | "degraded" | "down",
  "lastSuccessfulCall": "2026-01-15T10:30:00Z",
  "lastFailedCall": null,
  "metricsLast24h": {
    "totalCalls": 156,
    "successfulCalls": 154,
    "failedCalls": 2,
    "avgResponseTimeMs": 245,
    "rateLimitHits": 0
  },
  "syncJobs": {
    "pending": 3,
    "processing": 1,
    "completedLast24h": 150,
    "failedLast24h": 2
  },
  "config": {
    "mode": "real",
    "baseUrl": "https://api.icims.com",
    "hasApiKey": true
  }
}
```

---

## /ops Dashboard Surface

### New iCIMS Tab

Add to existing `/ops` health dashboard:

| Section | Content |
|---------|---------|
| Status Card | Connection health (healthy/degraded/down) |
| API Metrics | Success rate, avg latency, rate limit status |
| Sync Queue | Pending/processing/failed job counts |
| Recent Failures | Last 5 failed API calls with error details |
| Configuration | Mode, base URL, credential status |

### Alert Conditions

| Condition | Severity | Action |
|-----------|----------|--------|
| Success rate < 95% | Warning | Yellow indicator |
| Success rate < 80% | Critical | Red indicator, notify |
| Rate limit hit | Info | Log, auto-backoff |
| Auth failure (401/403) | Critical | Red indicator, stop retries |
| 5+ consecutive failures | Critical | Circuit breaker, alert |

---

## Test Strategy

### Unit Tests

```typescript
describe('IcimsClientReal', () => {
  describe('getApplication', () => {
    it('returns application details on success');
    it('throws NotFoundError for 404');
    it('throws AuthError for 401/403');
    it('retries on 429 with Retry-After');
    it('retries on 5xx errors');
  });

  describe('addApplicationNote', () => {
    it('creates note with idempotency key');
    it('succeeds on retry with same key (idempotent)');
    it('handles rate limiting');
  });
});
```

### Integration Tests (Mocked iCIMS)

Use MSW (Mock Service Worker) to simulate iCIMS API:

```typescript
describe('IcimsWritebackService with real client', () => {
  beforeAll(() => {
    server.use(
      rest.post('*/applications/:id/notes', (req, res, ctx) => {
        return res(ctx.status(201));
      })
    );
  });

  it('writes link_created note successfully');
  it('writes booked note successfully');
  it('creates sync job on failure');
  it('processes sync job via worker');
});
```

### Manual Testing Checklist

- [ ] Create scheduling request → verify note in iCIMS
- [ ] Book slot → verify booked note in iCIMS
- [ ] Reschedule → verify rescheduled note in iCIMS
- [ ] Cancel → verify cancelled note in iCIMS
- [ ] Simulate rate limit → verify retry with backoff
- [ ] Simulate auth failure → verify job marked failed
- [ ] View /ops/icims → verify metrics displayed

---

## Build Plan (8 Steps)

### Step 1: Environment and Config

**Files:**
- Update `.env.example` with iCIMS variables
- Create `src/lib/icims/icimsConfig.ts` for validation

**Tasks:**
- [ ] Add ICIMS_BASE_URL, ICIMS_API_KEY to .env.example
- [ ] Create config validation function
- [ ] Update getIcimsClient() factory with config validation

**Tests:** Config validation tests

---

### Step 2: IcimsClientReal Implementation

**Files:**
- Create `src/lib/icims/IcimsClientReal.ts`
- Create `src/lib/icims/icimsRetry.ts`

**Tasks:**
- [ ] Implement IcimsClientReal class
- [ ] Implement getApplication() method
- [ ] Implement addApplicationNote() method
- [ ] Add retry logic with exponential backoff
- [ ] Handle rate limiting (429 + Retry-After)
- [ ] Generate idempotency keys for notes

**Tests:** Unit tests for IcimsClientReal

---

### Step 3: Error Handling

**Files:**
- Create `src/lib/icims/icimsErrors.ts`

**Tasks:**
- [ ] Define IcimsError base class
- [ ] Define specific errors: RateLimitError, AuthError, NotFoundError
- [ ] Update IcimsClientReal to throw typed errors
- [ ] Update IcimsWritebackService to handle new error types

**Tests:** Error handling tests

---

### Step 4: Sync Worker Enhancement

**Files:**
- Update `scripts/sync-worker.ts`
- Update `src/lib/icims/IcimsWritebackService.ts`

**Tasks:**
- [ ] Parse iCIMS error responses for better logging
- [ ] Add rate limit tracking
- [ ] Implement circuit breaker pattern
- [ ] Mark jobs as permanently failed on auth errors

**Tests:** Sync worker integration tests

---

### Step 5: Ops Metrics Endpoint

**Files:**
- Create `src/app/api/ops/icims/route.ts`
- Create `src/lib/icims/icimsMetrics.ts`

**Tasks:**
- [ ] Track API call metrics (success/fail/latency)
- [ ] Track rate limit hits
- [ ] Create /api/ops/icims endpoint
- [ ] Return health status based on metrics

**Tests:** Ops endpoint tests

---

### Step 6: Ops Dashboard UI

**Files:**
- Update `/ops` page components

**Tasks:**
- [ ] Add iCIMS tab to ops dashboard
- [ ] Display connection status
- [ ] Show API metrics chart
- [ ] Show sync queue status
- [ ] Display recent failures

**Tests:** Component tests for iCIMS panel

---

### Step 7: Integration Tests

**Files:**
- Create `__tests__/integration/icims-real.test.ts`

**Tasks:**
- [ ] Set up MSW handlers for iCIMS API
- [ ] Test full write flow (create → success)
- [ ] Test full retry flow (create → fail → retry → success)
- [ ] Test permanent failure flow
- [ ] Test ops metrics accuracy

**Tests:** Full integration test suite

---

### Step 8: Documentation and Rollout

**Files:**
- Update `docs/plans/SCHEDULER_ROADMAP.md`
- Create `docs/ICIMS_SETUP.md`

**Tasks:**
- [ ] Write iCIMS setup documentation
- [ ] Document environment variables
- [ ] Document ops dashboard usage
- [ ] Add troubleshooting guide
- [ ] Mark M8 as complete in roadmap

**Tests:** Final manual testing with real iCIMS (if available)

---

## Dependencies

- **iCIMS API access:** Need API credentials and endpoint documentation
- **iCIMS sandbox:** For safe testing without affecting production data

## Risks

| Risk | Mitigation |
|------|------------|
| iCIMS API documentation incomplete | Contact iCIMS support early, build adapter based on exploration |
| Rate limits stricter than expected | Implement adaptive throttling, queue batching |
| No idempotency support in iCIMS API | Content-based deduplication in note text |
| Auth model different than expected | Support multiple auth methods (OAuth, API key, Basic) |

---

## Success Criteria

- [ ] Notes written to iCIMS for all 4 events (create/book/cancel/reschedule)
- [ ] Failed writes retry with exponential backoff
- [ ] Rate limits handled gracefully
- [ ] Ops dashboard shows iCIMS health
- [ ] All existing tests pass
- [ ] New tests cover real client implementation
- [ ] Documentation complete for setup and troubleshooting

---

*Last updated: 2026-01-15*
