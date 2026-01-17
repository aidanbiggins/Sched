# Production Job Runner Strategy

**Status:** Planned
**Created:** 2026-01-17
**Milestone:** M13 - Production Job Runner

---

## 1. Current State Inventory

### 1.1 Existing Worker Commands

| Script | Command | Mode | Purpose |
|--------|---------|------|---------|
| `scheduler:sync` | `ts-node scripts/sync-worker.ts` | Continuous | iCIMS note writebacks |
| `scheduler:sync:once` | `ts-node scripts/sync-worker.ts --once` | Single batch | iCIMS writebacks (cron-compatible) |
| `scheduler:webhook:process` | `ts-node scripts/webhook-processor.ts` | Continuous | Process webhook events |
| `scheduler:webhook:process:once` | `ts-node scripts/webhook-processor.ts --once` | Single batch | Webhooks (cron-compatible) |
| `scheduler:reconcile` | `ts-node scripts/reconcile-worker.ts` | Continuous | Drift detection & repair |
| `scheduler:reconcile:once` | `ts-node scripts/reconcile-worker.ts --once` | Single batch | Reconciliation (cron-compatible) |
| `scheduler:notify` | `ts-node scripts/notify-worker.ts` | Continuous | Email notifications |
| `scheduler:notify:once` | `ts-node scripts/notify-worker.ts --once` | Single batch | Notifications (cron-compatible) |

### 1.2 Worker Characteristics

| Worker | Batch Size | Poll Interval | Max Attempts | Backoff Strategy |
|--------|------------|---------------|--------------|------------------|
| Sync | 10 | 30s | Per-job config | Exponential (1, 5, 15, 30, 60 min) |
| Webhook | 10 | 30s | Per-event config | Exponential backoff |
| Reconcile | 10 | 60s | Per-job config | Standard backoff |
| Notify | 10 | 5s | 5 | Exponential (4 min base) |

### 1.3 Job State Storage

All job state is stored in PostgreSQL (Supabase) with consistent schema patterns:

| Table | Status Values | Key Fields |
|-------|--------------|------------|
| `sync_jobs` | pending, processing, completed, failed | entity_id, attempts, max_attempts, run_after, last_error |
| `webhook_events` | received, processing, processed, failed | event_id, payload_hash, attempts, run_after, verified |
| `reconciliation_jobs` | pending, processing, completed, failed, requires_attention | job_type, entity_id, detection_reason |
| `notification_jobs` | PENDING, SENDING, SENT, FAILED, CANCELED | type, to_email, idempotency_key, run_after |

### 1.4 Current Ops Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ops/health` | GET | System health summary with job counts |
| `/api/ops/webhooks` | GET | List/filter webhook events |
| `/api/ops/reconciliation` | GET | List reconciliation jobs |
| `/api/ops/reconciliation/run` | POST | Trigger reconciliation (non-prod only) |
| `/api/ops/notifications` | GET | List notification jobs |
| `/api/ops/notifications/[id]/retry` | POST | Retry failed notification |
| `/api/ops/attention` | GET | Requests needing attention |

---

## 2. Deployment Reality Check

### 2.1 Current Deployment Target

**Primary Target: Vercel (Next.js Serverless)**

Evidence:
- Next.js 14 App Router project structure
- No `vercel.json`, `Dockerfile`, or GitHub Actions workflows present
- Default Vercel deployment assumed
- `DB_MODE=supabase` for production database

**Constraints:**
- Vercel serverless functions have 10s default / 60s max timeout (Pro plan)
- No persistent processes between requests
- Vercel Cron available on Pro/Enterprise plans

### 2.2 Approach Evaluation

| Approach | Pros | Cons | Fit |
|----------|------|------|-----|
| **A) Vercel Cron + API Routes** | Native, no infra, simple | 60s max runtime, Pro plan required | Best |
| **B) GitHub Actions Cron** | Free, flexible runtime | External to app, cold starts, secrets mgmt | Fallback |
| **C) Dedicated Worker Process** | Full control, long-running | Requires separate infra (Fly.io, Railway) | Future |
| **D) Supabase pg_cron** | DB-native, reliable | Limited to SQL, no app logic | Not suitable |

### 2.3 Decision

**Primary Approach: A) Vercel Cron + Internal API Routes**

Rationale:
- Minimal infrastructure overhead
- Native integration with existing Next.js app
- `--once` mode already implemented in all workers
- Batch sizes (10) fit within 60s timeout
- Vercel Pro plan likely already in use for production

**Fallback Approach: B) GitHub Actions Cron**

Use if:
- Vercel Free plan without Cron support
- Jobs exceed 60s runtime
- Need for more complex scheduling

---

## 3. Execution Approach

### 3.1 Primary: Vercel Cron Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/notify",
      "schedule": "* * * * *"
    },
    {
      "path": "/api/cron/sync",
      "schedule": "*/2 * * * *"
    },
    {
      "path": "/api/cron/webhook-process",
      "schedule": "*/2 * * * *"
    },
    {
      "path": "/api/cron/reconcile",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

### 3.2 Schedule Frequency

| Job Type | Frequency | Rationale |
|----------|-----------|-----------|
| **Notify** | Every 1 minute | Time-sensitive emails (reminders, confirmations) |
| **Sync** | Every 2 minutes | iCIMS notes should sync promptly |
| **Webhook** | Every 2 minutes | External events need timely processing |
| **Reconcile** | Every 5 minutes | Drift detection less urgent |

### 3.3 Runtime Expectations

| Job Type | Expected Runtime | Max Items/Batch | Timeout Buffer |
|----------|-----------------|-----------------|----------------|
| Notify | 5-15s | 10 | 45s remaining |
| Sync | 10-30s | 10 | 30s remaining |
| Webhook | 10-30s | 10 | 30s remaining |
| Reconcile | 15-45s | 10 | 15s remaining |

### 3.4 Concurrency Model

- **Single instance per job type** enforced via distributed locking
- Vercel may invoke multiple instances; lock prevents duplicate processing
- Jobs use `run_after` field for deferred retry scheduling

---

## 4. Security Model

### 4.1 Cron Secret Authentication

```env
# .env.production
CRON_SECRET=<random-32-byte-hex>
```

**Header Verification:**
```
Authorization: Bearer <CRON_SECRET>
```

Or Vercel's built-in header (preferred):
```
x-vercel-cron-signature: <signature>
```

### 4.2 Endpoint Security Rules

1. **No session/cookie auth required** - Server-to-server only
2. **CRON_SECRET required** - Reject without valid secret
3. **IP allowlist optional** - Vercel IPs if extra paranoid
4. **No secrets in logs** - Mask sensitive data in error messages
5. **Rate limiting** - Implicit via cron schedule

### 4.3 Implementation Pattern

```typescript
// src/lib/cron/auth.ts
export function verifyCronAuth(request: NextRequest): boolean {
  // Option 1: Vercel Cron signature (automatic in Vercel)
  const vercelSignature = request.headers.get('x-vercel-cron-signature');
  if (vercelSignature) {
    // Vercel handles verification automatically
    return true;
  }

  // Option 2: Bearer token for local/fallback
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.CRON_SECRET;

  if (!expectedToken) {
    console.error('[Cron] CRON_SECRET not configured');
    return false;
  }

  return authHeader === `Bearer ${expectedToken}`;
}
```

---

## 5. Concurrency and Locking Strategy

### 5.1 Distributed Lock Requirements

- **At-most-one** runner per job type across all replicas
- **TTL-based** expiration to handle crashes
- **Graceful release** on job completion
- **Visibility** into lock state for ops dashboard

### 5.2 Implementation: PostgreSQL Advisory Locks

**Chosen Approach:** Postgres advisory locks (session-level)

Rationale:
- Native to PostgreSQL, no additional tables
- Automatic release on connection close
- Low overhead, battle-tested
- Works with Supabase

```sql
-- Acquire lock (non-blocking)
SELECT pg_try_advisory_lock(hashtext('cron:notify'));

-- Release lock
SELECT pg_advisory_unlock(hashtext('cron:notify'));
```

### 5.3 Lock Key Mapping

| Job Type | Lock Key | Hash |
|----------|----------|------|
| notify | `cron:notify` | `hashtext('cron:notify')` |
| sync | `cron:sync` | `hashtext('cron:sync')` |
| webhook | `cron:webhook` | `hashtext('cron:webhook')` |
| reconcile | `cron:reconcile` | `hashtext('cron:reconcile')` |

### 5.4 Lock Service Interface

```typescript
// src/lib/cron/locks.ts
export interface CronLock {
  acquire(jobName: string): Promise<boolean>;
  release(jobName: string): Promise<void>;
  isHeld(jobName: string): Promise<boolean>;
}
```

### 5.5 Fallback: job_locks Table

If advisory locks prove insufficient (e.g., connection pooling issues):

```sql
CREATE TABLE job_locks (
  job_name TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,        -- Instance identifier
  locked_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL, -- TTL
  heartbeat_at TIMESTAMPTZ
);

-- Acquire with TTL
INSERT INTO job_locks (job_name, locked_by, locked_at, expires_at)
VALUES ($1, $2, NOW(), NOW() + INTERVAL '2 minutes')
ON CONFLICT (job_name) DO UPDATE
SET locked_by = $2, locked_at = NOW(), expires_at = NOW() + INTERVAL '2 minutes'
WHERE job_locks.expires_at < NOW();

-- Release
DELETE FROM job_locks WHERE job_name = $1 AND locked_by = $2;
```

---

## 6. Job Runner Endpoints

### 6.1 Endpoint Definitions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/cron/notify` | POST | Process pending notifications |
| `/api/cron/sync` | POST | Process pending sync jobs |
| `/api/cron/webhook-process` | POST | Process pending webhooks |
| `/api/cron/reconcile` | POST | Run detection + process jobs |
| `/api/cron/run-all` | POST | Sequential run of all jobs (dev only) |

### 6.2 Request Schema

```typescript
// No body required - cron triggers are parameter-less
// Optional override for testing:
interface CronRequest {
  batchSize?: number;  // Override default batch size
  dryRun?: boolean;    // Log but don't execute
}
```

### 6.3 Response Schema

```typescript
interface CronResponse {
  success: boolean;
  job: string;              // 'notify' | 'sync' | 'webhook' | 'reconcile'
  status: 'completed' | 'locked' | 'error';

  // Metrics
  processed: number;        // Items successfully processed
  failed: number;           // Items that failed this run
  skipped: number;          // Items skipped (not ready)
  queueDepth: number;       // Remaining items after this run

  // Timing
  startedAt: string;        // ISO timestamp
  finishedAt: string;       // ISO timestamp
  durationMs: number;       // Execution time

  // Errors (if any)
  errors?: Array<{
    itemId: string;
    error: string;
  }>;
}
```

### 6.4 Example Response

```json
{
  "success": true,
  "job": "notify",
  "status": "completed",
  "processed": 8,
  "failed": 1,
  "skipped": 0,
  "queueDepth": 12,
  "startedAt": "2026-01-17T10:00:00.000Z",
  "finishedAt": "2026-01-17T10:00:08.234Z",
  "durationMs": 8234,
  "errors": [
    {
      "itemId": "notif-abc123",
      "error": "SMTP connection timeout"
    }
  ]
}
```

### 6.5 Locked Response

```json
{
  "success": true,
  "job": "notify",
  "status": "locked",
  "processed": 0,
  "failed": 0,
  "skipped": 0,
  "queueDepth": -1,
  "startedAt": "2026-01-17T10:00:00.000Z",
  "finishedAt": "2026-01-17T10:00:00.005Z",
  "durationMs": 5,
  "message": "Another instance is currently processing this job"
}
```

---

## 7. Observability and Ops UX

### 7.1 JobRun Model

```typescript
interface JobRun {
  id: string;
  jobName: 'notify' | 'sync' | 'webhook' | 'reconcile';

  // Timing
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;

  // Results
  status: 'running' | 'completed' | 'failed' | 'locked';
  processed: number;
  failed: number;
  skipped: number;
  queueDepthBefore: number;
  queueDepthAfter: number;

  // Context
  triggeredBy: 'cron' | 'manual' | 'api';
  instanceId: string;       // For debugging multi-instance

  // Errors
  errorSummary: string | null;
  errorDetails: Record<string, unknown> | null;

  createdAt: Date;
}
```

### 7.2 Database Table

```sql
CREATE TABLE job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  status TEXT NOT NULL,
  processed INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  queue_depth_before INTEGER,
  queue_depth_after INTEGER,
  triggered_by TEXT NOT NULL,
  instance_id TEXT,
  error_summary TEXT,
  error_details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for dashboard queries
CREATE INDEX idx_job_runs_job_name_started ON job_runs(job_name, started_at DESC);
CREATE INDEX idx_job_runs_status ON job_runs(status) WHERE status != 'completed';
```

### 7.3 Ops Dashboard Additions

**New Tab: "Jobs"** (in `/ops` page)

| Section | Content |
|---------|---------|
| **Job Status Cards** | Last run per job (time, status, counts) |
| **Queue Depths** | Current pending count per job type |
| **Recent Runs** | Table of last 20 runs across all jobs |
| **Failure Rate** | % failed in last 24h per job |
| **Manual Run Buttons** | Trigger job with confirmation (superadmin only) |

### 7.4 Ops API Additions

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ops/jobs` | GET | List recent job runs with filtering |
| `/api/ops/jobs/status` | GET | Current status per job type |
| `/api/ops/jobs/[name]/run` | POST | Manual trigger (superadmin) |

### 7.5 Manual Run UI

```
┌─────────────────────────────────────────────────────────┐
│  Manual Job Trigger                                     │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Job: [Notifications ▼]                                 │
│                                                         │
│  ⚠️  This will process pending items immediately.       │
│      Current queue depth: 23 items                      │
│                                                         │
│  [ Cancel ]                    [ Run Now ]              │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 8. Test Plan

### 8.1 Unit Tests

**Lock Acquisition/Release (`__tests__/lib/cron/locks.test.ts`)**
- ✓ `acquire()` returns true when lock is free
- ✓ `acquire()` returns false when lock is held
- ✓ `release()` frees the lock for next caller
- ✓ Lock expires after TTL (if using table-based)
- ✓ Same caller can re-acquire after release

**Endpoint Auth (`__tests__/api/cron/auth.test.ts`)**
- ✓ Request without auth header returns 401
- ✓ Request with invalid token returns 401
- ✓ Request with valid CRON_SECRET returns 200
- ✓ Request with Vercel signature is accepted

**Cron Response Format (`__tests__/api/cron/response.test.ts`)**
- ✓ Successful run returns correct schema
- ✓ Locked state returns status: "locked"
- ✓ Error state includes error summary
- ✓ Duration is calculated correctly

### 8.2 Integration Tests

**End-to-End Cron Flow (`__tests__/integration/cron.test.ts`)**
- ✓ `/api/cron/notify` processes pending notifications
- ✓ `/api/cron/sync` processes pending sync jobs
- ✓ Job run is recorded in `job_runs` table
- ✓ Queue depth is updated after processing

**Concurrency Tests (`__tests__/integration/cron-concurrency.test.ts`)**
- ✓ Parallel requests: one succeeds, others return "locked"
- ✓ Lock is released after job completes
- ✓ Lock is released on error (cleanup)

### 8.3 Build Constraints

- All `/api/cron/*` routes must have `export const dynamic = 'force-dynamic'`
- No `request.url` parsing that triggers static generation errors
- Headers accessed via `request.headers.get()` only

### 8.4 Manual Verification Checklist

- [ ] Local: Run `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/notify`
- [ ] Local: Verify job_runs table has new entry
- [ ] Local: Run same command twice quickly, verify one returns "locked"
- [ ] Preview: Deploy to Vercel preview, verify cron config loads
- [ ] Preview: Manually trigger via Vercel dashboard
- [ ] Prod: Monitor first 24h of cron runs in ops dashboard

---

## 9. Implementation Plan

### Step 1: Database Migration - job_runs Table
**Files:**
- `supabase/migrations/YYYYMMDD_create_job_runs.sql`

**Tests:**
- Migration applies cleanly
- Table has correct indexes

**Verification:**
- Run `npx supabase db push`

---

### Step 2: Cron Lock Service
**Files:**
- `src/lib/cron/locks.ts` - Lock acquisition/release
- `src/lib/cron/index.ts` - Export barrel

**Tests:**
- `__tests__/lib/cron/locks.test.ts`

**Verification:**
- Unit tests pass

---

### Step 3: Cron Auth Middleware
**Files:**
- `src/lib/cron/auth.ts` - Verify CRON_SECRET or Vercel signature

**Tests:**
- `__tests__/lib/cron/auth.test.ts`

**Verification:**
- Unit tests pass

---

### Step 4: Job Run Recording Service
**Files:**
- `src/lib/cron/jobRuns.ts` - Create/update job runs
- `src/lib/db/memory-adapter.ts` - Add job_runs to memory store
- `src/lib/db/supabase-adapter.ts` - Add job_runs queries
- `src/lib/db/index.ts` - Export job run functions

**Tests:**
- `__tests__/lib/cron/jobRuns.test.ts`

**Verification:**
- Unit tests pass

---

### Step 5: Cron API Endpoints
**Files:**
- `src/app/api/cron/notify/route.ts`
- `src/app/api/cron/sync/route.ts`
- `src/app/api/cron/webhook-process/route.ts`
- `src/app/api/cron/reconcile/route.ts`

**Tests:**
- `__tests__/api/cron/notify.test.ts`
- `__tests__/api/cron/sync.test.ts`

**Verification:**
- Manual curl tests locally
- `npm run build` succeeds

---

### Step 6: Refactor Workers to Use Shared Logic
**Files:**
- `src/lib/workers/notifyWorker.ts` - Extract from script
- `src/lib/workers/syncWorker.ts` - Extract from script
- `src/lib/workers/webhookWorker.ts` - Extract from script
- `src/lib/workers/reconcileWorker.ts` - Extract from script
- Update `scripts/*.ts` to import from lib

**Tests:**
- Existing worker tests still pass

**Verification:**
- `npm run scheduler:notify:once` still works

---

### Step 7: Vercel Configuration
**Files:**
- `vercel.json` - Add cron configuration

**Tests:**
- N/A (config file)

**Verification:**
- Vercel preview deployment picks up crons
- Cron appears in Vercel dashboard

---

### Step 8: Ops API - Jobs Endpoints
**Files:**
- `src/app/api/ops/jobs/route.ts` - List job runs
- `src/app/api/ops/jobs/status/route.ts` - Current status per job
- `src/app/api/ops/jobs/[name]/run/route.ts` - Manual trigger

**Tests:**
- `__tests__/api/ops/jobs.test.ts`

**Verification:**
- API returns expected data

---

### Step 9: Ops Dashboard - Jobs Tab
**Files:**
- `src/app/ops/page.tsx` - Add Jobs tab

**Tests:**
- Component renders without error

**Verification:**
- Visual inspection in browser

---

### Step 10: Environment Variables
**Files:**
- `.env.example` - Add CRON_SECRET
- `docs/DEPLOYMENT.md` - Document cron setup

**Tests:**
- N/A

**Verification:**
- Documentation is clear

---

### Step 11: Integration Tests
**Files:**
- `__tests__/integration/cron.test.ts`
- `__tests__/integration/cron-concurrency.test.ts`

**Tests:**
- All integration tests pass

**Verification:**
- `npm test` passes

---

### Step 12: Production Rollout
**Actions:**
1. Set `CRON_SECRET` in Vercel production environment
2. Deploy to production
3. Verify crons appear in Vercel dashboard
4. Monitor first 24h via ops dashboard
5. Check Vercel logs for any errors

**Rollback Plan:**
- Remove cron config from `vercel.json`
- Redeploy
- Fall back to manual script execution

---

## 10. Rollout Plan

### Phase 1: Development (Local)
- Implement Steps 1-6
- All unit tests passing
- Manual verification with curl

### Phase 2: Preview (Vercel Preview)
- Implement Steps 7-9
- Deploy to preview branch
- Verify crons in Vercel dashboard
- Test manual trigger from ops

### Phase 3: Staging (Optional)
- If staging environment exists, full test cycle
- Load test with realistic queue sizes

### Phase 4: Production
- Step 10: Set environment variables
- Step 12: Deploy and monitor
- Enable crons one at a time:
  1. notify (lowest risk, most frequent)
  2. sync
  3. webhook
  4. reconcile

### Success Criteria
- [ ] All crons running on schedule
- [ ] No duplicate processing (locks working)
- [ ] Ops dashboard shows job history
- [ ] Queue depths trending down
- [ ] Zero manual intervention for 7 days

---

## Appendix A: Alternative Approaches Considered

### GitHub Actions Cron (Fallback)

```yaml
# .github/workflows/cron-jobs.yml
name: Scheduled Jobs

on:
  schedule:
    - cron: '* * * * *'  # Every minute
  workflow_dispatch:

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Trigger notify job
        run: |
          curl -X POST \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            https://your-app.vercel.app/api/cron/notify
```

**When to use:**
- Vercel Cron not available (free plan)
- Need longer runtimes (GitHub Actions: 6 hour limit)
- Need complex conditional logic

### Supabase Edge Functions + pg_cron

Not recommended because:
- Would require duplicating worker logic in Deno
- Loses access to Next.js app context
- More complex deployment

### Dedicated Worker Process (Future)

For when jobs exceed serverless limits:
- Deploy to Fly.io, Railway, or Render
- Run `npm run scheduler:sync` as persistent process
- Use process manager (PM2) for restarts
- Horizontal scaling with Redis-based locks

---

## Appendix B: Monitoring Queries

```sql
-- Jobs in last 24 hours by status
SELECT job_name, status, COUNT(*)
FROM job_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY job_name, status;

-- Average duration by job
SELECT job_name, AVG(duration_ms) as avg_ms, MAX(duration_ms) as max_ms
FROM job_runs
WHERE status = 'completed'
GROUP BY job_name;

-- Current queue depths
SELECT
  (SELECT COUNT(*) FROM notification_jobs WHERE status = 'PENDING') as notify_queue,
  (SELECT COUNT(*) FROM sync_jobs WHERE status = 'pending') as sync_queue,
  (SELECT COUNT(*) FROM webhook_events WHERE status IN ('received', 'processing')) as webhook_queue,
  (SELECT COUNT(*) FROM reconciliation_jobs WHERE status = 'pending') as reconcile_queue;

-- Failure rate last 24h
SELECT
  job_name,
  COUNT(*) FILTER (WHERE status = 'failed') as failed,
  COUNT(*) as total,
  ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'failed') / COUNT(*), 2) as failure_pct
FROM job_runs
WHERE started_at > NOW() - INTERVAL '24 hours'
GROUP BY job_name;
```

---

*End of Production Job Runner Strategy*
