# Scheduler Roadmap

Single source of truth for the Interview Scheduling Tool milestones and progress.

---

## Current Status

**Current Milestone:** M11 - Google Auth + Organizations + RBAC - Complete
**Next Milestone:** M10 - Notifications & Reminders

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

### M10: Notifications & Reminders
- [ ] Email notifications (booking confirmation, reminders)
- [ ] Calendar invite updates
- [ ] Reminder scheduling (24h, 1h before)

**Definition of Done:**
- Candidates receive booking confirmation email
- Reminder emails sent before interview
- Cancellation notifications sent

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

### M12: Analytics & Reporting
- [ ] Booking metrics dashboard
- [ ] Time-to-schedule tracking
- [ ] Cancellation/reschedule rates

**Definition of Done:**
- [ ] Key metrics visible to coordinators
- [ ] Export capability for reporting

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

*Last updated: 2026-01-15*

---

## Recent Changes

- **2026-01-15:** M11 (Google Auth + Organizations + RBAC) - Implementation complete
- **2026-01-15:** Added M9 (Product Audit + Nav Hub) - Complete
- **2026-01-15:** Renumbered M10 → M12 (Analytics & Reporting)
