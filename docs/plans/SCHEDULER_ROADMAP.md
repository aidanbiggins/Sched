# Scheduler Roadmap

Single source of truth for the Interview Scheduling Tool milestones and progress.

---

## Current Status

**Current Milestone:** M15 - Scheduling Intelligence & Capacity Planning - Complete
**Next Milestone:** TBD

**Tests:** See `npm test` | **Build:** Successful

**M8.5 iCIMS Real Integration Status:** Complete! IcimsClientReal with API key auth, retry logic, rate limiting, idempotency keys, and /api/ops/icims health endpoint.

**M8 Database Status:** Complete! Supabase PostgreSQL connected and operational.

**M7.5 Standalone Mode Status:** Complete! Personal calendar integration with NextAuth.js, Google Calendar OAuth, attendee responses.

**M7 Graph Real Auth Status:** Code complete. Token management, retry logic, and ops endpoint implemented. Awaiting Azure AD app registration for live testing.

---

## Milestones

### M0: Foundation
- [x] Project scaffolding (Next.js, TypeScript, Tailwind)
- [x] Core types and interfaces defined
- [x] In-memory database for development

**Definition of Done:**
- Project builds and runs locally
- Type definitions cover all core entities

---

### M1: Slot Generation & Token Security
- [x] Deterministic slot generation algorithm
- [x] Collision detection with existing bookings
- [x] Secure public token generation (SHA-256 hash, configurable TTL)
- [x] Working hours and timezone support

**Definition of Done:**
- Slots generated correctly within availability windows
- Public tokens are secure (hashed, never stored raw)
- Token expiry enforced

---

### M2: Graph API Integration & Booking
- [x] Graph Calendar Client with mock for development
- [x] FreeBusy availability queries
- [x] Calendar event creation with Teams meeting
- [x] Event update and cancellation
- [x] iCIMS writeback notes on all scheduling events
- [x] Sync job retry mechanism with exponential backoff

**Definition of Done:**
- Calendar events created in organizer mailbox
- iCIMS notes written for create/book/cancel/reschedule
- Failed writebacks queued for retry

---

### M3: Candidate Self-Service UI
- [x] Public booking page (`/book/[token]`)
- [x] Premium UI design (typography, animations, responsive)
- [x] Slot selection and confirmation flow
- [x] Success and error states
- [x] Demo page with mock data (`/book/demo`)
- [ ] Email confirmation to candidate

**Definition of Done:**
- Candidate can view slots and book without authentication
- Booking creates calendar event and updates database
- Confirmation email sent to candidate (pending)

---

### M4: Coordinator Dashboard (Foundation)
- [x] Request listing view
- [x] Request detail view with booking info
- [x] Reschedule functionality
- [x] Cancel functionality
- [x] Sync status indicators

**Definition of Done:**
- Coordinators can view all requests and their status
- Reschedule/cancel operations work end-to-end
- Sync failures visible in UI

---

### M5: Coordinator UX (Production-Ready)
- [x] Status tabs with counts (All, Pending, Booked, Cancelled, Rescheduled)
- [x] Filtering by age range, sync issues, interviewer
- [x] Search by email, application ID, request ID with debounce
- [x] Bulk selection and cancellation
- [x] Pagination with URL state sync
- [x] Request detail timeline with audit history
- [x] Sync status panel with retry buttons
- [x] Resend link endpoint with email content
- [x] Error boundary and standardized error handling
- [x] Comprehensive tests (193 tests passing)

**Definition of Done:**
- Coordinator can manage scheduling daily from one dashboard
- Search and filters work and are shareable via URL
- Detail view shows timeline and sync health with retry button
- Bulk cancel works
- Errors are clear and actionable

---

### M6: Webhooks, Reconciliation & Operator Health
- [x] Enhanced webhook receiver (secure, idempotent, async processing)
- [x] Webhook processor command with status tracking
- [x] Reconciliation engine (detect drift, repair safely)
- [x] Operator health dashboard with summary and drill-down
- [x] Quick actions (retry sync, dismiss attention)
- [x] Seed script and test fixtures
- [x] Comprehensive tests (214 tests)
- [x] Operator runbook documentation

**Definition of Done:**
- Webhook endpoint is secure (HMAC) and idempotent (by eventId or payload hash)
- Processor and reconcile workers run via npm scripts
- Health dashboard shows summary at /ops with tabs for webhooks, reconciliation, attention
- Common drift repaired automatically (state_mismatch, icims_note_missing, calendar_event_missing)
- 214 tests pass and build passes

---

### M7: Microsoft Graph Real Authentication (Code Complete)
- [x] GraphCalendarClientReal implementation with client credentials flow
- [x] Token management with single-flight locking and early refresh
- [x] Retry logic with exponential backoff + jitter for transient errors
- [x] Rate limiting handling (429 with Retry-After header parsing)
- [x] Config validation for required environment variables
- [x] Graph health metrics in ops dashboard (`/api/ops/graph`)
- [x] Integration tests with mocked Graph responses (71 new tests)
- [x] Onboarding documentation for Azure AD setup
- [ ] Scope validation checklist for Application Access Policy (requires Azure AD setup)
- [ ] End-to-end live testing with real Graph API (requires Azure AD setup)

**New Files Created:**
- `src/lib/graph/GraphCalendarClientReal.ts` - Real implementation
- `src/lib/graph/GraphTokenManager.ts` - Token caching with single-flight
- `src/lib/graph/graphRetry.ts` - Retry logic with 429/5xx handling
- `src/lib/graph/validateConfig.ts` - Config validation
- `src/app/api/ops/graph/route.ts` - Graph health endpoint
- `__tests__/lib/graph/GraphTokenManager.test.ts` - Token tests
- `__tests__/lib/graph/graphRetry.test.ts` - Retry logic tests
- `__tests__/lib/graph/validateConfig.test.ts` - Config validation tests
- `__tests__/lib/graph/GraphCalendarClientReal.test.ts` - Integration tests

**Definition of Done:**
- [x] Real Graph client implements all interface methods
- [x] Token automatically refreshes 5 minutes before expiry with single-flight locking
- [x] 429 rate limits handled with `Retry-After` header + jitter
- [x] Transient errors (500, 502, 503, 504) retry with exponential backoff
- [x] Ops dashboard shows Graph API health at `/api/ops/graph`
- [ ] Application Access Policy validated (requires Azure AD setup)
- [ ] End-to-end booking works with real Microsoft Graph (requires Azure AD setup)
- [x] Documentation covers Azure AD app registration and Application Access Policy setup

**Permissions (Least Privilege):**
- `Calendars.ReadBasic.All` - free/busy queries
- `Calendars.ReadWrite` - event CRUD (scoped via Access Policy)

**Plan Document:** `docs/plans/SCHEDULER_M7_GRAPH_AUTH_ONBOARDING_PLAN.md`

---

### M7.1: Graph Production Readiness - Complete
- [x] GraphMetricsCollector for API call tracking (count, latency, errors by endpoint)
- [x] Extended `/api/ops/graph` metrics endpoint
- [x] Smoke test command (`npm run graph:smoke`)
- [x] Validator UI (`/ops/graph-validator`)
- [x] Scoping enforcement validation (Application Access Policy)
- [x] Updated documentation with PowerShell commands for Access Policy
- [ ] Operator runbook Graph troubleshooting section (future)
- [ ] End-to-end validation in real Azure AD tenant (requires Azure setup)

**Definition of Done:**
- [x] GraphMetricsCollector captures API call metrics
- [x] `/api/ops/graph` returns extended metrics including API call stats
- [x] `npm run graph:smoke` executes 6 smoke tests (config, token, organizer access, scoping, freeBusy, event lifecycle)
- [x] Smoke tests verify scoping enforcement (random user denied)
- [x] `/ops/graph-validator` UI shows validation results with pass/fail badges
- [x] Validator tests organizer access AND scoping denial
- [x] Documentation includes Application Access Policy PowerShell commands
- [ ] Operator runbook has Graph troubleshooting section (future)
- [x] Tests pass: `npm test` (567 passing, 12 pre-existing failures)
- [x] Build passes: `npm run build`
- [ ] End-to-end: Smoke tests pass in real Azure AD tenant (requires Azure setup)

**Plan Document:** `docs/plans/GRAPH_PROD_READINESS.md`

---

### M7.5: Standalone Mode (Personal Calendar Integration) - Complete
- [x] NextAuth.js authentication (Google + Microsoft OAuth)
- [x] User accounts and calendar connections database schema
- [x] Google Calendar client (delegated OAuth flow)
- [x] Calendar event creation in user's own calendar
- [x] Attendee response tracking from calendar events
- [x] ATS-optional mode (works without iCIMS)
- [x] Public booking link with copy functionality
- [ ] Microsoft Calendar client (delegated OAuth flow) - Future
- [ ] Interviewer invitation and calendar connection flow - Future
- [ ] Mixed availability (connected calendars + manual windows) - Future

**Definition of Done:**
- [x] User can sign up with personal Google account
- [x] Calendar events created in user's own calendar (no enterprise setup)
- [x] App works fully without ATS configuration
- [x] Attendee responses visible in coordinator dashboard
- [ ] Microsoft calendar support (Future enhancement)
- [ ] Interviewer calendar connections (Future enhancement)

**Plan Document:** `docs/plans/SCHEDULER_M7_5_STANDALONE_MODE_PLAN.md`

---

### M8: Production Database (Supabase/PostgreSQL) - Complete
- [x] Design database schema migrations (001_initial_schema.sql)
- [x] Implement Supabase adapter matching existing db interface
- [x] Database factory to switch between memory/supabase modes
- [x] Update .env.example with Supabase configuration
- [x] Create Supabase project and apply migrations
- [x] Deploy and verify persistent storage

**Definition of Done:**
- All data persisted to Supabase PostgreSQL
- Existing tests pass with `DB_MODE=supabase`
- API response times unchanged
- Data survives deployments and restarts

**Plan Document:** `docs/plans/SCHEDULER_M8_SUPABASE_DATABASE_PLAN.md`

---

### M8.5: Real iCIMS Integration - Complete
- [x] IcimsClientReal implementation with API key auth
- [x] iCIMS API endpoints: getApplication + addApplicationNote
- [x] Idempotency key strategy for duplicate prevention
- [x] Rate limit handling with adaptive throttling
- [x] Error classification (retryable vs permanent)
- [x] Ops metrics endpoint (/api/ops/icims)
- [ ] iCIMS health tab in /ops dashboard (future UI enhancement)
- [x] Integration tests with mocked iCIMS API

**Definition of Done:**
- [x] Notes written to real iCIMS for all 4 events (link_created, booked, cancelled, rescheduled)
- [x] Failed writes retry with exponential backoff (uses HTTP retry: 1s, 2s, 4s with max 3 retries)
- [x] Rate limits handled gracefully (429 + Retry-After header)
- [x] Auth failures (401/403) marked as permanent failure (no retry)
- [x] Ops endpoint shows iCIMS API health and sync queue status
- [x] Idempotency prevents duplicate notes on retry
- [x] Documentation complete for iCIMS setup

**Key Files (created):**
- `src/lib/icims/IcimsClientReal.ts` - Real API implementation
- `src/lib/icims/icimsHttp.ts` - HTTP helper with retry logic
- `src/lib/icims/icimsErrors.ts` - Typed error classes
- `src/lib/icims/icimsConfig.ts` - Config validation
- `src/lib/icims/icimsMetrics.ts` - API call metrics tracking
- `src/app/api/ops/icims/route.ts` - Health endpoint

**Plan Document:** `docs/plans/SCHEDULER_M8_ICIMS_REAL_PLAN.md`

---

### M9: Product Audit + Navigation Hub - Complete
- [x] Feature registry module (`src/lib/featureRegistry.ts`)
- [x] Shared UI primitives (`src/components/ui/`)
- [x] Navigation Hub page (`/hub`)
- [x] Environment status API (`/api/ops/status`)
- [x] Recent visits tracking
- [x] Quick actions for dev (seed, reconciliation)
- [x] Comprehensive tests (45 new tests)

**Definition of Done:**
- [x] Hub page exists at `/hub` with search, categories, recent visits
- [x] Environment status panel shows Graph/iCIMS/Email/DB modes
- [x] Feature registry provides role-based access definitions
- [x] `npm test` passes (466 passing, 12 pre-existing failures)
- [x] `npm run build` passes

**Plan Document:** `docs/plans/PRODUCT_AUDIT_AND_NAV_HUB.md`

---

### M10: Notifications & Reminders - Complete
- [x] Email notifications (booking confirmation, reminders)
- [x] Notification job queue with idempotency keys
- [x] Email templates for all 7 notification types
- [x] Reminder scheduling (24h, 2h before)
- [x] Dev mode (console logging) and SMTP support
- [x] Coordinator resend buttons
- [x] Ops notifications tab with filtering and retry
- [x] Background notification worker with exponential backoff

**Notification Types:**
- `candidate_availability_request` - Initial availability collection request
- `candidate_self_schedule_link` - Self-scheduling booking link
- `booking_confirmation` - Interview booked confirmation
- `reschedule_confirmation` - Interview time changed
- `cancel_notice` - Interview cancelled
- `reminder_24h` - 24 hours before interview
- `reminder_2h` - 2 hours before interview

**Key Files Created:**
- `src/lib/supabase/migrations/004_notifications.sql` - Database schema
- `src/lib/notifications/EmailService.ts` - Email sending service
- `src/lib/notifications/templates.ts` - Email templates
- `src/lib/notifications/NotificationService.ts` - Enqueue logic with idempotency
- `src/app/api/ops/notifications/route.ts` - Notification jobs list API
- `src/app/api/ops/notifications/[id]/retry/route.ts` - Retry failed jobs API
- `scripts/notify-worker.ts` - Background worker

**Definition of Done:**
- [x] Candidates receive booking confirmation email
- [x] Reminder emails scheduled before interview (24h, 2h)
- [x] Cancellation notifications sent
- [x] Reschedule notifications sent
- [x] Idempotency prevents duplicate sends
- [x] Ops dashboard shows notification queue health
- [x] Failed notifications can be retried
- [x] Tests pass (unit tests for templates, idempotency, service)
- [x] `npm run build` passes

**Plan Document:** `docs/plans/M10_NOTIFICATIONS_REMINDERS.md`

---

### M11: Google Auth + Organizations + RBAC - Complete
- [x] Google OAuth only (remove Microsoft provider)
- [x] Organizations table with multi-tenant support
- [x] Org membership with admin/member roles
- [x] Superadmin via SUPERADMIN_EMAILS env var
- [x] Middleware for route protection
- [x] Onboarding flow (create/join org)
- [x] Org picker for multi-org users
- [x] Org switcher in header
- [x] Data scoped by organization
- [ ] Organization settings UI (future)
- [ ] Member management UI (future)

**Definition of Done:**
- [x] Google OAuth sign-in works (Microsoft removed)
- [x] Users can create organizations
- [x] Data is scoped by organization
- [x] RBAC enforced:
  - [x] Superadmin access via SUPERADMIN_EMAILS env var
  - [x] Org admin can manage org
  - [x] Members can use scheduling features
- [x] Middleware protects all routes based on auth/role
- [x] APIs check session + org + role
- [x] Onboarding flow works (0/1/>1 orgs cases)
- [x] Org switcher in header
- [x] Tests pass (unit, integration)
- [x] `npm run build` passes
- [x] Documentation updated

**Key Files Created:**
- `src/lib/auth/guards.ts` - Auth guard helpers
- `src/lib/auth/superadmin.ts` - Superadmin check utilities
- `src/lib/db/organizations.ts` - Organization database operations
- `src/types/organization.ts` - Organization types
- `src/middleware.ts` - Route protection
- `src/app/onboarding/page.tsx` - Onboarding page
- `src/app/org-picker/page.tsx` - Org picker page
- `src/app/api/organizations/route.ts` - Organizations API
- `src/app/api/organizations/select/route.ts` - Org selection API
- `src/components/OrgSwitcher.tsx` - Org switcher component

**Plan Document:** `docs/plans/AUTH_GOOGLE_ORG_RBAC_V1.md`

---

### M12: Analytics & Reporting ✅ Complete
- [x] Booking metrics dashboard
- [x] Time-to-schedule tracking
- [x] Cancellation/reschedule rates

**Definition of Done:**
- [x] Key metrics visible to coordinators
- [x] Export capability for reporting

**Files Added:**
- `src/lib/analytics/types.ts` - Analytics type definitions
- `src/lib/analytics/AnalyticsService.ts` - Core metrics computation
- `src/app/api/analytics/route.ts` - GET metrics endpoint
- `src/app/api/analytics/export/route.ts` - CSV export endpoint
- `src/components/analytics/MetricCard.tsx` - Summary stat card
- `src/components/analytics/HorizontalBar.tsx` - Bar chart visualization
- `src/components/analytics/DistributionChart.tsx` - Time-to-schedule buckets
- `src/components/analytics/PeriodSelector.tsx` - 7d/30d/90d/all selector
- `src/app/analytics/page.tsx` - Analytics dashboard page
- `src/__tests__/analytics.test.ts` - Analytics tests

**Files Modified:**
- `src/lib/db/memory-adapter.ts` - Analytics aggregation functions
- `src/lib/db/supabase-adapter.ts` - Analytics SQL queries
- `src/lib/db/index.ts` - Export analytics functions
- `src/app/ops/page.tsx` - Analytics summary tab for superadmins

**Plan Document:** `docs/plans/M12_ANALYTICS_REPORTING.md`

---

### M13: Production Job Runner ✅ Complete
- [x] Cron API endpoints with secret auth (`/api/cron/notify|sync|webhook|reconcile`)
- [x] Distributed locking (table-based with TTL for memory and Supabase)
- [x] Job run recording and history
- [x] Ops dashboard Jobs tab
- [x] Vercel Cron configuration (`vercel.json`)
- [x] Manual trigger capability from ops dashboard

**Definition of Done:**
- [x] All workers triggered via Vercel Cron on schedule
- [x] At-most-one execution enforced via locks
- [x] Job history visible in ops dashboard
- [x] Manual run available for superadmins
- [x] Zero duplicate processing via distributed locks

**Key Files Created:**
- `src/lib/cron/types.ts` - Cron job types (JobName, JobRun, CronResponse, etc.)
- `src/lib/cron/locks.ts` - Distributed lock service (memory + supabase)
- `src/lib/cron/jobRuns.ts` - Job run logging service (memory + supabase)
- `src/lib/cron/auth.ts` - Cron authentication (Vercel header + Bearer token)
- `src/lib/cron/handler.ts` - Shared cron handler factory
- `src/lib/workers/` - Reusable worker services (notify, sync, webhook, reconcile)
- `src/app/api/cron/notify/route.ts` - Notification cron endpoint
- `src/app/api/cron/sync/route.ts` - Sync cron endpoint
- `src/app/api/cron/webhook/route.ts` - Webhook cron endpoint
- `src/app/api/cron/reconcile/route.ts` - Reconcile cron endpoint
- `src/app/api/ops/jobs/route.ts` - Jobs API for ops dashboard
- `vercel.json` - Vercel Cron configuration

**Cron Schedule (Vercel):**
- `/api/cron/notify` - Every minute
- `/api/cron/sync` - Every 5 minutes
- `/api/cron/webhook` - Every 5 minutes
- `/api/cron/reconcile` - Every 15 minutes

**Plan Document:** `docs/plans/PRODUCTION_JOB_RUNNER_STRATEGY.md`

---

### M14: Enterprise Hardening & Security Audit ✅ Complete
- [x] Route protection coverage (all pages and API routes)
- [x] Resource ownership verification on detail/action APIs
- [x] RLS policies for org-scoped tables (Supabase)
- [x] Enhanced audit logging (login, org actions, exports)
- [x] Admin audit viewer UI
- [x] Critical alerts panel in ops dashboard
- [x] Automated route protection tests

**Phases:**
1. **M14.1 Route Protection** - Middleware coverage, org scoping, ownership guards ✅
2. **M14.2 Database Isolation** - RLS policies for multi-tenant security ✅
3. **M14.3 Audit Enhancement** - Audit viewer UI ✅
4. **M14.4 Observability** - Critical alerts panel in ops dashboard ✅

**Definition of Done:**
- [x] All routes protected according to inventory (middleware.ts updated)
- [x] Resource ownership verified on detail/action APIs (verifyResourceOwnership guard)
- [x] RLS enabled with policies for org-scoped tables (005_rls_policies.sql)
- [x] Audit viewer available to superadmins (/ops/audit)
- [x] Critical alerts panel shows failures with view buttons
- [x] Route protection tests pass (24 tests)
- [x] `npm run build` passes
- [x] `npm test` passes (pre-existing failures unchanged)

**Key Files Created:**
- `src/lib/supabase/migrations/005_rls_policies.sql` - RLS policies for all core tables
- `src/app/ops/audit/page.tsx` - Audit log viewer page
- `src/app/api/ops/audit/route.ts` - Audit logs API endpoint
- `__tests__/lib/auth/route-protection.test.ts` - Route protection tests (24 tests)

**Key Files Modified:**
- `src/middleware.ts` - Added /settings, /analytics to protected routes, org admin check for /settings/team
- `src/lib/auth/guards.ts` - Added verifyResourceOwnership and getUserId functions
- `src/types/scheduling.ts` - Added organizationId to SchedulingRequest
- `src/lib/scheduling/SchedulingService.ts` - Include organizationId in request creation
- `src/lib/db/supabase-adapter.ts` - Map organizationId from database
- `src/app/ops/page.tsx` - Added CriticalAlertsPanel component and Audit Log link

**Plan Document:** `docs/plans/ENTERPRISE_HARDENING_SECURITY_AUDIT.md`

---

### M15: Scheduling Intelligence & Capacity Planning - Complete
- [x] Interviewer profiles with capacity limits and preferences
- [x] Weekly load rollups for utilization tracking
- [x] Enhanced suggestion scoring with load balancing
- [x] Deterministic recommendations engine
- [x] Weekly capacity rollup cron job
- [x] Interviewer profiles UI at /settings/interviewers
- [x] Capacity APIs for interviewers, load, recommendations
- [ ] Coordinator UI shows "why this suggestion" rationale (deferred)
- [ ] Ops dashboard Capacity tab with saturation alerts (deferred)

**Data Model Additions:**
- `interviewer_profiles` - Caps, preferences, tags for each interviewer
- `interviewer_load_rollups` - Weekly aggregate metrics
- `scheduling_recommendations` - Actionable recommendations for coordinators

**Key Features:**
1. **Load Calculation**: Track weekly/daily interview counts per interviewer
2. **Enhanced Scoring**: Factor capacity headroom and load balance into slot suggestions
3. **Recommendations**: Generate alerts for over-capacity, burnout risk, unbalanced load
4. **Fail-Closed**: Conservative behavior when capacity data is missing

**Definition of Done:**
- [x] `interviewer_profiles` table with caps, preferences, tags
- [x] `interviewer_load_rollups` table with weekly metrics
- [x] `scheduling_recommendations` table with lifecycle tracking
- [x] Load calculation handles all edge cases (reschedules, cancellations, multi-interviewer)
- [x] Enhanced scoring module created (integration pending)
- [x] Recommendations generated deterministically with idempotency
- [x] Weekly rollup job runs via Vercel Cron (/api/cron/capacity)
- [x] Interviewer profiles UI for admin/coordinator
- [x] Unit tests for scoring and recommendations
- [x] Build passes

**Plan Document:** `docs/plans/SCHEDULING_INTELLIGENCE_CAPACITY.md`

---

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Calendar API** | Microsoft Graph (direct) | Enterprise standard, Teams integration |
| **Event Ownership** | Organizer mailbox | Single service account, consistent permissions |
| **Slot Generation** | Deterministic algorithm | Reproducible results, easier debugging |
| **ATS Integration** | iCIMS notes first | System of record, audit trail requirement |

---

## Architecture Notes

- **Public booking flow:** Token-based, no authentication required
- **Coordinator flow:** Authenticated, role-based access
- **iCIMS sync:** Non-blocking with retry queue
- **Calendar events:** Created in organizer mailbox, attendees invited

---

*Last updated: 2026-01-17*

---

## Recent Changes

- **2026-01-17:** M15 (Scheduling Intelligence & Capacity Planning) - Implementation complete
  - Database migration: `006_scheduling_intelligence.sql` with interviewer_profiles, load_rollups, recommendations tables
  - TypeScript types: `src/types/capacity.ts` with full type definitions
  - Dual-adapter CRUD: Both memory and Supabase adapters support all capacity operations
  - Load calculation service: Weekly load computation with edge case handling
  - Enhanced scoring service: Capacity factors (load balance, headroom, preferences) for slot scoring
  - Recommendations engine: Deterministic generation of capacity alerts (over/at capacity, unbalanced load)
  - Capacity worker + cron: `/api/cron/capacity` for weekly rollup computation
  - Interviewer profiles UI: `/settings/interviewers` for managing capacity settings
  - Capacity APIs: `/api/capacity/interviewers`, `/api/capacity/load`, `/api/capacity/recommendations`
  - Unit tests: 25 tests for load calculation, scoring, and recommendations
  - Plan document: `docs/plans/SCHEDULING_INTELLIGENCE_CAPACITY.md`
- **2026-01-17:** M14 (Enterprise Hardening & Security Audit) - Implementation complete
  - Route protection coverage: middleware updated for /settings, /analytics, /settings/team
  - Resource ownership verification via verifyResourceOwnership guard function
  - RLS migration script: 005_rls_policies.sql with policies for all core tables
  - Audit log viewer UI at /ops/audit with filtering and pagination
  - Critical alerts panel in ops dashboard for failures with view buttons
  - Route protection tests: 24 tests covering all auth guards
  - organizationId added to SchedulingRequest for multi-tenant isolation
  - Plan document: `docs/plans/ENTERPRISE_HARDENING_SECURITY_AUDIT.md`
- **2026-01-17:** M13 (Production Job Runner) - Implementation complete
  - Cron API endpoints with Vercel Cron header + Bearer token auth
  - Distributed locking with TTL (memory + Supabase implementations)
  - Job run recording and history with queue depth tracking
  - Ops dashboard Jobs tab with manual run buttons
  - Vercel Cron configuration in `vercel.json`
  - Reusable worker services extracted from CLI scripts
  - Unit tests for locks and job runs
  - Plan document: `docs/plans/PRODUCTION_JOB_RUNNER_STRATEGY.md`
- **2026-01-16:** M12 (Analytics & Reporting) - Implementation complete
  - Analytics dashboard at `/analytics` with metrics and charts
  - Period selector (7d, 30d, 90d, all time)
  - Booking rate, time-to-schedule, cancellation metrics
  - Interview type and status breakdowns
  - CSV export functionality
  - Analytics tab in ops dashboard for superadmins
  - Memory and Supabase adapter support
- **2026-01-16:** M7.1 (Graph Production Readiness) - Implementation complete
  - GraphMetricsCollector singleton for API call tracking
  - Extended `/api/ops/graph` with endpoint-level metrics
  - Smoke test command: `npm run graph:smoke`
  - Validator UI at `/ops/graph-validator` with pass/fail checks
  - Validator API at `/api/ops/graph-validator`
  - Plan document: `docs/plans/GRAPH_PROD_READINESS.md`
- **2026-01-16:** M10 (Notifications & Reminders) - Implementation complete
  - Email notification system with 7 notification types
  - Notification job queue with idempotency keys
  - Background worker with retry logic
  - Ops notifications tab with filtering and retry
  - Coordinator resend buttons
- **2026-01-15:** M11 (Google Auth + Organizations + RBAC) - Implementation complete
- **2026-01-15:** Added M9 (Product Audit + Nav Hub) - Complete
- **2026-01-15:** Renumbered M10 → M12 (Analytics & Reporting)
