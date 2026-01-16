# AUTH_GOOGLE_ORG_RBAC_V1

**Status:** Implementation Complete
**Created:** 2026-01-15
**Completed:** 2026-01-15
**Milestone:** M11 - Google Auth + Organizations + RBAC

---

## Overview

This document specifies the implementation plan for Google OAuth authentication, multi-organization support, and Role-Based Access Control (RBAC) for the Sched interview scheduling application.

**Goals:**
- Replace current dual-provider (Google + Microsoft) OAuth with Google-only authentication
- Add organization (team/company) support for multi-tenant usage
- Implement proper RBAC with superadmin, org admin, and member roles
- Protect all routes and APIs based on authentication and authorization

---

## 1. Current State Analysis

### 1.1 Authentication

**Current Implementation:** NextAuth.js with JWT sessions

| Aspect | Current State |
|--------|---------------|
| **Providers** | Google OAuth + Microsoft Azure AD |
| **Session** | JWT with 30-day max age |
| **User Storage** | `users` table in Supabase |
| **Roles Defined** | `coordinator`, `interviewer`, `admin` (in DB schema) |
| **Roles Used** | Only `coordinator` assigned (default) |
| **Session Type Extension** | `role: 'coordinator' \| 'interviewer'` |

**authOptions.ts Configuration:**
- Google scopes: `openid email profile https://www.googleapis.com/auth/calendar`
- Stores `access_token`, `refresh_token` for calendar integration
- Creates user in DB on first sign-in
- Stores calendar connection with OAuth tokens

### 1.2 Database

**Current Tables (relevant to auth):**

```sql
-- users (from 002_user_accounts.sql)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  image TEXT,
  role TEXT NOT NULL DEFAULT 'coordinator' CHECK (role IN ('coordinator', 'interviewer', 'admin')),
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- calendar_connections (linked to users)
CREATE TABLE calendar_connections (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  provider TEXT CHECK (provider IN ('google', 'microsoft')),
  access_token TEXT,
  refresh_token TEXT,
  ...
);
```

**Missing:**
- Organizations table
- Org membership table
- Active organization selection
- Superadmin designation

### 1.3 Route Protection

**Current Patterns:**

| Protection Type | Method | Coverage |
|-----------------|--------|----------|
| Client-side | `useSession()` + redirect | Protected pages |
| Server-side API | `getServerSession()` check | Most API routes |
| Token-based | Public token hash lookup | `/api/public/*` |
| Middleware | **None** | N/A |

**Issues:**
- No centralized middleware for route protection
- `/api/ops/*` endpoints have no authentication
- Role checks not enforced (registry defines roles but doesn't enforce)
- No organization scoping for data access

---

## 2. Data Model

### 2.1 Users Table (Update)

```sql
-- Update existing users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'admin'));
-- 'user' = regular member (replaces coordinator/interviewer)
-- 'admin' = can manage organizations they own

-- Add superadmin flag (managed via env var, not DB)
-- SUPERADMIN_EMAILS env var controls superadmin access
```

### 2.2 Organizations Table (New)

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,  -- URL-friendly identifier

  -- Settings
  default_timezone TEXT NOT NULL DEFAULT 'America/New_York',
  default_duration_minutes INTEGER NOT NULL DEFAULT 60,

  -- Limits
  max_members INTEGER DEFAULT 50,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_organizations_slug ON organizations(slug);

-- Trigger for updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.3 Organization Members Table (New)

```sql
CREATE TYPE org_member_role AS ENUM ('admin', 'member');

CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role org_member_role NOT NULL DEFAULT 'member',

  -- Invited by (null if founding member)
  invited_by UUID REFERENCES users(id),
  invited_at TIMESTAMP WITH TIME ZONE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  -- One membership per org per user
  UNIQUE(organization_id, user_id)
);

-- Indexes
CREATE INDEX idx_org_members_org_id ON org_members(organization_id);
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_role ON org_members(role);

-- Trigger
CREATE TRIGGER update_org_members_updated_at
  BEFORE UPDATE ON org_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 2.4 Sessions (NextAuth Standard)

NextAuth.js handles sessions via JWT. No additional session table needed.

**Extended JWT Token:**
```typescript
interface JWT {
  userId: string;
  email: string;
  name?: string;
  image?: string;
  role: 'user' | 'admin';           // User's global role
  isSuperadmin: boolean;            // Derived from SUPERADMIN_EMAILS
  activeOrgId?: string;             // Currently selected organization
  activeOrgRole?: 'admin' | 'member'; // Role in active org
  accessToken?: string;             // Google OAuth token
  refreshToken?: string;
  accessTokenExpires?: number;
}
```

### 2.5 Active Organization Selection Strategy

**Selection Logic (in order):**

1. **URL Parameter:** If `?org=<slug>` is present, use that org (if user is member)
2. **Session Storage:** `sessionStorage.getItem('sched_active_org')`
3. **Cookie:** `sched_active_org` cookie (30-day expiry)
4. **Default:**
   - If user has 1 org: auto-select
   - If user has 0 orgs: redirect to onboarding
   - If user has >1 orgs: show org picker

**Storage Pattern:**
```typescript
// On org selection
sessionStorage.setItem('sched_active_org', orgId);
document.cookie = `sched_active_org=${orgId}; max-age=${30*24*60*60}; path=/`;

// On logout
sessionStorage.removeItem('sched_active_org');
document.cookie = 'sched_active_org=; max-age=0; path=/';
```

### 2.6 Entity Scoping

Update existing tables to scope by organization:

```sql
-- Add organization_id to scheduling_requests
ALTER TABLE scheduling_requests
  ADD COLUMN organization_id UUID REFERENCES organizations(id);

CREATE INDEX idx_scheduling_requests_org_id ON scheduling_requests(organization_id);

-- Add organization_id to availability_requests
ALTER TABLE availability_requests
  ADD COLUMN organization_id UUID REFERENCES organizations(id);

CREATE INDEX idx_availability_requests_org_id ON availability_requests(organization_id);

-- Add organization_id to bookings (optional - inherited from request)
-- Bookings inherit organization from their parent request
```

---

## 3. Google OAuth Flow

### 3.1 Login Flow

```
1. User clicks "Sign in with Google" on /signin
2. NextAuth redirects to Google OAuth
3. User authenticates with Google
4. Google redirects to /api/auth/callback/google with code
5. NextAuth exchanges code for tokens
6. signIn callback:
   a. Check if user exists by email
   b. If new user: create in users table
   c. Store/update calendar_connection with tokens
7. jwt callback:
   a. Populate userId, email, name, image
   b. Check SUPERADMIN_EMAILS env var for superadmin status
   c. Query user's organizations
   d. Set activeOrgId based on selection strategy
   e. Set activeOrgRole from org_members
8. session callback:
   a. Map JWT claims to session
   b. Include isSuperadmin, activeOrgId, activeOrgRole
9. Redirect to:
   - /onboarding if no organizations
   - /hub if has active organization
```

### 3.2 Callback Handler Updates

```typescript
// authOptions.ts updates

callbacks: {
  async signIn({ user, account }) {
    if (!user.email) return false;

    // Upsert user
    const dbUser = await upsertUser({
      email: user.email,
      name: user.name,
      image: user.image,
    });

    // Store calendar connection
    if (account?.access_token) {
      await upsertCalendarConnection({
        userId: dbUser.id,
        provider: 'google',
        accessToken: account.access_token,
        refreshToken: account.refresh_token,
        expiresAt: account.expires_at,
      });
    }

    return true;
  },

  async jwt({ token, user, account, trigger }) {
    if (user) {
      token.userId = user.id;
      token.email = user.email;
      token.isSuperadmin = isSuperadmin(user.email);
    }

    // Refresh org info on session update
    if (trigger === 'update' || user) {
      const orgs = await getUserOrganizations(token.userId);
      token.organizations = orgs;
      token.activeOrgId = await resolveActiveOrg(token.userId, orgs);
      token.activeOrgRole = orgs.find(o => o.id === token.activeOrgId)?.role;
    }

    return token;
  },

  async session({ session, token }) {
    session.user.id = token.userId;
    session.user.isSuperadmin = token.isSuperadmin;
    session.user.activeOrgId = token.activeOrgId;
    session.user.activeOrgRole = token.activeOrgRole;
    session.user.organizations = token.organizations;
    return session;
  },
}
```

### 3.3 Logout Flow

```
1. User clicks "Sign out"
2. Clear active org from sessionStorage/cookie
3. Call signOut() from next-auth/react
4. NextAuth clears session cookie
5. Redirect to /signin
```

---

## 4. Onboarding UX

### 4.1 Flow Diagram

```
Sign In
    │
    ▼
┌─────────────────────────────────┐
│  Query user's organizations     │
└─────────────────────────────────┘
    │
    ├── 0 orgs ──► /onboarding
    │                  │
    │                  ├── "Create Organization"
    │                  │        ▼
    │                  │   Enter name, slug
    │                  │        ▼
    │                  │   Create org + membership (admin)
    │                  │        ▼
    │                  │   Redirect to /hub
    │                  │
    │                  └── "Join Existing" (if invited)
    │                           ▼
    │                      Enter invite code
    │                           ▼
    │                      Create membership
    │                           ▼
    │                      Redirect to /hub
    │
    ├── 1 org ──► Auto-select ──► /hub
    │
    └── >1 orgs ──► /org-picker
                        │
                        ▼
                   Select organization
                        │
                        ▼
                   Store selection
                        │
                        ▼
                   Redirect to /hub
```

### 4.2 Onboarding Page (`/onboarding`)

```typescript
interface OnboardingState {
  step: 'choose' | 'create' | 'join';
}

// UI Components:
// 1. Welcome message with user's name/email
// 2. Two cards:
//    - "Create an Organization" - for new teams
//    - "Join an Organization" - requires invite code
// 3. Create form: name, slug (auto-generated from name)
// 4. Join form: invite code input
```

### 4.3 Org Picker (`/org-picker`)

```typescript
// Simple list of organizations user belongs to
// Each card shows:
//   - Org name
//   - User's role (Admin/Member)
//   - "Select" button
//
// Clicking select:
//   - Stores selection
//   - Redirects to /hub
```

### 4.4 Org Switcher (Header Component)

```typescript
// Dropdown in header showing:
//   - Current org name + role badge
//   - List of other orgs
//   - "Create New Organization" option (if allowed)
//   - "Settings" link to org settings
```

---

## 5. RBAC Rules

### 5.1 Role Hierarchy

```
superadmin (env: SUPERADMIN_EMAILS)
    │
    ├── Can access all organizations
    ├── Can view all data across orgs
    ├── Can access /ops dashboard
    ├── Can run dev-only actions (seed, reconciliation)
    ├── Can manage any organization
    │
    ▼
org:admin (org_members.role = 'admin')
    │
    ├── Can manage organization settings
    ├── Can invite/remove members
    ├── Can promote members to admin
    ├── Can delete organization
    ├── All member permissions
    │
    ▼
org:member (org_members.role = 'member')
    │
    ├── Can create scheduling requests
    ├── Can view org's requests
    ├── Can manage own requests
    ├── Can view bookings
    ├── Cannot manage organization
    │
    ▼
public (no auth)
    │
    └── Can access public token routes (/book/[token], /availability/[token])
```

### 5.2 Superadmin Configuration

```bash
# .env.local
SUPERADMIN_EMAILS=aidanbiggins@gmail.com,admin@company.com

# Can be comma-separated list
# Checked on each JWT refresh
# No database storage (security: revoke by removing from env)
```

```typescript
// lib/auth/superadmin.ts
export function isSuperadmin(email: string | null | undefined): boolean {
  if (!email) return false;
  const superadmins = (process.env.SUPERADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  return superadmins.includes(email.toLowerCase());
}
```

### 5.3 Permission Matrix

| Action | Public | Member | Org Admin | Superadmin |
|--------|--------|--------|-----------|------------|
| View public booking page | ✓ | ✓ | ✓ | ✓ |
| Book via public token | ✓ | ✓ | ✓ | ✓ |
| Sign in | - | ✓ | ✓ | ✓ |
| View hub | - | ✓ | ✓ | ✓ |
| Create scheduling request | - | ✓ | ✓ | ✓ |
| View org's requests | - | ✓ | ✓ | ✓ |
| Manage own requests | - | ✓ | ✓ | ✓ |
| Manage any request in org | - | - | ✓ | ✓ |
| Invite org members | - | - | ✓ | ✓ |
| Remove org members | - | - | ✓ | ✓ |
| Edit org settings | - | - | ✓ | ✓ |
| Delete organization | - | - | ✓ | ✓ |
| View /ops dashboard | - | - | - | ✓ |
| Run seed/reconciliation | - | - | - | ✓ |
| View all orgs' data | - | - | - | ✓ |
| Impersonate org | - | - | - | ✓ |

### 5.4 Feature Registry Updates

```typescript
// Update UserRole type
export type UserRole = 'public' | 'member' | 'org_admin' | 'superadmin';

// Update feature definitions
{
  id: 'ops-dashboard',
  name: 'Operations Dashboard',
  route: '/ops',
  roles: ['superadmin'],  // Only superadmin
  // ...
},
{
  id: 'coordinator-dashboard',
  name: 'Scheduling Dashboard',
  route: '/coordinator',
  roles: ['member', 'org_admin', 'superadmin'],
  // ...
}
```

---

## 6. Route Protection Map

### 6.1 Public Routes (No Auth Required)

| Route | Purpose | Protection |
|-------|---------|------------|
| `/` | Landing page | None |
| `/signin` | Sign in page | None (redirect if authed) |
| `/book/demo` | Demo booking UI | None |
| `/book/[token]` | Candidate booking | Token validation |
| `/availability/[token]` | Candidate availability | Token validation |
| `/api/public/*` | Public APIs | Token validation |
| `/api/auth/*` | Auth endpoints | NextAuth handling |

### 6.2 Authenticated Routes (Require Session)

| Route | Purpose | Min Role | Org Required |
|-------|---------|----------|--------------|
| `/hub` | Navigation hub | member | Yes |
| `/coordinator` | Scheduling dashboard | member | Yes |
| `/coordinator/[id]` | Request detail | member | Yes |
| `/coordinator/availability` | Availability dashboard | member | Yes |
| `/coordinator/availability/[id]` | Availability detail | member | Yes |
| `/settings` | User settings | member | No |
| `/onboarding` | New user setup | member | No |
| `/org-picker` | Org selection | member | No |

### 6.3 Admin Routes (Require Org Admin)

| Route | Purpose | Min Role |
|-------|---------|----------|
| `/settings/organization` | Org settings | org_admin |
| `/settings/members` | Member management | org_admin |

### 6.4 Superadmin Routes

| Route | Purpose | Min Role |
|-------|---------|----------|
| `/ops` | Operations dashboard | superadmin |
| `/api/ops/*` | Operations APIs | superadmin |

---

## 7. API Protection Requirements

### 7.1 Authentication Middleware

Create `/src/middleware.ts`:

```typescript
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Superadmin-only routes
    if (path.startsWith('/ops') || path.startsWith('/api/ops')) {
      if (!token?.isSuperadmin) {
        return NextResponse.redirect(new URL('/hub', req.url));
      }
    }

    // Org-required routes
    if (path.startsWith('/coordinator') || path.startsWith('/hub')) {
      if (!token?.activeOrgId) {
        return NextResponse.redirect(new URL('/onboarding', req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const path = req.nextUrl.pathname;

        // Public routes
        if (path === '/' ||
            path === '/signin' ||
            path.startsWith('/book/') ||
            path.startsWith('/availability/') ||
            path.startsWith('/api/public/') ||
            path.startsWith('/api/auth/')) {
          return true;
        }

        // All other routes require auth
        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
```

### 7.2 API Route Pattern

```typescript
// Standard authenticated API route pattern
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';
import { requireOrgMember, requireOrgAdmin, requireSuperadmin } from '@/lib/auth/guards';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  // Authentication check
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Organization check
  if (!session.user.activeOrgId) {
    return NextResponse.json({ error: 'No organization selected' }, { status: 403 });
  }

  // Role check (for admin routes)
  // if (!isOrgAdmin(session)) {
  //   return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  // }

  // Scope data to organization
  const requests = await getSchedulingRequestsForOrg(session.user.activeOrgId);

  return NextResponse.json({ requests });
}
```

### 7.3 Auth Guard Helpers

```typescript
// lib/auth/guards.ts

export function requireAuth(session: Session | null): session is Session {
  return session?.user?.id != null;
}

export function requireOrgMember(session: Session | null): boolean {
  return requireAuth(session) && !!session.user.activeOrgId;
}

export function requireOrgAdmin(session: Session | null): boolean {
  return requireOrgMember(session) &&
         (session.user.activeOrgRole === 'admin' || session.user.isSuperadmin);
}

export function requireSuperadmin(session: Session | null): boolean {
  return requireAuth(session) && session.user.isSuperadmin === true;
}
```

---

## 8. Seed and Fixtures Plan

### 8.1 Development Seed Data

```typescript
// scripts/seed-auth-data.ts

const seedData = {
  organizations: [
    { id: 'org-demo', name: 'Demo Company', slug: 'demo-company' },
    { id: 'org-test', name: 'Test Organization', slug: 'test-org' },
  ],

  users: [
    {
      id: 'user-admin',
      email: 'admin@demo.com',
      name: 'Demo Admin',
      role: 'admin',
    },
    {
      id: 'user-member',
      email: 'member@demo.com',
      name: 'Demo Member',
      role: 'user',
    },
  ],

  org_members: [
    { organization_id: 'org-demo', user_id: 'user-admin', role: 'admin' },
    { organization_id: 'org-demo', user_id: 'user-member', role: 'member' },
    { organization_id: 'org-test', user_id: 'user-admin', role: 'admin' },
  ],
};
```

### 8.2 Test Fixtures

```typescript
// __tests__/fixtures/auth.ts

export function createTestUser(overrides = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    ...overrides,
  };
}

export function createTestOrg(overrides = {}) {
  return {
    id: 'test-org-id',
    name: 'Test Organization',
    slug: 'test-org',
    ...overrides,
  };
}

export function createTestSession(overrides = {}) {
  return {
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      isSuperadmin: false,
      activeOrgId: 'test-org-id',
      activeOrgRole: 'member',
      organizations: [{ id: 'test-org-id', name: 'Test Org', role: 'member' }],
      ...overrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}
```

### 8.3 Safety Measures

- Seed script only runs in development (`NODE_ENV !== 'production'`)
- Uses deterministic IDs prefixed with `seed-` for easy cleanup
- Seed data uses fake emails (`@demo.com`, `@test.com`)
- Never seeds real email addresses
- Provides `npm run db:clean-seed` to remove seed data

---

## 9. Test Plan

### 9.1 Unit Tests

| Area | Tests | File |
|------|-------|------|
| Superadmin check | Email matching, case insensitivity | `__tests__/lib/auth/superadmin.test.ts` |
| Auth guards | requireAuth, requireOrgMember, etc. | `__tests__/lib/auth/guards.test.ts` |
| Active org resolution | URL param, cookie, default logic | `__tests__/lib/auth/activeOrg.test.ts` |
| Org slug validation | Format, uniqueness | `__tests__/lib/auth/orgSlug.test.ts` |

### 9.2 Integration Tests

| Area | Tests | File |
|------|-------|------|
| Sign-in flow | New user creation, existing user | `__tests__/api/auth/signin.test.ts` |
| Org creation | Create, validate, membership | `__tests__/api/organizations.test.ts` |
| Member management | Invite, accept, remove | `__tests__/api/members.test.ts` |
| Data scoping | Requests scoped to org | `__tests__/api/scheduling-requests-org.test.ts` |

### 9.3 UI Tests (Manual Verification)

| Flow | Steps | Expected |
|------|-------|----------|
| New user sign-in | Sign in → Onboarding → Create org → Hub | User lands on hub with new org |
| Existing user sign-in | Sign in → Hub | User lands on hub with active org |
| Multi-org user | Sign in → Org picker → Select → Hub | Correct org selected |
| Org switch | Hub → Dropdown → Select other org | Data refreshes for new org |
| Member invite | Settings → Members → Invite → Copy link | Invite link works |
| Accept invite | Invite link → Sign in → Join org | User added to org |

### 9.4 Security Tests

| Test | Method | Expected |
|------|--------|----------|
| Unauthenticated API access | Call `/api/scheduling-requests` without session | 401 Unauthorized |
| Wrong org data access | Try to fetch request from other org | 404 Not Found |
| Non-admin org settings | Member tries `/api/org/settings` | 403 Forbidden |
| Non-superadmin ops | Regular user tries `/api/ops/health` | 403 Forbidden |

---

## 10. Implementation Plan

### Step 1: Database Schema Migration (003_organizations.sql)

**Files to create:**
- `src/lib/supabase/migrations/003_organizations.sql`

**Changes:**
- Create `organizations` table
- Create `org_members` table
- Add `organization_id` to `scheduling_requests`
- Add `organization_id` to `availability_requests`
- Create indexes

**Verification:**
- [ ] Migration runs successfully in Supabase
- [ ] Tables created with correct constraints
- [ ] Indexes created

---

### Step 2: Update User Model and Auth Types

**Files to modify:**
- `src/lib/auth/authOptions.ts`
- `src/types/next-auth.d.ts` (create if not exists)

**Changes:**
- Remove Microsoft provider (Google only)
- Update session/JWT types with org info
- Add superadmin check
- Update callbacks for org resolution

**Verification:**
- [ ] TypeScript compiles
- [ ] Sign-in still works
- [ ] Session contains new fields

---

### Step 3: Create Auth Guard Utilities

**Files to create:**
- `src/lib/auth/superadmin.ts`
- `src/lib/auth/guards.ts`
- `src/lib/auth/activeOrg.ts`

**Verification:**
- [ ] Unit tests pass
- [ ] Guards correctly check permissions

---

### Step 4: Create Organization Database Operations

**Files to create/modify:**
- `src/lib/db/organizations.ts` (new)
- `src/lib/db/org-members.ts` (new)
- `src/lib/db/index.ts` (add exports)
- `src/lib/db/memory-adapter.ts` (add org support)
- `src/lib/db/supabase-adapter.ts` (add org support)

**Verification:**
- [ ] CRUD operations work
- [ ] Memory adapter supports orgs
- [ ] Supabase adapter supports orgs

---

### Step 5: Create Middleware

**Files to create:**
- `src/middleware.ts`

**Changes:**
- Route protection based on auth status
- Superadmin-only route protection
- Org-required route redirects

**Verification:**
- [ ] Unauthenticated users redirected to /signin
- [ ] Users without org redirected to /onboarding
- [ ] Superadmin routes protected

---

### Step 6: Create Onboarding Flow

**Files to create:**
- `src/app/onboarding/page.tsx`
- `src/app/org-picker/page.tsx`
- `src/components/OrgSwitcher.tsx`

**Verification:**
- [ ] New users see onboarding
- [ ] Multi-org users see picker
- [ ] Org switcher works in header

---

### Step 7: Create Organization APIs

**Files to create:**
- `src/app/api/organizations/route.ts` (list, create)
- `src/app/api/organizations/[id]/route.ts` (get, update, delete)
- `src/app/api/organizations/[id]/members/route.ts` (list, invite)
- `src/app/api/organizations/[id]/members/[memberId]/route.ts` (update, remove)

**Verification:**
- [ ] CRUD APIs work
- [ ] Permission checks enforced
- [ ] Invite flow works

---

### Step 8: Update Existing APIs for Org Scoping

**Files to modify:**
- `src/app/api/scheduling-requests/route.ts`
- `src/app/api/availability-requests/route.ts`
- All coordinator APIs

**Changes:**
- Add org check to all authenticated routes
- Scope queries by `organization_id`
- Include `organization_id` on create

**Verification:**
- [ ] Requests scoped to active org
- [ ] Cannot access other org's data
- [ ] Create includes org_id

---

### Step 9: Update Feature Registry and Hub

**Files to modify:**
- `src/lib/featureRegistry.ts`
- `src/app/hub/page.tsx`

**Changes:**
- Update role types
- Show org-appropriate features
- Add org context to hub

**Verification:**
- [ ] Hub shows correct features for role
- [ ] Org info displayed
- [ ] Org switcher works

---

### Step 10: Create Organization Settings UI

**Files to create:**
- `src/app/settings/organization/page.tsx`
- `src/app/settings/members/page.tsx`

**Verification:**
- [ ] Org admins can access
- [ ] Members cannot access
- [ ] Settings save correctly

---

### Step 11: Update Ops Dashboard for Superadmin

**Files to modify:**
- `src/app/ops/page.tsx`
- All `/api/ops/*` routes

**Changes:**
- Add superadmin check
- Show cross-org data for superadmin

**Verification:**
- [ ] Only superadmin can access
- [ ] Superadmin sees all orgs' data

---

### Step 12: Testing and Documentation

**Files to create:**
- `__tests__/lib/auth/*.test.ts`
- `__tests__/api/organizations.test.ts`
- `__tests__/api/members.test.ts`

**Changes:**
- Add comprehensive tests
- Update SCHEDULER_ROADMAP.md
- Update README with auth info

**Verification:**
- [ ] All new tests pass
- [ ] Existing tests pass
- [ ] `npm run build` passes
- [ ] Manual smoke test passes

---

## Definition of Done

- [ ] Google OAuth sign-in works (Microsoft removed)
- [ ] Users can create organizations
- [ ] Users can invite members to organizations
- [ ] Data is scoped by organization
- [ ] RBAC enforced:
  - [ ] Superadmin access via env var
  - [ ] Org admin can manage org
  - [ ] Members can use scheduling features
- [ ] Middleware protects all routes
- [ ] APIs check auth + org + role
- [ ] Onboarding flow works (0/1/>1 orgs)
- [ ] Org switcher in header
- [ ] Tests pass (unit, integration)
- [ ] `npm run build` passes
- [ ] Documentation updated

---

## Appendix A: Environment Variables

```bash
# Required
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate-random-secret>

# Google OAuth
GOOGLE_CLIENT_ID=<google-client-id>
GOOGLE_CLIENT_SECRET=<google-client-secret>

# Superadmin (comma-separated emails)
SUPERADMIN_EMAILS=aidanbiggins@gmail.com

# Database
SUPABASE_URL=<supabase-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
DB_MODE=supabase  # or 'memory' for development
```

---

## Appendix B: Migration Rollback

If migration needs rollback:

```sql
-- Rollback 003_organizations.sql

-- Remove org columns from existing tables
ALTER TABLE scheduling_requests DROP COLUMN IF EXISTS organization_id;
ALTER TABLE availability_requests DROP COLUMN IF EXISTS organization_id;

-- Drop org tables
DROP TABLE IF EXISTS org_members;
DROP TABLE IF EXISTS organizations;
DROP TYPE IF EXISTS org_member_role;
```

---

*Last updated: 2026-01-15*
