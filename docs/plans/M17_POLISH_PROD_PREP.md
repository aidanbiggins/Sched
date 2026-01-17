# M17: Polish & Production Prep

Plan document for the final milestone before production release.

---

## 1. Current State Inventory

### Completed Milestones

| Milestone | Status | Key Features |
|-----------|--------|--------------|
| M0: Foundation | ✅ Complete | Next.js, TypeScript, Tailwind, core types |
| M1: Slot Generation & Token Security | ✅ Complete | Deterministic slots, secure tokens |
| M2: Graph API Integration & Booking | ✅ Complete | Graph client, calendar events, iCIMS writeback |
| M3: Candidate Self-Service UI | ✅ Complete | `/book/[token]` booking page |
| M4: Coordinator Dashboard (Foundation) | ✅ Complete | Request listing, detail view |
| M5: Coordinator UX (Production-Ready) | ✅ Complete | Filters, search, bulk actions |
| M6: Webhooks, Reconciliation & Operator Health | ✅ Complete | Secure webhooks, reconciliation, `/ops` dashboard |
| M7: Microsoft Graph Real Authentication | ✅ Code Complete | Real Graph client, token management |
| M7.1: Graph Production Readiness | ✅ Complete | Metrics, smoke tests, validator UI |
| M7.5: Standalone Mode | ✅ Complete | Personal calendar, Google OAuth |
| M8: Production Database | ✅ Complete | Supabase PostgreSQL |
| M8.5: Real iCIMS Integration | ✅ Complete | iCIMS API client, retry logic |
| M9: Product Audit + Navigation Hub | ✅ Complete | `/hub` page, feature registry |
| M10: Notifications & Reminders | ✅ Complete | 7 notification types, email service |
| M11: Google Auth + Organizations + RBAC | ✅ Complete | Google OAuth, orgs, roles |
| M12: Analytics & Reporting | ✅ Complete | Metrics dashboard, export |
| M13: Production Job Runner | ✅ Complete | Vercel Cron, distributed locks |
| M14: Enterprise Hardening | ✅ Complete | RLS, audit logging, route protection |
| M15: Scheduling Intelligence | ✅ Complete | Capacity planning, load balancing |
| M16: Communications & Portal Hardening | ✅ Complete | Escalation, coordinator notifications, portal UX |

### Items Still Marked Incomplete or Future

| Item | Milestone | Priority for M17 |
|------|-----------|------------------|
| Email confirmation to candidate | M3 | ✅ Actually done in M10 |
| Scope validation checklist for Application Access Policy | M7 | Required (Azure) |
| End-to-end live testing with real Graph API | M7 | Required (Azure) |
| Operator runbook Graph troubleshooting section | M7.1 | Required |
| Microsoft Calendar client (delegated OAuth flow) | M7.5 | Deferred |
| Interviewer invitation and calendar connection flow | M7.5 | Deferred |
| Mixed availability (calendars + manual windows) | M7.5 | Deferred |
| iCIMS health tab in /ops dashboard | M8.5 | Nice-to-have |
| Organization settings UI | M11 | Required |
| Member management UI | M11 | ✅ Already exists at `/settings/team` |
| Coordinator UI shows "why this suggestion" | M15 | Deferred |
| Ops dashboard Capacity tab | M15 | Nice-to-have |
| Manual E2E testing complete | M16 | Required |

### CI/Build Commands

| Command | Purpose | Used In |
|---------|---------|---------|
| `npm run build` | Next.js production build | CI gate |
| `npm run lint` | ESLint static analysis | CI gate |
| `npm test` | Jest unit/integration tests | CI gate |
| `npm run test:ci` | Non-interactive test run | CI |
| `npm run graph:smoke` | Graph API validation | Pre-deploy |
| `npm run seed` | Test data seeding | Development |

### Existing Ops Endpoints

| Endpoint | Purpose | UI Surface |
|----------|---------|------------|
| `/api/ops/health` | System health summary | `/ops` Overview tab |
| `/api/ops/status` | Environment modes | `/hub` status panel |
| `/api/ops/graph` | Graph API metrics | `/ops` header link |
| `/api/ops/graph-validator` | Graph validation tests | `/ops/graph-validator` |
| `/api/ops/icims` | iCIMS API health | No UI (endpoint only) |
| `/api/ops/notifications` | Notification queue | `/ops` Notifications tab |
| `/api/ops/webhooks` | Webhook events | `/ops` Webhooks tab |
| `/api/ops/reconciliation` | Reconciliation jobs | `/ops` Reconciliation tab |
| `/api/ops/attention` | Attention requests | `/ops` Attention tab |
| `/api/ops/jobs` | Cron job status | `/ops` Jobs tab |
| `/api/ops/audit` | Audit log viewer | `/ops/audit` |
| `/api/ops/seed` | Seed test data | Quick action in `/ops` |

### Existing Org Admin Surfaces

| Route | Purpose | RBAC |
|-------|---------|------|
| `/settings` | User settings hub | Authenticated |
| `/settings/team` | Team member management | Org admin |
| `/settings/interviewers` | Interviewer capacity | Coordinator+ |
| `/settings/notifications` | Notification preferences | Authenticated |
| `/onboarding` | Org creation/join | Authenticated (no org) |
| `/org-picker` | Multi-org selection | Authenticated (multi-org) |
| `/api/organizations` | List/create orgs | Authenticated |
| `/api/organizations/[orgId]/members` | Member management | Org admin |
| `/api/organizations/[orgId]/invites` | Invite management | Org admin |

### Configuration Modes (Dev Bypasses)

| Env Var | Values | Effect |
|---------|--------|--------|
| `DB_MODE` | `memory` / `supabase` | Database backend |
| `APP_MODE` | `standalone` / `enterprise` | ATS integration |
| `EMAIL_ENABLED` | `true` / `false` | Email delivery |
| `GRAPH_MODE` | `mock` / `real` | Graph API backend |
| `ICIMS_MODE` | `mock` / `real` | iCIMS API backend |

---

## 2. Release Gates

### Required Commands (Must All Pass)

```bash
# Build gate - zero errors allowed
npm run build
# Expected: "✓ Compiled successfully"

# Lint gate - zero errors (warnings allowed)
npm run lint
# Expected: No "Error:" lines

# Test gate - all tests pass
npm run test:ci
# Expected: "Tests: X passed, 0 failed"

# Type check (included in build, but can run standalone)
npx tsc --noEmit
# Expected: No output (success)
```

### Warning Policy

| Category | Policy |
|----------|--------|
| TypeScript warnings | Fix all `any` types in production code; test files may use `any` |
| ESLint warnings | Address style warnings; complexity warnings are informational |
| Build warnings | Document any remaining deprecation warnings |
| Test warnings | Fix all console warnings during tests |

### Dev-Only Bypasses to Remove/Gate

| Bypass | Location | Action |
|--------|----------|--------|
| `DB_MODE=memory` | Default in `.env` | Require `supabase` for production |
| Mock Graph client | `GraphCalendarClient.ts` factory | Require real client when `GRAPH_MODE=real` |
| Mock iCIMS client | `IcimsClient.ts` factory | Require real client when `ICIMS_MODE=real` |
| `console.log` debugging | Various files | Remove or gate behind `DEBUG` env var |
| Seed endpoint | `/api/ops/seed` | Gate behind `NODE_ENV !== 'production'` |

### Environment Validation

Create `src/lib/config/validateEnv.ts` to verify required env vars:

```
# Required for production
NEXTAUTH_URL
NEXTAUTH_SECRET
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
DB_MODE=supabase
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# Required if GRAPH_MODE=real
AZURE_AD_CLIENT_ID
AZURE_AD_CLIENT_SECRET
AZURE_AD_TENANT_ID
GRAPH_ORGANIZER_EMAIL

# Required if ICIMS_MODE=real
ICIMS_CUSTOMER_ID
ICIMS_API_KEY

# Required for email
SMTP_HOST (or EMAIL_ENABLED=false)
SMTP_PORT
SMTP_USER
SMTP_PASS
EMAIL_FROM
```

---

## 3. Live Graph Tenant Validation Plan

### Prerequisites

1. Azure AD application registered with:
   - `Calendars.ReadBasic.All` (application permission)
   - `Calendars.ReadWrite` (application permission)
   - Admin consent granted
2. Application Access Policy configured to limit scope to organizer mailbox
3. Test mailbox designated as `GRAPH_ORGANIZER_EMAIL`

### Validation Steps

| Step | Command/Action | Expected Result |
|------|----------------|-----------------|
| 1. Config validation | `npm run graph:smoke` (config test) | ✓ All required env vars present |
| 2. Token acquisition | `npm run graph:smoke` (token test) | ✓ Access token retrieved successfully |
| 3. Organizer access | `npm run graph:smoke` (organizer test) | ✓ Can read organizer calendar |
| 4. Scoping enforcement | `npm run graph:smoke` (scoping test) | ✓ Random user access DENIED |
| 5. FreeBusy query | `npm run graph:smoke` (freeBusy test) | ✓ Availability data returned |
| 6. Event lifecycle | `npm run graph:smoke` (event test) | ✓ Create, read, update, delete works |

### Scoping Proof Steps

1. **Positive test**: Query `GRAPH_ORGANIZER_EMAIL` calendar → Should succeed
2. **Negative test**: Query random Microsoft user → Should return 403 Forbidden
3. **Document**: Screenshot both results in `/docs/evidence/`

### Evidence Storage

```
docs/evidence/
├── graph-validation-{date}.md      # Test run summary
├── scoping-positive-{date}.png     # Organizer access screenshot
├── scoping-negative-{date}.png     # Denied access screenshot
└── smoke-test-output-{date}.log    # Full smoke test output
```

### UI Validation

1. Navigate to `/ops/graph-validator`
2. Run all validation tests
3. Verify all tests show ✓ pass
4. Screenshot full page for evidence

---

## 4. Ops Completeness Plan

### New Tabs/Sections to Add

| Tab | Content | Priority |
|-----|---------|----------|
| iCIMS Health | API metrics, sync queue status | P1 |
| Capacity | Interviewer utilization, saturation alerts | P2 |

### Endpoints with Missing UI

| Endpoint | Current State | Action |
|----------|---------------|--------|
| `/api/ops/icims` | Endpoint exists | Add tab in `/ops` |
| `/api/capacity/recommendations` | Endpoint exists | Show in Capacity tab |
| `/api/capacity/load` | Endpoint exists | Show in Capacity tab |

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Notification failures (24h) | > 5 | > 20 |
| Webhook failures (24h) | > 5 | > 20 |
| Reconciliation failures | > 3 | > 10 |
| Requests needing attention | > 5 | > 20 |
| iCIMS sync failures | > 3 | > 10 |
| Interviewer over capacity | 1+ at 100% | 3+ at 100% |
| Job queue depth | > 100 | > 500 |

### Basic Runbook Outline

Create `docs/OPERATOR_RUNBOOK.md`:

1. **System Health Check**
   - Visit `/ops` → Overview tab
   - Check status banner (healthy/degraded/critical)
   - Review active alerts panel

2. **Notification Failures**
   - Filter by status: FAILED
   - Check error message
   - Retry eligible failures
   - If SMTP issues: verify credentials

3. **Webhook Failures**
   - Check if signature verification failed
   - Verify HMAC secret matches iCIMS config
   - Check for payload format changes

4. **Reconciliation Issues**
   - Review detection reason
   - For calendar_event_missing: verify Graph permissions
   - For icims_note_missing: verify iCIMS credentials

5. **Graph API Issues**
   - Run `/ops/graph-validator`
   - Check token expiry in `/api/ops/graph`
   - Verify Azure AD app consent

6. **Capacity Alerts**
   - Review interviewer load in `/settings/interviewers`
   - Adjust weekly caps if needed
   - Consider load balancing recommendations

---

## 5. Org Admin Basics Plan

### Pages/Routes to Add

| Route | Purpose | Components Needed |
|-------|---------|-------------------|
| `/settings/organization` | Org name, slug editing | Form, save API call |
| `/settings/organization/danger` | Delete org, transfer ownership | Confirmation modal |

### API Endpoints Required

| Endpoint | Method | Purpose | RBAC |
|----------|--------|---------|------|
| `/api/organizations/[orgId]` | GET | Get org details | Member |
| `/api/organizations/[orgId]` | PATCH | Update org name/slug | Admin |
| `/api/organizations/[orgId]` | DELETE | Delete org | Admin + confirmation |
| `/api/organizations/[orgId]/transfer` | POST | Transfer ownership | Admin |

### RBAC Requirements

| Action | Required Role |
|--------|---------------|
| View org settings | Member |
| Edit org name/slug | Admin |
| Manage members | Admin |
| Delete organization | Admin (only admin with confirmation) |
| Transfer ownership | Admin |

### Implementation Notes

- Add `isOnlyAdmin` check before delete to prevent orphan orgs
- Transfer ownership requires target user to be existing member
- Org slug must be unique across all orgs (add unique constraint)

---

## 6. UX Hardening Plan

### Error Boundaries

| Component | Current State | Action |
|-----------|---------------|--------|
| Global error boundary | `ErrorBoundary.tsx` exists | Verify wraps app |
| Page-level boundaries | Not implemented | Add to key pages |
| API error handling | `ApiError` class exists | Standardize usage |

**Pages needing error boundaries:**
- `/coordinator` (data fetching)
- `/analytics` (chart rendering)
- `/settings/*` (form submissions)

### Mobile Responsiveness Checklist

| Page | Current State | Issues |
|------|---------------|--------|
| `/hub` | Responsive | None |
| `/coordinator` | Responsive | Table scroll on mobile |
| `/coordinator/[id]` | Responsive | Timeline may overflow |
| `/settings` | Responsive | None |
| `/settings/team` | Responsive | None |
| `/analytics` | Partial | Charts need responsive sizing |
| `/ops` | Partial | Table scroll needed |
| `/book/[token]` | Responsive | None |
| `/my-interviews/[token]` | Responsive | None |

### Accessibility Checklist

| Item | Status | Action |
|------|--------|--------|
| Color contrast | Partial | Audit zinc-400 on zinc-950 |
| Focus indicators | Present | Verify all interactive elements |
| ARIA labels | Partial | Add to icon-only buttons |
| Keyboard navigation | Partial | Test tab order on forms |
| Screen reader | Not tested | Manual testing needed |

### Calendar Component Audit

| Component | Location | Issues |
|-----------|----------|--------|
| FullCalendar | `/coordinator` availability view | Verify mobile touch |
| Date picker | Booking flow | Verify keyboard support |
| Time slot grid | `/book/[token]` | Verify screen reader labels |

---

## 7. Step-by-Step Implementation Plan

### Step 1: Release Gate Enforcement
- **Files**: `src/lib/config/validateEnv.ts` (new)
- **Tests**: `__tests__/lib/config/validateEnv.test.ts` (new)
- **Manual Check**: `npm run build` with missing env vars fails fast

### Step 2: Dev Bypass Gating
- **Files**: `src/app/api/ops/seed/route.ts`, various console.log removals
- **Tests**: Verify seed endpoint returns 403 in production mode
- **Manual Check**: Set `NODE_ENV=production`, confirm seed blocked

### Step 3: Graph Evidence Collection
- **Files**: `docs/evidence/` (new directory)
- **Tests**: None (manual validation)
- **Manual Check**: Run `npm run graph:smoke`, capture screenshots

### Step 4: iCIMS Health Tab
- **Files**: `src/app/ops/page.tsx` (modify)
- **Tests**: None (UI change)
- **Manual Check**: Verify iCIMS tab shows metrics

### Step 5: Operator Runbook
- **Files**: `docs/OPERATOR_RUNBOOK.md` (new)
- **Tests**: None (documentation)
- **Manual Check**: Follow runbook steps manually

### Step 6: Organization Settings Page
- **Files**: `src/app/settings/organization/page.tsx` (new)
- **Tests**: `__tests__/pages/settings-organization.test.tsx` (new)
- **Manual Check**: Edit org name, verify saved

### Step 7: Organization API Endpoints
- **Files**: `src/app/api/organizations/[orgId]/route.ts` (modify)
- **Tests**: `__tests__/api/organizations.test.ts` (extend)
- **Manual Check**: PATCH org name via API

### Step 8: Error Boundary Expansion
- **Files**: Key page components
- **Tests**: Error boundary render tests
- **Manual Check**: Trigger error in dev, verify boundary catches

### Step 9: Mobile Responsiveness Fixes
- **Files**: CSS/Tailwind adjustments
- **Tests**: None (visual testing)
- **Manual Check**: Test all pages at 375px width

### Step 10: Accessibility Audit
- **Files**: ARIA labels, focus styles
- **Tests**: None (manual testing)
- **Manual Check**: Tab through all forms, check contrast

### Step 11: Capacity Tab (Ops)
- **Files**: `src/app/ops/page.tsx` (modify)
- **Tests**: None (UI change)
- **Manual Check**: Verify capacity data displayed

### Step 12: E2E Manual Testing
- **Files**: `docs/E2E_TEST_PLAN.md` (new)
- **Tests**: None (manual protocol)
- **Manual Check**: Execute all E2E scenarios

### Step 13: Pre-Production Verification
- **Files**: None
- **Tests**: Full test suite
- **Manual Check**: Run all gates, verify all pass

### Step 14: Documentation Cleanup
- **Files**: `README.md`, `docs/plans/SCHEDULER_ROADMAP.md`
- **Tests**: None
- **Manual Check**: Verify docs accurate

---

## 8. Definition of Done Checklist

### Release Gates
- [ ] `npm run build` passes with zero errors
- [ ] `npm run lint` passes with zero errors
- [ ] `npm run test:ci` passes with zero failures
- [ ] `npx tsc --noEmit` passes

### Environment & Configuration
- [ ] Environment validation script created
- [ ] Production requires `DB_MODE=supabase`
- [ ] Seed endpoint blocked in production
- [ ] All console.log debugging removed or gated

### Graph API Validation
- [ ] `npm run graph:smoke` passes in real tenant
- [ ] Scoping proof documented with screenshots
- [ ] `/ops/graph-validator` all tests pass

### Ops Dashboard
- [ ] iCIMS Health tab added
- [ ] Capacity tab added (or recommendations shown)
- [ ] All alert thresholds defined
- [ ] Operator runbook complete

### Organization Admin
- [ ] `/settings/organization` page exists
- [ ] Org name/slug editing works
- [ ] PATCH `/api/organizations/[orgId]` works
- [ ] RBAC enforced (admin only for edits)

### UX Hardening
- [ ] Error boundaries wrap key pages
- [ ] All pages responsive at 375px
- [ ] WCAG contrast requirements met
- [ ] Keyboard navigation works on all forms
- [ ] ARIA labels on icon-only buttons

### Documentation
- [ ] Operator runbook complete
- [ ] E2E test plan documented
- [ ] Roadmap updated with M17 complete
- [ ] README accurate for setup

### Testing
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E manual testing complete
- [ ] Pre-existing test failures documented

---

## Timeline Summary

| Phase | Steps | Focus |
|-------|-------|-------|
| Week 1 | 1-5 | Release gates, Graph validation, runbook |
| Week 2 | 6-9 | Org admin, error boundaries, mobile |
| Week 3 | 10-14 | Accessibility, E2E testing, documentation |

---

*Created: 2026-01-17*
