# Scheduler M6: Webhooks, Reconciliation & Operator Health

**Version:** 1.0
**Created:** 2026-01-13
**Status:** In Progress

This document defines the implementation plan for Milestone M6 - building a production-grade operator experience with webhook processing, reconciliation jobs, and a polished health dashboard.

---

## 1. Current State Inventory

### Repo Structure
```
src/
├── app/
│   ├── api/
│   │   ├── webhooks/icims/route.ts      # Existing webhook endpoint
│   │   ├── scheduling-requests/          # Coordinator APIs
│   │   │   ├── route.ts                  # List with filters
│   │   │   ├── [id]/route.ts            # Detail
│   │   │   ├── [id]/cancel/             # Cancel
│   │   │   ├── [id]/reschedule/         # Reschedule
│   │   │   ├── [id]/sync/retry/         # Retry sync
│   │   │   └── bulk-cancel/             # Bulk cancel
│   │   ├── public/                       # Candidate APIs
│   │   └── scheduling/                   # Legacy APIs
│   ├── coordinator/                      # Coordinator dashboard
│   │   ├── page.tsx                      # List view
│   │   └── [id]/page.tsx                # Detail view
│   └── book/[token]/                     # Candidate booking
├── lib/
│   ├── db/index.ts                       # In-memory database
│   ├── graph/                            # Microsoft Graph client
│   ├── icims/                            # iCIMS client + writeback
│   ├── webhook/WebhookService.ts         # Existing webhook handler
│   └── scheduling/                       # Core scheduling logic
├── components/
│   └── ErrorBoundary.tsx                 # Error boundary
└── types/scheduling.ts                   # All type definitions
```

### Existing Patterns
- **API Framework:** Next.js 14 App Router
- **Auth:** None currently (coordinator routes are unprotected)
- **Database:** In-memory store with async functions
- **Logging:** Console.log statements
- **Testing:** Jest + React Testing Library
- **Scripts:** ts-node for worker scripts (sync-worker.ts)
- **UI Components:** Raw Tailwind CSS, no component library

### Current Webhook Implementation
- Endpoint: `POST /api/webhooks/icims`
- HMAC signature verification via `x-icims-signature` header
- Idempotency: Deduplication by `eventId`
- Storage: `WebhookEvent` entity in memory
- Processing: Inline during request (blocks response)
- Audit: Logs `webhook_received` action

### Current Sync System
- `SyncJob` entity with status: pending/processing/completed/failed
- Worker script: `npm run scheduler:sync`
- Exponential backoff: 1min, 5min, 15min, 30min, 60min
- Max attempts: 5

---

## 2. Design Decisions

### Webhook Improvements
1. **Separate storage from processing** - Store immediately, process async via worker
2. **Enhanced idempotency** - Support both external_event_id and payload_hash
3. **Status tracking** - RECEIVED → PROCESSING → PROCESSED/FAILED
4. **Tenant support** - Add tenant_id field for future multi-tenant

### Reconciliation Framework
1. **Generic job table** - Reuse sync_jobs pattern with new job types
2. **Safety-first** - Never auto-repair if multiple failures, require operator
3. **Audit everything** - Full trail of detection and repair actions
4. **needs_attention flag** - Surface issues requiring human intervention

### Health Dashboard
1. **Operator-first design** - Clear metrics, actionable items
2. **Real-time summary** - Cards with key counts
3. **Drill-down tables** - Failed webhooks, sync issues, needs attention
4. **Quick actions** - One-click retry and reconcile

---

## 3. Schema Changes

### WebhookEvent Enhancements
```typescript
interface WebhookEvent {
  id: string;
  tenantId: string | null;           // NEW: Multi-tenant support
  provider: 'icims';                  // NEW: Provider identifier
  eventId: string;                    // External event ID
  payloadHash: string;                // NEW: SHA-256 of payload for dedup
  eventType: string;
  payload: Record<string, unknown>;
  signature: string;
  verified: boolean;
  status: 'received' | 'processing' | 'processed' | 'failed'; // NEW
  attempts: number;                   // NEW
  lastError: string | null;           // NEW
  runAfter: Date;                     // NEW: For retry scheduling
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;                    // NEW
}
```

### ReconciliationJob (extends SyncJob pattern)
```typescript
type ReconciliationJobType =
  | 'icims_note_missing'
  | 'calendar_event_missing'
  | 'state_mismatch';

interface ReconciliationJob {
  id: string;
  tenantId: string | null;
  jobType: ReconciliationJobType;
  entityType: 'scheduling_request' | 'booking';
  entityId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'requires_attention';
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  detectionReason: string;           // Why was this job created
  runAfter: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

### SchedulingRequest Enhancement
```typescript
interface SchedulingRequest {
  // ... existing fields ...
  needsAttention: boolean;           // NEW: Flag for operator review
  needsAttentionReason: string | null; // NEW: Why attention needed
}
```

---

## 4. Webhook Security & Idempotency

### Signature Verification
- Use `x-icims-signature` header
- HMAC-SHA256 with tenant webhook secret
- Timing-safe comparison to prevent timing attacks

### Idempotency Rules
1. If `eventId` present: Dedupe by `(tenantId, provider, eventId)`
2. If no `eventId`: Dedupe by `(tenantId, provider, payloadHash)`
3. Store even if duplicate, return success with `isDuplicate: true`

### Fast Acknowledgment
- Return 200 immediately after validation + insert
- Process async via worker command

---

## 5. Processor Design

### Webhook Processor
```
npm run scheduler:webhook:process
```

**Algorithm:**
1. Fetch webhooks with status = 'received', runAfter <= now
2. For each webhook:
   a. Mark status = 'processing'
   b. Parse payload, extract normalized fields
   c. Execute event-specific logic (future: auto-create requests)
   d. Mark status = 'processed' or 'failed'
   e. Write audit log

**Normalized Fields:**
- event_type
- icims_application_id (if present)
- candidate_email (if present)
- requisition_id (if present)

---

## 6. Reconciliation Job Types

### A) ICIMS_NOTE_MISSING

**Detection:**
- SchedulingRequest status changed (booked/cancelled/rescheduled)
- SyncJob exists with status = 'failed'
- OR no successful sync_job_success audit log for the state change

**Repair:**
- Create new SyncJob for iCIMS writeback
- Leverage existing retry mechanism

**Safety:**
- Max 3 reconciliation attempts per request
- After 3 failures: set needsAttention = true

### B) CALENDAR_EVENT_MISSING

**Detection:**
- Booking exists with status = 'confirmed' or 'rescheduled'
- calendarEventId is null
- OR (future) Graph API reports event not found

**Repair (BOOKED/RESCHEDULED only):**
1. Call GraphCalendarClient.createEvent()
2. Update booking with new calendarEventId
3. Write iCIMS note about repair (non-blocking)
4. Audit as 'calendar_event_recreated'

**Repair (CANCELLED):**
- Do not recreate
- Clear any orphan references
- Audit as 'calendar_event_skip_cancelled'

**Safety:**
- Never recreate if request status = 'cancelled'
- Max 2 recreation attempts
- After failure: set needsAttention = true

### C) STATE_MISMATCH

**Detection:**
- SchedulingRequest status = 'cancelled'
- Booking exists with calendarEventId
- (Future: Graph reports event still active)

**Repair:**
- Call GraphCalendarClient.cancelEvent()
- Audit as 'calendar_event_cleanup'

**Safety:**
- If cancel fails: set needsAttention = true
- Do not retry more than once

---

## 7. Operator Health UX

### Dashboard Route
`/ops` - Operator health monitoring page

**Note:** The `/ops` page is a client-side component (`'use client'`) that fetches data from `/api/ops/*` routes on the client. The API routes use `export const dynamic = 'force-dynamic'` to prevent Next.js from attempting static optimization during build. This ensures clean build output without `DYNAMIC_SERVER_USAGE` errors while maintaining full runtime functionality.

### Summary Cards
| Card | Metric | Data Source |
|------|--------|-------------|
| Webhooks (24h) | Total received | WebhookEvent count |
| Failed Webhooks | Failed in last 24h | WebhookEvent status='failed' |
| Sync Pending | Pending sync jobs | SyncJob status='pending' |
| Reconcile Pending | Pending reconciliation | ReconciliationJob pending |
| Needs Attention | Requests flagged | SchedulingRequest needsAttention=true |

### Trends (Simple)
- Failed webhooks per day (last 7 days)
- SVG sparkline or simple bar chart

### Drill-Down Tables

**Failed Webhooks (last 7 days):**
| Column | Description |
|--------|-------------|
| Event Type | Webhook event type |
| Received At | Timestamp |
| Status | Current status |
| Error | Last error message |
| Actions | View payload, Retry |

**Needs Attention:**
| Column | Description |
|--------|-------------|
| Request ID | Link to detail |
| Candidate | Email |
| Reason | Why needs attention |
| Created | When flagged |
| Actions | View, Resolve |

### Quick Actions
- Run Reconcile Now (all types)
- Run Reconcile for Request (by ID)
- Retry iCIMS Sync (by request ID)
- Process Pending Webhooks

---

## 8. API Endpoints

### Health APIs
```
GET  /api/ops/health/summary
GET  /api/ops/webhooks?status=&page=&limit=
GET  /api/ops/reconciliation-jobs?status=&page=
GET  /api/ops/needs-attention?page=
POST /api/ops/reconcile/run     { schedulingRequestId?: string }
POST /api/ops/sync/retry        { schedulingRequestId: string }
POST /api/ops/webhooks/process
```

### Error Shape
All endpoints return consistent error format:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

---

## 9. Fixtures & Scripts

### Webhook Fixtures
```
fixtures/icims/webhooks/
├── application-status-changed.json
├── candidate-updated.json
├── duplicate-event.json
└── malformed-payload.json
```

### Graph Fixtures (for reconciliation testing)
```
fixtures/graph/
├── event-exists.json
└── event-not-found.json
```

### NPM Scripts
```json
{
  "scheduler:webhook:replay": "ts-node scripts/webhook-replay.ts",
  "scheduler:webhook:process": "ts-node scripts/webhook-processor.ts",
  "scheduler:reconcile": "ts-node scripts/reconcile-worker.ts",
  "scheduler:ops:seed": "ts-node scripts/seed-ops-data.ts"
}
```

---

## 10. Test Plan

### Unit Tests
- [ ] HMAC signature verification (valid, invalid, empty)
- [ ] Idempotency (external ID, payload hash, duplicates)
- [ ] Reconciliation detection rules
- [ ] Safety rules (max attempts, cancelled status)

### Integration Tests
- [ ] Webhook POST stores and dedupes
- [ ] Processor marks events correctly
- [ ] Reconcile repairs missing iCIMS notes
- [ ] Reconcile recreates missing calendar events
- [ ] Reconcile handles cancelled state

### UI Tests
- [ ] Health dashboard renders summary cards
- [ ] Drill-down tables load and paginate
- [ ] Quick actions trigger correctly
- [ ] Error and loading states display

---

## 11. Implementation Steps

### Step 1: Schema & Types
- Update types/scheduling.ts with new fields
- Update lib/db/index.ts with new functions
- Add ReconciliationJob entity

### Step 2: Webhook Storage Enhancement
- Add status, attempts, payloadHash to WebhookEvent
- Update WebhookService to store only (no inline processing)
- Add idempotency by payload hash

### Step 3: Webhook Processor Script
- Create scripts/webhook-processor.ts
- Parse and extract normalized fields
- Status transitions with backoff

### Step 4: Reconciliation Engine
- Create lib/reconciliation/ReconciliationService.ts
- Implement detection rules for each job type
- Implement repair actions with safety checks

### Step 5: Reconciliation Worker
- Create scripts/reconcile-worker.ts
- Process pending reconciliation jobs
- Safety limits and backoff

### Step 6: API Endpoints
- Create /api/ops/* routes
- Health summary endpoint
- Action endpoints (retry, reconcile)

### Step 7: Health Dashboard UI
- Create /coordinator/health/page.tsx
- Summary cards component
- Drill-down tables with pagination
- Quick action buttons

### Step 8: Fixtures & Scripts
- Create fixture files
- Create replay script
- Create seed script for demo

### Step 9: Tests
- Unit tests for new logic
- Integration tests for flows
- UI tests for dashboard

### Step 10: Documentation
- Update SCHEDULER_ROADMAP.md
- Update SCHEDULER_ICIMS_V2_GRAPH.md
- Add operator playbook section

---

## 12. Success Criteria

- [ ] Webhook endpoint is secure and idempotent
- [ ] Processor worker runs safely via npm script
- [ ] Reconciliation detects and repairs common drift
- [ ] Health dashboard shows summary and drill-down
- [ ] Quick actions work (retry, reconcile)
- [ ] All tests pass
- [ ] Build succeeds
- [ ] Documentation updated

---

*Last updated: January 2026*
