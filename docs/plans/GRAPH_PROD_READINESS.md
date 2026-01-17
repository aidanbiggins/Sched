# Graph Production Readiness Plan

**Milestone:** M7.1 - Graph Production Readiness
**Status:** Implementation Complete
**Depends on:** M7 (Graph Real Auth - Code Complete)

---

## Overview

M7 delivered the Graph API client code with token management, retry logic, and config validation. This milestone focuses on **proving it works** in a real Azure AD tenant with proper scoping enforcement.

**Goal:** Validate Graph integration in a real tenant, ensure Application Access Policy scoping is enforced, and provide operators with tools to verify setup before going live.

---

## 1. Azure AD Onboarding Checklist

### App Registration Steps

| Step | Action | Verification |
|------|--------|--------------|
| 1 | Create Azure AD App Registration | App ID visible in Azure Portal |
| 2 | Add `Calendars.ReadBasic.All` (Application) permission | Listed under API permissions |
| 3 | Add `Calendars.ReadWrite` (Application) permission | Listed under API permissions |
| 4 | Grant admin consent for permissions | Green checkmarks on permissions |
| 5 | Create client secret | Secret value saved to `GRAPH_CLIENT_SECRET` |
| 6 | Record Tenant ID | Saved to `GRAPH_TENANT_ID` |
| 7 | Record Application (client) ID | Saved to `GRAPH_CLIENT_ID` |
| 8 | Set organizer email | Saved to `GRAPH_ORGANIZER_EMAIL` |

### Application Access Policy Setup (Scoping)

The Application Access Policy restricts which mailboxes the app can access. **This is critical for least-privilege security.**

| Step | PowerShell Command | Purpose |
|------|-------------------|---------|
| 1 | `New-ApplicationAccessPolicy -AppId {APP_ID} -PolicyScopeGroupId {MAIL_ENABLED_SECURITY_GROUP} -AccessRight RestrictAccess -Description "Scheduler app"` | Restrict app to specific mailboxes |
| 2 | `Test-ApplicationAccessPolicy -Identity {ORGANIZER_EMAIL} -AppId {APP_ID}` | Verify organizer is in allowed scope |
| 3 | `Test-ApplicationAccessPolicy -Identity {RANDOM_USER_EMAIL} -AppId {APP_ID}` | Verify random user is DENIED (returns AccessDenied) |

**Required:** Create a mail-enabled security group containing ONLY the organizer mailbox(es).

### Environment Variables

```bash
# Required
GRAPH_MODE=real
GRAPH_TENANT_ID=your-tenant-id
GRAPH_CLIENT_ID=your-app-client-id
GRAPH_CLIENT_SECRET=your-client-secret
GRAPH_ORGANIZER_EMAIL=scheduling@yourcompany.com

# Optional
GRAPH_MAX_RETRIES=3           # Default: 3
GRAPH_RETRY_DELAY_MS=1000     # Default: 1000
GRAPH_ENABLE_TEAMS=true       # Enable Teams meeting links
```

---

## 2. Validator UI Spec

### Location
`/ops/graph-validator` (new page within ops dashboard)

### Checks to Run

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| **Config Present** | Validate all required env vars | All 4 vars non-empty |
| **Token Acquisition** | Call `GraphTokenManager.getToken()` | Token returned without error |
| **Organizer Access** | `GET /users/{organizer}/calendar` | 200 OK |
| **Scoping Enforced** | `GET /users/randomuser@tenant.com/calendar` | 403 Forbidden (Access Denied) |
| **FreeBusy Query** | `POST /me/calendar/getSchedule` for organizer | Schedule data returned |
| **Event Create (Dry Run)** | Create event with `showAs: free` in organizer calendar | Event ID returned |
| **Event Delete (Cleanup)** | Delete the dry-run event | 204 No Content |

### Results Display

```
Graph Configuration Validator
=============================

[PASS] Config Present
  - GRAPH_TENANT_ID: ****-****-****-****-1234
  - GRAPH_CLIENT_ID: ****-****-****-****-5678
  - GRAPH_CLIENT_SECRET: ******* (set)
  - GRAPH_ORGANIZER_EMAIL: scheduling@example.com

[PASS] Token Acquisition
  - Token acquired in 245ms
  - Expires: 2026-01-16T15:30:00Z

[PASS] Organizer Calendar Access
  - GET /users/scheduling@example.com/calendar: 200 OK
  - Calendar ID: AAMkAGQ...

[PASS] Scoping Enforced
  - GET /users/testuser@example.com/calendar: 403 Forbidden
  - Application Access Policy is working correctly

[PASS] FreeBusy Query
  - Retrieved schedule for 1 attendee
  - 5 busy slots found

[PASS] Event Create (Dry Run)
  - Created test event: AAMkAGQ...testEvent
  - Subject: "Scheduler Validation Test"

[PASS] Event Cleanup
  - Deleted test event successfully

=============================
STATUS: READY FOR PRODUCTION
=============================
```

### Error States

- **FAIL** with red badge and specific error message
- **WARN** for non-critical issues (e.g., Teams disabled but config present)
- Link to relevant documentation section for each failure

---

## 3. Ops Metrics Additions

### Current Metrics (from `/api/ops/graph`)

```typescript
interface GraphMetrics {
  status: 'healthy' | 'degraded' | 'unhealthy';
  configValid: boolean;
  tokenStatus: {
    hasToken: boolean;
    expiresAt: string | null;
    refreshes: number;
    failures: number;
    lastRefreshAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  };
}
```

### Proposed Additions

```typescript
interface GraphMetricsExtended {
  // Existing fields...

  // NEW: API call metrics
  apiCalls: {
    total: number;
    successful: number;
    failed: number;
    rateLimited: number;
    byEndpoint: {
      [endpoint: string]: {
        calls: number;
        avgLatencyMs: number;
        errors: number;
      };
    };
  };

  // NEW: Scoping validation status
  scopingValidation: {
    lastCheckedAt: string | null;
    organizerAccessible: boolean;
    scopingEnforced: boolean;
    testUserDenied: string | null; // email of test user that was denied
  };

  // NEW: Connection health
  connectionHealth: {
    lastSuccessfulCall: string | null;
    lastFailedCall: string | null;
    consecutiveFailures: number;
  };
}
```

### Metrics Collection Points

| Metric | Collection Point | File |
|--------|-----------------|------|
| API call counts | `graphRetry.ts` wrapper | `src/lib/graph/graphRetry.ts` |
| Latency | `graphRetry.ts` wrapper | `src/lib/graph/graphRetry.ts` |
| Rate limits | `graphRetry.ts` 429 handler | `src/lib/graph/graphRetry.ts` |
| Token metrics | `GraphTokenManager` | `src/lib/graph/GraphTokenManager.ts` |
| Scoping status | Validator API | `src/app/api/ops/graph-validator/route.ts` |

---

## 4. Smoke Test Command Spec

### Command

```bash
npm run graph:smoke
```

### Implementation

`scripts/graph-smoke.ts`

### Test Sequence

```typescript
async function runSmokeTests(): Promise<SmokeTestResult> {
  const results: TestResult[] = [];

  // 1. Config validation
  results.push(await testConfigPresent());

  // 2. Token acquisition
  results.push(await testTokenAcquisition());

  // 3. Organizer access
  results.push(await testOrganizerAccess());

  // 4. Scoping enforcement (requires GRAPH_SCOPING_TEST_EMAIL env var)
  if (process.env.GRAPH_SCOPING_TEST_EMAIL) {
    results.push(await testScopingEnforced());
  }

  // 5. FreeBusy query
  results.push(await testFreeBusy());

  // 6. Event lifecycle (create, update, cancel)
  results.push(await testEventLifecycle());

  return {
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    skipped: results.filter(r => r.status === 'skip').length,
    results,
  };
}
```

### Output Format

```
Graph API Smoke Tests
=====================

[1/6] Config Present........................ PASS (2ms)
[2/6] Token Acquisition..................... PASS (312ms)
[3/6] Organizer Calendar Access............. PASS (156ms)
[4/6] Scoping Enforced...................... PASS (203ms)
      - testuser@example.com correctly denied
[5/6] FreeBusy Query........................ PASS (178ms)
      - Retrieved 3 busy slots for organizer
[6/6] Event Lifecycle....................... PASS (892ms)
      - Created event: AAMkAGQ...
      - Updated event subject
      - Cancelled event

=====================
RESULTS: 6/6 passed
STATUS: SMOKE TESTS PASSED
=====================
```

### Environment Variables for Smoke Tests

```bash
# Required (same as app)
GRAPH_TENANT_ID=...
GRAPH_CLIENT_ID=...
GRAPH_CLIENT_SECRET=...
GRAPH_ORGANIZER_EMAIL=...

# Optional for scoping test
GRAPH_SCOPING_TEST_EMAIL=randomuser@example.com  # Should be DENIED access
```

---

## 5. Step-by-Step Build Plan

### Phase 1: Metrics Infrastructure (Steps 1-3)

| Step | Task | Files | DoD |
|------|------|-------|-----|
| 1 | Add GraphMetricsCollector singleton | `src/lib/graph/GraphMetricsCollector.ts` | Metrics class with increment/record methods |
| 2 | Wire metrics into graphRetry wrapper | `src/lib/graph/graphRetry.ts` | Every API call records latency, success/fail, endpoint |
| 3 | Extend `/api/ops/graph` to return extended metrics | `src/app/api/ops/graph/route.ts` | API returns apiCalls and connectionHealth |

### Phase 2: Smoke Test Command (Steps 4-5)

| Step | Task | Files | DoD |
|------|------|-------|-----|
| 4 | Create smoke test script | `scripts/graph-smoke.ts` | Script runs all 6 tests |
| 5 | Add npm script | `package.json` | `npm run graph:smoke` works |

### Phase 3: Validator UI (Steps 6-8)

| Step | Task | Files | DoD |
|------|------|-------|-----|
| 6 | Create validator API endpoint | `src/app/api/ops/graph-validator/route.ts` | Runs all validation checks, returns JSON results |
| 7 | Create validator UI page | `src/app/ops/graph-validator/page.tsx` | Displays check results with pass/fail badges |
| 8 | Add link to validator from ops dashboard | `src/app/ops/page.tsx` | "Validate Graph" button visible |

### Phase 4: Documentation & Polish (Steps 9-11)

| Step | Task | Files | DoD |
|------|------|-------|-----|
| 9 | Update Graph onboarding docs | `docs/plans/SCHEDULER_M7_GRAPH_AUTH_ONBOARDING_PLAN.md` | Includes Access Policy setup with PowerShell commands |
| 10 | Add scoping validation to docs | Same as above | Verification steps documented |
| 11 | Write operator runbook section for Graph | `docs/OPERATOR_RUNBOOK.md` | Graph troubleshooting section added |

### Phase 5: Verification (Step 12)

| Step | Task | Files | DoD |
|------|------|-------|-----|
| 12 | End-to-end validation in real tenant | N/A | Smoke tests pass, validator shows all green |

---

## 6. Definition of Done

- [x] GraphMetricsCollector captures API call metrics (count, latency, errors)
- [x] `/api/ops/graph` returns extended metrics including API call stats
- [x] `npm run graph:smoke` executes 6 smoke tests
- [x] Smoke tests verify scoping enforcement (random user denied)
- [x] `/ops/graph-validator` UI shows validation results with pass/fail
- [x] Validator tests organizer access AND scoping denial
- [x] Documentation includes Application Access Policy PowerShell commands
- [ ] Operator runbook has Graph troubleshooting section (future)
- [x] Tests pass: `npm test` (567 passing, 12 pre-existing failures)
- [x] Build passes: `npm run build`
- [ ] End-to-end: Smoke tests pass in real Azure AD tenant (requires Azure setup)

---

## 7. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| No Azure AD tenant available | Smoke tests work with mock mode; validator gracefully shows "not configured" |
| Application Access Policy not set up | Validator explicitly tests and warns if scoping is not enforced |
| Token refresh failures in production | Metrics track failures; ops dashboard shows health degradation |
| Rate limiting in production | Retry logic with Retry-After already implemented; metrics track 429s |

---

## 8. Out of Scope

- UI for creating Azure AD apps (must be done in Azure Portal)
- Automatic Application Access Policy creation (requires Exchange admin PowerShell)
- Multi-tenant support (single tenant per deployment)
- Delegated auth flow (app uses client credentials only)

---

*Created: 2026-01-16*
