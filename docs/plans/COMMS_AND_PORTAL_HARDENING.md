# M16: Communications & Portal Hardening - Implementation Plan

## Overview

Harden email communications, candidate portal UX, and coordinator visibility into notification history. This milestone improves reliability, adds escalation workflows, and gives coordinators full visibility into all candidate communications.

---

## 1. Email Template Audit

### Current State (6 Templates)

| Template | Purpose | Status |
|----------|---------|--------|
| `candidateAvailabilityRequestTemplate` | Request candidate availability | ✅ Good |
| `candidateSelfScheduleLinkTemplate` | Send booking link to candidate | ✅ Good |
| `bookingConfirmationTemplate` | Confirm interview booked | ✅ Good |
| `rescheduleConfirmationTemplate` | Notify of time change | ✅ Good |
| `cancelNoticeTemplate` | Notify of cancellation | ✅ Good |
| `reminderTemplate` | 24h/2h before interview | ✅ Good |

### Template Strengths
- All templates have HTML and plain text versions
- Consistent styling via `wrapHtml()` helper
- Include unsubscribe links and support email footer
- Use `ctaButton()` for consistent call-to-action styling
- `formatLocalTime()` for timezone-aware display

### Required Template Additions

| Template | Purpose | Recipient | Priority |
|----------|---------|-----------|----------|
| `coordinatorBookingNotificationTemplate` | Alert coordinator when candidate books | Coordinator | High |
| `coordinatorCancelNotificationTemplate` | Alert coordinator when candidate cancels | Coordinator | High |
| `escalationNoResponseTemplate` | Escalate when candidate doesn't respond | Coordinator | High |
| `interviewerNotificationTemplate` | Notify interviewer of scheduled interview | Interviewer | Medium |
| `interviewerReminderTemplate` | Reminder for interviewers | Interviewer | Medium |
| `escalationExpiredTemplate` | Notify coordinator of expired request | Coordinator | Medium |

### Template Improvements

1. **Add calendar file (.ics) attachments** to booking/reschedule confirmations
2. **Add "Add to Calendar" links** (Google Calendar, Outlook Web)
3. **Include interview type and position** in subject lines for clarity
4. **Add coordinator contact** in candidate-facing emails (not just generic support)

---

## 2. Portal UX Spec

### 2.1 Candidate Availability Portal (`/availability/[token]`)

**Current State:**
- Calendar-based availability input using ProfessionalCalendar
- Input → Review → Submitted flow
- Shows requirements validation (min blocks, min minutes)
- Confirmation shows "coordinator will review"

**Improvements:**
- [ ] Add progress indicator showing where candidate is in the process
- [ ] Show interview type and expected duration prominently
- [ ] Add "Need help?" expandable FAQ section
- [ ] Improve error messaging for validation failures
- [ ] Add "Save Draft" functionality for complex availability entry
- [ ] Mobile-responsive calendar improvements

### 2.2 Candidate Booking Portal (`/book/[token]`)

**Current State:**
- 3-step wizard: select → confirm → confirmed
- Timezone detection and selection
- Grouped slots by date
- Shows meeting link on confirmation
- "Need to reschedule? Contact your recruiter" message

**Improvements:**
- [ ] Add step indicator (1 of 3, 2 of 3, etc.)
- [ ] Show interviewer names (if disclosed policy allows)
- [ ] Add interview type and position name to header
- [ ] Improve "no slots available" state with next steps
- [ ] Add "Download .ics" button on confirmation
- [ ] Add "Add to Google Calendar" / "Add to Outlook" buttons
- [ ] Show coordinator contact info (not just generic)
- [ ] Mobile-responsive slot selection improvements

### 2.3 New: Candidate Dashboard (`/my-interviews/[token]`)

**Purpose:** Allow candidates to view all their scheduled interviews from one place.

**Features:**
- List of all interviews (past and upcoming)
- Status indicators (scheduled, completed, cancelled)
- Quick actions: reschedule request, cancel, download calendar
- Interview details with meeting link (if scheduled)
- Timezone selection persisted across views

**Access:** Token-based (no login required), scoped to candidate email.

---

## 3. No-Response Escalation Rules

### Escalation Configuration

```typescript
interface EscalationConfig {
  // When to send first reminder
  initialReminderHours: number; // default: 48

  // When to send second reminder
  secondReminderHours: number; // default: 96 (4 days)

  // When to escalate to coordinator
  escalateToCoordinatorHours: number; // default: 120 (5 days)

  // When to auto-expire request
  autoExpireHours: number; // default: 168 (7 days)

  // Enable/disable each step
  enableReminders: boolean;
  enableEscalation: boolean;
  enableAutoExpire: boolean;
}
```

### Escalation Timeline (Default)

| Time | Action | Notification |
|------|--------|--------------|
| T+0h | Request sent | `candidate_availability_request` or `candidate_self_schedule_link` |
| T+48h | No response | `reminder` (gentle nudge) |
| T+96h | Still no response | `reminder` (urgent) |
| T+120h | Escalate | `escalation_no_response` → Coordinator |
| T+168h | Auto-expire | `escalation_expired` → Coordinator, status → `expired` |

### New Notification Types

```sql
-- Add to notification_type enum
ALTER TYPE notification_type ADD VALUE 'escalation_no_response';
ALTER TYPE notification_type ADD VALUE 'escalation_expired';
ALTER TYPE notification_type ADD VALUE 'coordinator_booking';
ALTER TYPE notification_type ADD VALUE 'coordinator_cancel';
ALTER TYPE notification_type ADD VALUE 'interviewer_notification';
ALTER TYPE notification_type ADD VALUE 'interviewer_reminder';
```

### Escalation Worker

New cron job `/api/cron/escalation` running every hour to:
1. Find requests with `status = 'pending'` past reminder thresholds
2. Check if reminder already sent (idempotency via notification_jobs)
3. Enqueue appropriate notification
4. Update request metadata with escalation timestamps

---

## 4. Message History Spec for Coordinator

### 4.1 Notification History Panel

**Location:** Coordinator request detail page (`/coordinator/[id]`)

**UI Component:** Collapsible "Communication History" section

```
+----------------------------------------------------------+
| Communication History                              [v]    |
+----------------------------------------------------------+
| Jan 15, 2:30pm  | Booking Link Sent      | ✓ Delivered   |
| Jan 16, 10:00am | Reminder (48h)         | ✓ Delivered   |
| Jan 17, 2:00pm  | Booking Confirmation   | ✓ Delivered   |
| Jan 19, 10:00am | Reminder (24h)         | ✓ Delivered   |
| Jan 19, 6:00pm  | Reminder (2h)          | ✓ Delivered   |
+----------------------------------------------------------+
| [Resend Booking Link] [Send Custom Message]              |
+----------------------------------------------------------+
```

**Data Displayed:**
- Notification type (human-readable label)
- Timestamp (sent_at or created_at)
- Status (pending, sent, failed with error)
- Recipient email
- Attempt count (if multiple attempts)
- Provider message ID (for debugging)

### 4.2 Resend Functionality

**Current State:**
- Resend endpoint exists (`src/lib/notifications/NotificationService.ts`)
- No visible "Resend" button in coordinator UI

**Improvements:**
- [ ] Add "Resend" button for each notification type
- [ ] Confirmation dialog before resend
- [ ] Show "Resent at [time]" indicator
- [ ] Rate limit resends (max 3 per notification type per day)
- [ ] Audit log entry for manual resends

### 4.3 Coordinator Notification Preferences

New settings page section for coordinators to configure:
- Receive notification when candidate books (default: on)
- Receive notification when candidate cancels (default: on)
- Receive escalation alerts (default: on)
- Email digest frequency (immediate, daily, weekly)

---

## 5. Data Model Changes

### 5.1 New Table: `escalation_config`

```sql
CREATE TABLE escalation_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  initial_reminder_hours INTEGER NOT NULL DEFAULT 48,
  second_reminder_hours INTEGER NOT NULL DEFAULT 96,
  escalate_to_coordinator_hours INTEGER NOT NULL DEFAULT 120,
  auto_expire_hours INTEGER NOT NULL DEFAULT 168,

  enable_reminders BOOLEAN NOT NULL DEFAULT true,
  enable_escalation BOOLEAN NOT NULL DEFAULT true,
  enable_auto_expire BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_escalation_config_org ON escalation_config(organization_id);
```

### 5.2 New Table: `coordinator_notification_preferences`

```sql
CREATE TABLE coordinator_notification_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  notify_on_booking BOOLEAN NOT NULL DEFAULT true,
  notify_on_cancel BOOLEAN NOT NULL DEFAULT true,
  notify_on_escalation BOOLEAN NOT NULL DEFAULT true,
  digest_frequency TEXT NOT NULL DEFAULT 'immediate' CHECK (digest_frequency IN ('immediate', 'daily', 'weekly')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, organization_id)
);
```

### 5.3 Extend `scheduling_requests` Table

```sql
ALTER TABLE scheduling_requests ADD COLUMN IF NOT EXISTS
  first_reminder_sent_at TIMESTAMPTZ,
  second_reminder_sent_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  escalation_count INTEGER NOT NULL DEFAULT 0;
```

### 5.4 Extend `notification_type` Enum

Add 6 new notification types (see Section 3).

---

## 6. Test Plan

### 6.1 Unit Tests

| Test File | Coverage |
|-----------|----------|
| `__tests__/lib/notifications/templates.test.ts` | New template rendering (6 new templates) |
| `__tests__/lib/notifications/escalation.test.ts` | Escalation logic, timing, idempotency |
| `__tests__/lib/notifications/coordinator-prefs.test.ts` | Preference CRUD, digest logic |
| `__tests__/components/MessageHistory.test.tsx` | Message history panel rendering |

### 6.2 Integration Tests

| Test | Scenario |
|------|----------|
| Escalation flow | Request → 48h → 96h → 120h → 168h escalation |
| Coordinator notification | Booking triggers coordinator email |
| Resend flow | Coordinator resends link, idempotency check |
| Preference respect | Disabled notifications not sent |

### 6.3 E2E Tests (Manual)

1. Create request, wait 2 minutes (with test config), verify reminder sent
2. Coordinator receives booking notification
3. View message history in coordinator dashboard
4. Resend booking link from history panel
5. Candidate uses `/my-interviews/[token]` to view interviews

### 6.4 Test Fixtures

Add test data for:
- Requests at various escalation stages
- Notification jobs with different statuses
- Coordinator preferences (all combinations)

---

## 7. Implementation Steps

### Step 1: Database Migration
- Create `007_comms_portal_hardening.sql`
- Add `escalation_config` table
- Add `coordinator_notification_preferences` table
- Extend `scheduling_requests` with escalation columns
- Extend `notification_type` enum with 6 new types

### Step 2: New Email Templates
- Create `coordinatorBookingNotificationTemplate`
- Create `coordinatorCancelNotificationTemplate`
- Create `escalationNoResponseTemplate`
- Create `escalationExpiredTemplate`
- Create `interviewerNotificationTemplate`
- Create `interviewerReminderTemplate`

### Step 3: Template Enhancements
- Add .ics attachment generation
- Add "Add to Calendar" links (Google, Outlook)
- Include coordinator contact in candidate emails
- Add interview type to subject lines

### Step 4: Escalation Service
- Create `src/lib/escalation/EscalationService.ts`
- Implement escalation timing logic
- Integrate with NotificationService for sends
- Add idempotency for escalation state

### Step 5: Escalation Cron Job
- Create `/api/cron/escalation/route.ts`
- Add to `vercel.json` (hourly schedule)
- Implement distributed locking (reuse existing pattern)

### Step 6: Message History UI
- Create `src/components/coordinator/MessageHistory.tsx`
- Add to coordinator request detail page
- Implement notification history API endpoint

### Step 7: Resend UX
- Add resend buttons to MessageHistory component
- Create resend confirmation dialog
- Implement rate limiting for resends
- Add audit logging for manual resends

### Step 8: Coordinator Preferences
- Create `src/app/settings/notifications/page.tsx`
- Create preferences API endpoints
- Wire up preference checks in NotificationService

### Step 9: Candidate Dashboard
- Create `/my-interviews/[token]` page
- Create candidate interviews API endpoint
- Implement interview listing with status
- Add calendar download buttons

### Step 10: Portal UX Improvements
- Add step indicators to booking flow
- Improve mobile responsiveness
- Add download .ics button to confirmation
- Add "Add to Calendar" buttons

### Step 11: Tests & Documentation
- Write unit tests for new templates
- Write unit tests for escalation logic
- Write integration tests for full flows
- Update API documentation

### Step 12: Verification & Rollout
- Run full test suite
- Manual E2E testing
- Build verification
- Update roadmap

---

## 8. Files to Create

| File | Purpose |
|------|---------|
| `src/lib/supabase/migrations/007_comms_portal_hardening.sql` | Database migration |
| `src/lib/escalation/EscalationService.ts` | Escalation logic |
| `src/lib/escalation/types.ts` | Escalation types |
| `src/lib/notifications/icsGenerator.ts` | .ics file generation |
| `src/app/api/cron/escalation/route.ts` | Escalation cron job |
| `src/app/api/notifications/history/route.ts` | Notification history API |
| `src/app/api/coordinator/preferences/route.ts` | Coordinator prefs API |
| `src/app/settings/notifications/page.tsx` | Notification preferences page |
| `src/app/my-interviews/[token]/page.tsx` | Candidate dashboard |
| `src/components/coordinator/MessageHistory.tsx` | Message history panel |
| `src/components/coordinator/ResendDialog.tsx` | Resend confirmation dialog |
| `__tests__/lib/notifications/templates.test.ts` | Template tests |
| `__tests__/lib/escalation/EscalationService.test.ts` | Escalation tests |

---

## 9. Files to Modify

| File | Changes |
|------|---------|
| `src/lib/notifications/templates.ts` | Add 6 new templates, .ics generation |
| `src/lib/notifications/NotificationService.ts` | Add coordinator/interviewer enqueue functions |
| `src/lib/db/memory-adapter.ts` | Add escalation config and preferences CRUD |
| `src/lib/db/supabase-adapter.ts` | Add escalation config and preferences CRUD |
| `src/lib/db/index.ts` | Export new functions |
| `src/app/coordinator/[id]/page.tsx` | Add MessageHistory component |
| `src/app/book/[token]/page.tsx` | Add step indicator, calendar buttons |
| `src/app/availability/[token]/page.tsx` | Add step indicator, UX improvements |
| `vercel.json` | Add escalation cron schedule |
| `src/types/scheduling.ts` | Add escalation fields |

---

## Definition of Done

- [ ] Database migration applied successfully
- [ ] 6 new email templates created and tested
- [ ] Existing templates enhanced with calendar attachments
- [ ] Escalation service functional with correct timing
- [ ] Escalation cron job running hourly
- [ ] Message history visible in coordinator dashboard
- [ ] Resend buttons functional with rate limiting
- [ ] Coordinator notification preferences working
- [ ] Candidate dashboard accessible via token
- [ ] Portal UX improvements applied (step indicators, calendar buttons)
- [ ] All unit tests passing (new + existing)
- [ ] Integration tests passing
- [ ] `npm run build` passes
- [ ] `npm test` passes
- [ ] Manual E2E testing complete
- [ ] Roadmap updated

---

*Plan created: 2026-01-17*
