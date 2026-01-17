# Enterprise Hardening & Security Audit

**Status:** Planned
**Target Milestone:** M14
**Created:** 2026-01-17

---

## 1. Route Protection Inventory

### Page Routes

| Route | Auth Required | Org Required | Role Required | Current Status |
|-------|--------------|--------------|---------------|----------------|
| `/` | No | - | - | ✅ Public |
| `/signin` | No | - | - | ✅ Public |
| `/book/demo` | No | - | - | ✅ Public |
| `/demo` | No | - | - | ✅ Public |
| `/book/[token]` | No | - | - | ✅ Public (token-based) |
| `/availability/[token]` | No | - | - | ✅ Public (token-based) |
| `/join/[inviteCode]` | Yes | No | - | ✅ Authenticated |
| `/onboarding` | Yes | No | - | ✅ Authenticated |
| `/onboarding/wizard` | Yes | No | - | ✅ Authenticated |
| `/org-picker` | Yes | No | - | ✅ Authenticated |
| `/hub` | Yes | Yes | member | ✅ Protected in middleware |
| `/coordinator` | Yes | Yes | member | ✅ Protected in middleware |
| `/coordinator/[id]` | Yes | Yes | member | ⚠️ Missing org-scope check |
| `/coordinator/availability` | Yes | Yes | member | ✅ Protected in middleware |
| `/coordinator/availability/[id]` | Yes | Yes | member | ⚠️ Missing org-scope check |
| `/settings` | Yes | Yes | member | ⚠️ Not in middleware matcher |
| `/settings/team` | Yes | Yes | admin | ⚠️ Not in middleware matcher |
| `/analytics` | Yes | Yes | member | ⚠️ Not in middleware matcher |
| `/ops` | Yes | No | superadmin | ✅ Protected in middleware |
| `/ops/graph-validator` | Yes | No | superadmin | ✅ Protected in middleware |

### API Routes

| Route | Auth Type | Current Protection | Gap |
|-------|-----------|-------------------|-----|
| `/api/auth/*` | - | NextAuth handles | ✅ |
| `/api/public/*` | Token | Token validation | ✅ |
| `/api/scheduling-requests` | Session | `session.user.id` check | ⚠️ No org filter |
| `/api/scheduling-requests/[id]/*` | Session | Session check | ⚠️ No ownership verification |
| `/api/availability-requests` | Session | `session.user.id` check | ⚠️ No org filter |
| `/api/availability-requests/[id]/*` | Session | Session check | ⚠️ No ownership verification |
| `/api/analytics` | Session | Session check | ⚠️ Scopes by userId, not org |
| `/api/analytics/export` | Session | Session check | ⚠️ Same as above |
| `/api/organizations/*` | Session | Session + membership check | ✅ |
| `/api/invites/*` | Session | Session check | ✅ |
| `/api/calendar/*` | Session | Session check | ⚠️ No org scope |
| `/api/ops/*` | Session | Superadmin check | ✅ |
| `/api/cron/*` | Token | CRON_SECRET or Vercel header | ✅ |
| `/api/webhooks/icims` | Signature | HMAC validation | ✅ |

### Identified Gaps

1. **Detail pages bypass org scope** - `/coordinator/[id]` doesn't verify the request belongs to user's org
2. **Settings/analytics not in middleware** - `/settings`, `/analytics` lack middleware protection
3. **API routes scope by userId not orgId** - Data isolation relies on `createdBy` not `organization_id`
4. **No resource ownership checks** - API operations on `[id]` don't verify caller owns the resource

---

## 2. RBAC Model

### Current Role Hierarchy

```
superadmin (SUPERADMIN_EMAILS env var)
    ├── Can access /ops/* and /api/ops/*
    ├── Bypasses org membership checks
    └── Can view all data across orgs

org:admin
    ├── Can manage org settings
    ├── Can invite/remove members
    └── Can view org-level data

org:member
    ├── Can create scheduling requests
    ├── Can view own requests
    └── Can use coordinator features
```

### Enforcement Points

| Location | Check | Implementation |
|----------|-------|----------------|
| Middleware | Auth + superadmin | `withAuth` + `token.isSuperadmin` |
| Middleware | Org required | `token.activeOrgId` check |
| API routes | Session check | `getServerSession(authOptions)` |
| API routes | Superadmin check | `isSuperadmin(session.user.email)` |
| API routes | Org role check | Not consistently implemented |

### Missing Enforcement

1. **Org admin check** - `requireOrgAdmin()` guard exists but rarely used
2. **Resource ownership** - No helper to verify resource belongs to caller's org
3. **Cross-org isolation** - API queries don't filter by org

---

## 3. Database Tenancy Model

### Tables Needing Tenant Isolation

| Table | Has `organization_id` | Needs RLS | Notes |
|-------|----------------------|-----------|-------|
| `scheduling_requests` | ✅ Yes (M11) | Yes | Primary entity |
| `bookings` | No (FK to request) | Yes (via request) | Join with request |
| `audit_logs` | No | Yes (via request) | Join with request |
| `availability_requests` | ✅ Yes (M11) | Yes | Primary entity |
| `candidate_availability_blocks` | No (FK to avail_request) | Yes (via request) | Join with request |
| `notification_jobs` | Has `tenant_id` | Yes | `tenant_id` = org? |
| `sync_jobs` | No | Yes (via entity) | Join with entity |
| `webhook_events` | Has `tenant_id` | No | System-level |
| `reconciliation_jobs` | Has `tenant_id` | No | System-level |
| `organizations` | N/A (is the tenant) | Yes | User access |
| `org_members` | FK to org | Yes | Membership check |
| `users` | N/A | Partial | Own record only |

### Current RLS Status

**RLS is NOT enabled.** From migration 001:
```sql
-- For now, RLS is not enabled. The service role key bypasses RLS anyway.
-- When M7.5 adds user authentication, we'll add RLS policies:
-- ALTER TABLE scheduling_requests ENABLE ROW LEVEL SECURITY;
```

### Required RLS Policies

```sql
-- scheduling_requests
CREATE POLICY "Users can view org requests" ON scheduling_requests
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert org requests" ON scheduling_requests
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own org requests" ON scheduling_requests
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM org_members WHERE user_id = auth.uid()
    )
  );

-- bookings (via request FK)
CREATE POLICY "Users can view bookings for org requests" ON bookings
  FOR SELECT USING (
    request_id IN (
      SELECT id FROM scheduling_requests WHERE organization_id IN (
        SELECT organization_id FROM org_members WHERE user_id = auth.uid()
      )
    )
  );

-- Similar policies needed for:
-- - availability_requests
-- - audit_logs
-- - notification_jobs
-- - org_members (users can see own memberships)
```

---

## 4. Audit Logging

### Currently Logged Actions

| Action | Logged | Actor Captured | Payload |
|--------|--------|----------------|---------|
| `link_created` | ✅ | coordinator/system | Request details |
| `slots_viewed` | ✅ | candidate | Token info |
| `booked` | ✅ | candidate | Slot selection |
| `rescheduled` | ✅ | coordinator | Old/new times |
| `cancelled` | ✅ | coordinator | Reason |
| `icims_note_*` | ✅ | system | Note content |
| `sync_job_*` | ✅ | system | Job status |
| `webhook_*` | ✅ | system | Event type |
| `reconciliation_*` | ✅ | system | Detection reason |
| `graph_call` | ✅ | system | API metrics |
| `needs_attention_set` | ✅ | system | Reason |

### Actions NOT Logged (Should Be)

| Action | When | Actor |
|--------|------|-------|
| `user_login` | OAuth sign-in | user |
| `user_logout` | Session end | user |
| `org_created` | New organization | admin |
| `org_updated` | Org settings change | admin |
| `member_invited` | Invite sent | admin |
| `member_joined` | Invite accepted | user |
| `member_removed` | Removed from org | admin |
| `role_changed` | Promote/demote | admin |
| `api_key_created` | Future API keys | admin |
| `settings_changed` | User/org settings | user/admin |
| `export_downloaded` | Analytics CSV | user |
| `superadmin_action` | Ops actions | superadmin |

### Admin Audit Viewer Specification

**Location:** `/ops/audit` (superadmin only)

**Features:**
- Filter by action type
- Filter by actor (user email)
- Filter by date range
- Filter by organization
- Search by entity ID (request, booking)
- Export to CSV

**UI:**
```
+----------------------------------------------------------+
| Audit Log Viewer                     [Filters] [Export]  |
+----------------------------------------------------------+
| Action     | Actor           | Entity    | Time          |
|------------|-----------------|-----------|---------------|
| booked     | jane@acme.com   | req-123   | 2 hours ago   |
| cancelled  | john@acme.com   | req-456   | 5 hours ago   |
| login      | jane@acme.com   | -         | 1 day ago     |
+----------------------------------------------------------+
```

---

## 5. Observability

### Required Alerts/Thresholds

| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| **Jobs** | | | |
| Job failure rate (24h) | > 50% | Critical | PagerDuty |
| Job queue depth | > 100 | Warning | Slack |
| Job not run in 5m | notify job | Warning | Slack |
| **Webhooks** | | | |
| Webhook failure rate | > 30% | Warning | Slack |
| Pending webhooks | > 50 | Warning | Slack |
| **Graph API** | | | |
| Graph 4xx rate | > 10% | Warning | Slack |
| Graph 5xx rate | > 5% | Critical | PagerDuty |
| Token refresh failures | any | Critical | PagerDuty |
| **iCIMS** | | | |
| iCIMS 4xx rate | > 10% | Warning | Slack |
| iCIMS 5xx rate | > 5% | Critical | PagerDuty |
| Sync job backlog | > 20 | Warning | Slack |
| **Notifications** | | | |
| Email send failures | > 10/hour | Warning | Slack |
| Notification queue | > 50 | Warning | Slack |

### Ops UI Additions

1. **Alerts Tab** - Show triggered alerts with history
2. **Metrics Dashboard** - Key health indicators with sparklines
3. **Health Status API** - `GET /api/ops/health/detailed` for monitoring integration

---

## 6. Test Plan

### Automated Route Protection Tests

```typescript
// __tests__/auth/route-protection.test.ts

describe('Route Protection', () => {
  describe('Public Routes', () => {
    it('allows unauthenticated access to /book/[token]');
    it('allows unauthenticated access to /api/public/*');
  });

  describe('Authenticated Routes', () => {
    it('redirects to /signin when not authenticated');
    it('returns 401 for API routes without session');
  });

  describe('Org-Required Routes', () => {
    it('redirects to /onboarding when no org');
    it('redirects to /org-picker when multiple orgs');
    it('allows access with active org');
  });

  describe('Superadmin Routes', () => {
    it('returns 403 for non-superadmin on /api/ops/*');
    it('redirects to /hub for non-superadmin on /ops');
    it('allows superadmin access');
  });

  describe('Resource Ownership', () => {
    it('returns 404 when accessing other org resources');
    it('allows access to own org resources');
  });
});
```

### RLS Policy Tests

```typescript
// __tests__/db/rls-policies.test.ts (Supabase only)

describe('RLS Policies', () => {
  describe('scheduling_requests', () => {
    it('user can only see own org requests');
    it('user cannot insert into other org');
    it('user cannot update other org request');
    it('superadmin can see all requests');
  });

  describe('Cross-org isolation', () => {
    it('org A user cannot see org B data');
    it('booking visible only to request org members');
  });
});
```

### Integration Test Coverage

| Area | Tests Needed |
|------|-------------|
| Auth flow | Login, logout, session refresh |
| Org creation | Create, join, switch |
| Permission checks | Member vs admin actions |
| Data isolation | Cross-org queries return empty |
| Cron auth | CRON_SECRET validation |
| Webhook auth | HMAC signature verification |

---

## 7. Build Plan

### Phase 1: Route Protection (M14.1)

1. **Add missing routes to middleware** - `/settings`, `/settings/team`, `/analytics`
2. **Create resource ownership guard** - `verifyResourceOwnership(session, resourceOrgId)`
3. **Add org scope to API routes** - Filter by `organization_id` in all queries
4. **Add ownership checks to detail APIs** - Verify request/booking belongs to caller's org

### Phase 2: Database Isolation (M14.2)

5. **Enable RLS on core tables** - `scheduling_requests`, `availability_requests`
6. **Create RLS policies** - SELECT, INSERT, UPDATE for org-scoped tables
7. **Add RLS policies for related tables** - `bookings`, `audit_logs` via FK joins
8. **Test RLS with service role bypass** - Ensure cron jobs still work

### Phase 3: Audit Enhancement (M14.3)

9. **Add missing audit events** - Login, org actions, settings changes
10. **Create audit viewer UI** - `/ops/audit` with filters
11. **Add export audit API** - CSV download capability

### Phase 4: Observability (M14.4)

12. **Create health check API** - `/api/ops/health/detailed`
13. **Add alert thresholds config** - Environment-based thresholds
14. **Create alerts tab in ops** - Show triggered alerts with history

---

## Definition of Done

- [ ] All routes protected according to inventory
- [ ] Resource ownership verified on all detail/action APIs
- [ ] RLS enabled with policies for org-scoped tables
- [ ] Missing audit events logged
- [ ] Audit viewer available to superadmins
- [ ] Health check API returns comprehensive status
- [ ] Route protection tests pass
- [ ] RLS policy tests pass (Supabase mode)
- [ ] `npm run build` passes
- [ ] `npm test` passes (excluding pre-existing failures)
- [ ] Security review completed
