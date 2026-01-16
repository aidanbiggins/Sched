# Scheduler M8: Production Database (Supabase/PostgreSQL)

**Version:** 1.0
**Created:** 2026-01-15
**Status:** Planning

Migrate from in-memory storage to Supabase PostgreSQL for production-ready data persistence.

---

## 1. Goals

1. **Persistent Storage** - Data survives server restarts and deployments
2. **Production Ready** - Proper connection pooling, migrations, backups
3. **Supabase Integration** - Use Supabase for database + future auth capabilities
4. **Zero Data Loss** - Clean migration path from dev to production
5. **Maintain API Compatibility** - Existing endpoints work unchanged

---

## 2. Current State

### In-Memory Database (`src/lib/db/index.ts`)

Current implementation uses Maps for storage:

```typescript
// Current in-memory stores
const schedulingRequests = new Map<string, SchedulingRequest>();
const bookings = new Map<string, Booking>();
const auditLogs = new Map<string, AuditLog>();
const syncJobs = new Map<string, SyncJob>();
const webhookEvents = new Map<string, WebhookEvent>();
const reconciliationJobs = new Map<string, ReconciliationJob>();
```

### Existing Entity Types

From `src/types/scheduling.ts`:
- `SchedulingRequest` - Core scheduling request
- `Booking` - Confirmed bookings
- `AuditLog` - Action history
- `SyncJob` - Retry queue for iCIMS
- `WebhookEvent` - Incoming webhooks
- `ReconciliationJob` - Drift repair jobs

---

## 3. Supabase Setup

### 3.1 Project Creation

1. Create Supabase project at https://supabase.com
2. Note connection details:
   - Project URL: `https://<project-ref>.supabase.co`
   - Anon Key: For client-side (public)
   - Service Role Key: For server-side (secret)
   - Database URL: Direct PostgreSQL connection

### 3.2 Environment Variables

```bash
# Supabase
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Direct PostgreSQL (for migrations)
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

# Mode toggle (for gradual migration)
DB_MODE=supabase  # 'memory' | 'supabase'
```

---

## 4. Database Schema

### 4.1 SQL Migrations

```sql
-- Migration: 001_initial_schema.sql

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Scheduling Requests
CREATE TABLE scheduling_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Context
  application_id TEXT,
  candidate_name TEXT NOT NULL,
  candidate_email TEXT NOT NULL,
  req_id TEXT,
  req_title TEXT NOT NULL,
  interview_type TEXT NOT NULL CHECK (interview_type IN ('phone_screen', 'hm_screen', 'onsite', 'final')),
  duration_minutes INTEGER NOT NULL,

  -- Participants
  interviewer_emails TEXT[] NOT NULL,

  -- Calendar linkage
  organizer_email TEXT NOT NULL,
  calendar_provider TEXT NOT NULL DEFAULT 'microsoft_graph',
  graph_tenant_id TEXT,

  -- Scheduling window
  window_start TIMESTAMP WITH TIME ZONE NOT NULL,
  window_end TIMESTAMP WITH TIME ZONE NOT NULL,
  candidate_timezone TEXT NOT NULL,

  -- Public link
  public_token TEXT NOT NULL,
  public_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'booked', 'rescheduled', 'cancelled', 'expired')),

  -- Attention flags
  needs_attention BOOLEAN NOT NULL DEFAULT false,
  needs_attention_reason TEXT,

  -- Audit
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for scheduling_requests
CREATE INDEX idx_scheduling_requests_status ON scheduling_requests(status);
CREATE INDEX idx_scheduling_requests_public_token_hash ON scheduling_requests(public_token_hash);
CREATE INDEX idx_scheduling_requests_candidate_email ON scheduling_requests(candidate_email);
CREATE INDEX idx_scheduling_requests_needs_attention ON scheduling_requests(needs_attention) WHERE needs_attention = true;
CREATE INDEX idx_scheduling_requests_expires_at ON scheduling_requests(expires_at);

-- Bookings
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID NOT NULL REFERENCES scheduling_requests(id) ON DELETE CASCADE,

  -- Scheduled time
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end TIMESTAMP WITH TIME ZONE NOT NULL,

  -- Calendar event
  calendar_event_id TEXT,
  calendar_ical_uid TEXT,
  conference_join_url TEXT,

  -- iCIMS sync
  icims_activity_id TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'rescheduled', 'cancelled')),
  confirmed_at TIMESTAMP WITH TIME ZONE,
  cancelled_at TIMESTAMP WITH TIME ZONE,
  cancellation_reason TEXT,

  -- Audit
  booked_by TEXT NOT NULL,
  booked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for bookings
CREATE INDEX idx_bookings_request_id ON bookings(request_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_scheduled_start ON bookings(scheduled_start);

-- Audit Logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES scheduling_requests(id) ON DELETE SET NULL,
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,

  action TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('coordinator', 'candidate', 'system')),
  actor_id TEXT,

  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for audit_logs
CREATE INDEX idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX idx_audit_logs_booking_id ON audit_logs(booking_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Sync Jobs (iCIMS retry queue)
CREATE TABLE sync_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL CHECK (type IN ('icims_note')),
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('scheduling_request', 'booking')),

  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  last_error TEXT,

  payload JSONB NOT NULL DEFAULT '{}',
  run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for sync_jobs
CREATE INDEX idx_sync_jobs_status ON sync_jobs(status);
CREATE INDEX idx_sync_jobs_run_after ON sync_jobs(run_after) WHERE status IN ('pending', 'processing');

-- Webhook Events
CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  provider TEXT NOT NULL DEFAULT 'icims',
  event_id TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  event_type TEXT NOT NULL,

  payload JSONB NOT NULL,
  signature TEXT NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,

  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Idempotency constraint
  UNIQUE(provider, event_id)
);

-- Indexes for webhook_events
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_payload_hash ON webhook_events(payload_hash);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at DESC);

-- Reconciliation Jobs
CREATE TABLE reconciliation_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id TEXT,
  job_type TEXT NOT NULL CHECK (job_type IN ('icims_note_missing', 'calendar_event_missing', 'state_mismatch')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('scheduling_request', 'booking')),
  entity_id TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'requires_attention')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  detection_reason TEXT NOT NULL,

  run_after TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for reconciliation_jobs
CREATE INDEX idx_reconciliation_jobs_status ON reconciliation_jobs(status);
CREATE INDEX idx_reconciliation_jobs_entity ON reconciliation_jobs(entity_type, entity_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_scheduling_requests_updated_at
  BEFORE UPDATE ON scheduling_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON bookings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sync_jobs_updated_at
  BEFORE UPDATE ON sync_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_webhook_events_updated_at
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reconciliation_jobs_updated_at
  BEFORE UPDATE ON reconciliation_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 4.2 Future Schema (M7.5 Preparation)

```sql
-- Migration: 002_user_accounts.sql (for M7.5)
-- This will be added in M7.5, but schema is designed to accommodate it

-- Users table (to be added)
-- calendar_connections table (to be added)
-- interviewer_invitations table (to be added)

-- Add coordinator_id to scheduling_requests (nullable for backward compatibility)
-- ALTER TABLE scheduling_requests ADD COLUMN coordinator_id UUID REFERENCES users(id);
```

---

## 5. Implementation

### 5.1 Supabase Client Setup

```typescript
// src/lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
```

### 5.2 Type Generation

Use Supabase CLI to generate TypeScript types:

```bash
npx supabase gen types typescript --project-id <project-ref> > src/lib/supabase/types.ts
```

### 5.3 Database Adapter Pattern

Create an adapter that matches existing interface:

```typescript
// src/lib/db/supabase-adapter.ts
import { supabase } from '../supabase/client';
import type { SchedulingRequest, Booking, AuditLog } from '@/types/scheduling';

export async function createSchedulingRequest(
  data: Omit<SchedulingRequest, 'id' | 'createdAt' | 'updatedAt'>
): Promise<SchedulingRequest> {
  const { data: result, error } = await supabase
    .from('scheduling_requests')
    .insert({
      application_id: data.applicationId,
      candidate_name: data.candidateName,
      candidate_email: data.candidateEmail,
      req_id: data.reqId,
      req_title: data.reqTitle,
      interview_type: data.interviewType,
      duration_minutes: data.durationMinutes,
      interviewer_emails: data.interviewerEmails,
      organizer_email: data.organizerEmail,
      calendar_provider: data.calendarProvider,
      graph_tenant_id: data.graphTenantId,
      window_start: data.windowStart.toISOString(),
      window_end: data.windowEnd.toISOString(),
      candidate_timezone: data.candidateTimezone,
      public_token: data.publicToken,
      public_token_hash: data.publicTokenHash,
      expires_at: data.expiresAt.toISOString(),
      status: data.status,
      needs_attention: data.needsAttention,
      needs_attention_reason: data.needsAttentionReason,
      created_by: data.createdBy,
    })
    .select()
    .single();

  if (error) throw error;
  return mapToSchedulingRequest(result);
}

// Helper to map database row to domain type
function mapToSchedulingRequest(row: any): SchedulingRequest {
  return {
    id: row.id,
    applicationId: row.application_id,
    candidateName: row.candidate_name,
    candidateEmail: row.candidate_email,
    reqId: row.req_id,
    reqTitle: row.req_title,
    interviewType: row.interview_type,
    durationMinutes: row.duration_minutes,
    interviewerEmails: row.interviewer_emails,
    organizerEmail: row.organizer_email,
    calendarProvider: row.calendar_provider,
    graphTenantId: row.graph_tenant_id,
    windowStart: new Date(row.window_start),
    windowEnd: new Date(row.window_end),
    candidateTimezone: row.candidate_timezone,
    publicToken: row.public_token,
    publicTokenHash: row.public_token_hash,
    expiresAt: new Date(row.expires_at),
    status: row.status,
    needsAttention: row.needs_attention,
    needsAttentionReason: row.needs_attention_reason,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

// Similar functions for all other operations...
```

### 5.4 Database Factory

```typescript
// src/lib/db/index.ts (updated)
import * as memoryDb from './memory-adapter';
import * as supabaseDb from './supabase-adapter';

const isSupabase = process.env.DB_MODE === 'supabase';

// Export the appropriate implementation
export const createSchedulingRequest = isSupabase
  ? supabaseDb.createSchedulingRequest
  : memoryDb.createSchedulingRequest;

export const getSchedulingRequest = isSupabase
  ? supabaseDb.getSchedulingRequest
  : memoryDb.getSchedulingRequest;

// ... etc for all functions
```

---

## 6. Migration Strategy

### 6.1 Gradual Rollout

1. **Phase 1**: Add Supabase adapter alongside memory adapter
2. **Phase 2**: Test with `DB_MODE=supabase` in development
3. **Phase 3**: Deploy with `DB_MODE=supabase` in production
4. **Phase 4**: Remove memory adapter after validation

### 6.2 Data Migration (if needed)

For existing in-memory data during development:

```typescript
// scripts/migrate-to-supabase.ts
import { getAllSchedulingRequests, getAllBookings } from '../src/lib/db/memory-adapter';
import { supabase } from '../src/lib/supabase/client';

async function migrate() {
  // Get all in-memory data
  const requests = getAllSchedulingRequests();
  const bookings = getAllBookings();

  // Insert into Supabase
  for (const request of requests) {
    await supabase.from('scheduling_requests').insert(mapToDbRow(request));
  }

  // ... similar for other entities
}
```

---

## 7. File Structure

```
src/lib/
├── db/
│   ├── index.ts              # Factory that switches between adapters
│   ├── memory-adapter.ts     # Existing in-memory implementation
│   ├── supabase-adapter.ts   # New Supabase implementation
│   └── types.ts              # Shared types
├── supabase/
│   ├── client.ts             # Supabase client initialization
│   ├── types.ts              # Generated database types
│   └── migrations/           # SQL migration files
│       ├── 001_initial_schema.sql
│       └── ...
```

---

## 8. Testing Strategy

### 8.1 Test Database

- Use separate Supabase project for testing, OR
- Use Supabase local development with Docker

```bash
# Local Supabase for testing
npx supabase start
npx supabase db reset  # Apply migrations
```

### 8.2 Test Configuration

```typescript
// jest.setup.js (updated)
process.env.DB_MODE = 'memory'; // Use in-memory for unit tests

// For integration tests
// process.env.DB_MODE = 'supabase';
// process.env.SUPABASE_URL = 'http://localhost:54321';
```

### 8.3 Integration Tests

```typescript
// __tests__/integration/supabase.test.ts
describe('Supabase Integration', () => {
  beforeAll(async () => {
    // Ensure test database is clean
    await supabase.from('scheduling_requests').delete().neq('id', '');
  });

  it('creates and retrieves scheduling request', async () => {
    const request = await createSchedulingRequest({...});
    const retrieved = await getSchedulingRequest(request.id);
    expect(retrieved).toEqual(request);
  });
});
```

---

## 9. Implementation Phases

### Phase 1: Setup (Day 1)
- [ ] Create Supabase project
- [ ] Configure environment variables
- [ ] Set up Supabase client
- [ ] Generate TypeScript types

### Phase 2: Schema & Migrations (Day 1-2)
- [ ] Create initial migration SQL
- [ ] Apply migrations to Supabase
- [ ] Verify schema in Supabase dashboard

### Phase 3: Adapter Implementation (Day 2-3)
- [ ] Implement supabase-adapter.ts with all CRUD functions
- [ ] Create database factory in index.ts
- [ ] Map between database rows and domain types

### Phase 4: Testing (Day 3-4)
- [ ] Update existing tests to work with both adapters
- [ ] Add integration tests for Supabase
- [ ] Test all API endpoints with `DB_MODE=supabase`

### Phase 5: Deployment (Day 4-5)
- [ ] Deploy with `DB_MODE=supabase`
- [ ] Verify all flows work in production
- [ ] Monitor for errors

---

## 10. Environment Variables Summary

```bash
# Database Mode
DB_MODE=supabase  # 'memory' | 'supabase'

# Supabase Configuration
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Direct PostgreSQL (optional, for migrations)
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

---

## 11. Success Criteria

- [ ] All existing tests pass with `DB_MODE=supabase`
- [ ] Scheduling request CRUD works end-to-end
- [ ] Booking flow works with persistent data
- [ ] Ops dashboard shows data from Supabase
- [ ] Data persists across server restarts
- [ ] No degradation in API response times
- [ ] Build passes

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Schema mismatch with types | High | Generate types from DB, validate at compile time |
| Connection pool exhaustion | Medium | Use Supabase connection pooling (Supavisor) |
| Migration errors | High | Test migrations locally first, use transactions |
| Performance regression | Medium | Add database indexes, monitor query times |
| Data loss during migration | High | Keep memory adapter as fallback, backup data |

---

*Last updated: January 2026*
