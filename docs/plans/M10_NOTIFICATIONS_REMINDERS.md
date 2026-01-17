# M10: Notifications & Reminders

**Status:** Complete
**Created:** 2026-01-17
**Implementation:** 2026-01-16

---

## 1. Inventory of Existing Infrastructure

### Notification Jobs Table

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `tenantId` | UUID (nullable) | Multi-tenant support |
| `type` | NotificationType | One of 7 notification types |
| `entityType` | NotificationEntityType | `scheduling_request`, `booking`, or `availability_request` |
| `entityId` | UUID | FK to parent entity |
| `idempotencyKey` | string | Prevents duplicate sends |
| `toEmail` | string | Recipient email |
| `payloadJson` | JSON | Template data |
| `status` | NotificationStatus | `PENDING`, `SENDING`, `SENT`, `FAILED`, `CANCELED` |
| `attempts` | number | Current attempt count |
| `maxAttempts` | number | Default 5 |
| `runAfter` | timestamp | Scheduled send time |
| `lastError` | string (nullable) | Last failure reason |
| `sentAt` | timestamp (nullable) | Successful send time |
| `createdAt` | timestamp | Job creation time |
| `updatedAt` | timestamp | Last update time |

### Notification Attempts Table

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Primary key |
| `notificationJobId` | UUID | FK to notification job |
| `attemptNumber` | number | 1, 2, 3, etc. |
| `status` | `success` or `failure` | Attempt result |
| `error` | string (nullable) | Error message if failed |
| `providerMessageId` | string (nullable) | Email provider's message ID |
| `createdAt` | timestamp | Attempt time |

### notifyWorker Implementation

Located at `src/lib/workers/notifyWorker.ts`:

- **Batch processing:** Default 10 jobs per run
- **Max attempts:** 5
- **Backoff:** Exponential with base 4 minutes (4, 16, 64, 256, 1024 minutes)
- **Status transitions:** `PENDING` → `SENDING` → `SENT` or back to `PENDING` (retry) or `FAILED`
- **Implements:** `WorkerService` interface with `processBatch()` and `getQueueDepth()`

### Email Sending Mechanism

Located at `src/lib/notifications/EmailService.ts`:

**Dev Mode** (`EMAIL_MODE !== 'smtp'`):
- Logs email content to console
- Returns success with `dev-mode` message ID
- No external dependencies

**Production Mode** (`EMAIL_MODE === 'smtp'`):
- Uses HTTP API via `MAIL_API_URL`
- Authenticates with `MAIL_API_KEY`
- Configurable `SMTP_FROM` address
- Returns provider message ID on success

### Email Templates

Located at `src/lib/notifications/templates.ts`:

| Template | Notification Type | Description |
|----------|-------------------|-------------|
| `candidateAvailabilityRequestTemplate` | `candidate_availability_request` | Initial request for candidate to provide availability |
| `candidateSelfScheduleLinkTemplate` | `candidate_self_schedule_link` | Self-scheduling booking link |
| `bookingConfirmationTemplate` | `booking_confirmation` | Interview confirmed email |
| `rescheduleConfirmationTemplate` | `reschedule_confirmation` | Interview time changed |
| `cancelNoticeTemplate` | `cancel_notice` | Interview cancelled |
| `reminderTemplate` | `reminder_24h`, `reminder_2h` | Pre-interview reminders |

All templates are plain HTML with:
- CTA buttons with inline styles
- Unsubscribe link placeholders
- Responsive design
- Clear subject lines

### Coordinator Actions

Located at `src/lib/notifications/NotificationService.ts`:

**Resend Methods:**
- `enqueueResendSelfScheduleLink()` - Resend scheduling link
- `enqueueResendBookingConfirmation()` - Resend booking confirmation
- `enqueueResendAvailabilityRequest()` - Resend availability request

All resend methods use timestamp-based idempotency discriminators to allow intentional resends.

### Ops Views and Endpoints

**Notifications List:**
- `GET /api/ops/notifications` - List jobs with status/type filters and pagination
- Superadmin-only access
- Returns job counts by status

**Retry Endpoint:**
- `POST /api/ops/notifications/[id]/retry` - Reset failed job to PENDING
- Superadmin-only access
- Only works on FAILED status jobs

---

## 2. Decision Points (Resolved)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Template technology** | Plain HTML | Simple, no build step, works with any email provider |
| **Email provider abstraction** | HTTP API | Provider-agnostic, works with SendGrid, Mailgun, SES, etc. |
| **Dev mode** | Console logging | Zero dependencies for local development |
| **Idempotency strategy** | Composite key | `{type}:{entityType}:{entityId}:{discriminator}` prevents duplicates |
| **Retry mechanism** | Exponential backoff | 4^n minutes (4, 16, 64, 256, 1024 min) |
| **Max attempts** | 5 | Balances delivery with avoiding spam |
| **Reminder timing** | 24h and 2h | Standard pre-interview windows |

---

## 3. Required Notifications (All Implemented)

| Trigger Point | Notification Type | Recipient | Status |
|---------------|-------------------|-----------|--------|
| Availability request created | `candidate_availability_request` | Candidate | ✅ |
| Scheduling request created | `candidate_self_schedule_link` | Candidate | ✅ |
| Booking created | `booking_confirmation` | Candidate | ✅ |
| Booking rescheduled | `reschedule_confirmation` | Candidate | ✅ |
| Booking cancelled | `cancel_notice` | Candidate | ✅ |
| 24h before interview | `reminder_24h` | Candidate | ✅ |
| 2h before interview | `reminder_2h` | Candidate | ✅ |

---

## 4. Queue and Idempotency

### Idempotency Key Format

```
{type}:{entityType}:{entityId}:{discriminator}
```

**Examples:**
- `booking_confirmation:booking:abc123` - Initial booking confirmation
- `reminder_24h:booking:abc123:2026-01-18T09` - 24h reminder for 10am interview
- `candidate_self_schedule_link:scheduling_request:xyz789:resend-1705512000000` - Resend with timestamp

### Discriminators by Type

| Type | Discriminator | Behavior |
|------|---------------|----------|
| Initial sends | (none) | One per entity |
| Reminders | Time bucket (hour) | One per hour bucket |
| Reschedules | `reschedule-{timestamp}` | Each reschedule creates new notification |
| Resends | `resend-{epoch}` | Each resend creates new notification |

### Cancel Pending Reminders

When a booking is cancelled or rescheduled:
1. `cancelPendingReminders(bookingId)` cancels pending `reminder_24h` and `reminder_2h` jobs
2. New reminders are scheduled for the new time (if rescheduled)

---

## 5. Integration with Job Runner

### Cron Configuration

```json
{
  "crons": [
    {
      "path": "/api/cron/notify",
      "schedule": "* * * * *"
    }
  ]
}
```

The notification worker runs every minute via the M13 production job runner.

### Worker Integration

The `notifyWorkerService` (from `src/lib/workers/notifyWorker.ts`) implements:

```typescript
interface WorkerService {
  processBatch(options?: WorkerOptions): Promise<WorkerResult>;
  getQueueDepth(): Promise<number>;
}
```

Called by:
- `/api/cron/notify` - Production cron endpoint
- `POST /api/ops/jobs` - Manual trigger from ops dashboard

### Distributed Locking

Notification processing uses the M13 lock service to ensure at-most-one execution across instances.

---

## 6. Coordinator UX

### Resend Buttons

Coordinators can resend notifications from the request detail view:
- **Resend Link** - Re-sends the self-schedule or availability link
- **Resend Confirmation** - Re-sends booking confirmation

### Notification Status Visibility

Coordinators see notification status in the request timeline via audit logs.

---

## 7. Ops UX

### Jobs Tab

The ops dashboard Jobs tab shows:
- Notification worker health (last run, queue depth, failure rate)
- Manual trigger button

### Notifications Tab (if implemented)

Dedicated notifications view with:
- Filter by status (PENDING, SENDING, SENT, FAILED, CANCELED)
- Filter by type
- Pagination
- Retry button for FAILED jobs

---

## 8. Tests

### Unit Tests

- Template rendering tests
- Idempotency key generation tests
- NotificationService enqueue tests
- notifyWorker processing tests

### Integration Tests

- API endpoint tests for `/api/ops/notifications`
- API endpoint tests for `/api/ops/notifications/[id]/retry`

---

## 9. Build Plan (Completed)

All items implemented as of 2026-01-16:

1. ✅ Database schema (`004_notifications.sql` migration)
2. ✅ Notification types in `types/scheduling.ts`
3. ✅ EmailService with dev/prod modes
4. ✅ Email templates (all 6 templates)
5. ✅ NotificationService with idempotency
6. ✅ notifyWorker with retry logic
7. ✅ Database adapter functions (memory + supabase)
8. ✅ Ops notifications API endpoints
9. ✅ Coordinator resend endpoints
10. ✅ Integration with production job runner (M13)

---

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `src/types/scheduling.ts` | NotificationJob, NotificationAttempt types (lines 517-639) |
| `src/lib/notifications/EmailService.ts` | Email sending with dev/prod modes |
| `src/lib/notifications/templates.ts` | All 6 email templates |
| `src/lib/notifications/NotificationService.ts` | Enqueue logic with idempotency |
| `src/lib/workers/notifyWorker.ts` | Background processing worker |
| `src/lib/db/memory-adapter.ts` | In-memory notification functions |
| `src/lib/db/supabase-adapter.ts` | Supabase notification functions |

### API Routes

| File | Purpose |
|------|---------|
| `src/app/api/cron/notify/route.ts` | Cron endpoint for notification processing |
| `src/app/api/ops/notifications/route.ts` | List notification jobs |
| `src/app/api/ops/notifications/[id]/retry/route.ts` | Retry failed jobs |

### Database

| File | Purpose |
|------|---------|
| `src/lib/supabase/migrations/004_notifications.sql` | Notification tables |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EMAIL_MODE` | No | Set to `smtp` for production, defaults to console logging |
| `MAIL_API_URL` | Prod | Email provider HTTP API endpoint |
| `MAIL_API_KEY` | Prod | Email provider API key |
| `SMTP_FROM` | Prod | From address for emails |

---

## Verification Checklist

- [x] `npm run build` passes
- [x] `npm test` passes (notification tests)
- [x] Dev mode: emails logged to console
- [x] Booking creates confirmation notification job
- [x] Reminders scheduled correctly (24h, 2h)
- [x] Idempotency prevents duplicates
- [x] Failed jobs can be retried from ops
- [x] Cancelled bookings cancel pending reminders
