# Operator Runbook (M6+)

This document provides operational guidance for managing the Interview Scheduling system.

## System Overview

The scheduling system integrates with:
- **Microsoft Graph** - Calendar event creation and management
- **iCIMS** - Application notes and status updates
- **Webhooks** - Inbound events from iCIMS
- **Google OAuth** - User authentication

## Authentication & Authorization

### Roles

| Role | Description | Access |
|------|-------------|--------|
| **Superadmin** | System administrator (env-configured) | All features, /ops dashboard |
| **Org Admin** | Organization administrator | Org settings, member management, all org features |
| **Member** | Regular organization member | Scheduling features, own requests |
| **Public** | Unauthenticated users | Public booking pages only |

### Superadmin Configuration

Superadmin access is controlled via environment variable:

```bash
# .env
SUPERADMIN_EMAILS=aidanbiggins@gmail.com,admin@company.com
```

- Comma-separated list of email addresses
- Case-insensitive matching
- No database storage (revoke by removing from env)
- Requires server restart to take effect

### Organization Access

Users must belong to at least one organization to access scheduling features:
- New users are prompted to create or join an organization
- Users with multiple organizations can switch between them via the org switcher
- All scheduling data is scoped to the active organization

### Worker Processes

| Process | Command | Description |
|---------|---------|-------------|
| Sync Worker | `npm run scheduler:sync` | Processes pending iCIMS note sync jobs |
| Webhook Processor | `npm run scheduler:webhook:process` | Processes pending webhook events |
| Reconciliation Worker | `npm run scheduler:reconcile` | Detects drift and repairs issues |

All workers support `--once` flag for single execution (useful for cron/testing).

## Health Dashboard

Access the operator health dashboard at `/ops` in your browser.

### Status Indicators

- **Healthy** - All systems operating normally
- **Degraded** - One or more issues detected (failures or items needing attention)
- **Critical** - Multiple critical failures (not implemented yet)

### Key Metrics

| Metric | Threshold | Action |
|--------|-----------|--------|
| Webhook failures (24h) | > 0 | Check signature verification, review failed events |
| Reconciliation failures | > 0 | Review job details, check external API status |
| Needs attention count | > 0 | Review flagged requests, take manual action |

## Webhook Events

### Event Types

| Type | Description | Processing |
|------|-------------|------------|
| `application.status_changed` | Application moved to new status | Future: auto-create scheduling requests |
| `candidate.updated` | Candidate profile updated | Future: update local candidate data |
| `requisition.updated` | Job requisition changed | Future: update linked requests |

### Troubleshooting Webhooks

**Webhook shows as "not verified":**
1. Check the `ICIMS_WEBHOOK_SECRET` environment variable
2. Verify the signature format matches iCIMS documentation
3. The event is still stored but won't be processed until signature is valid

**Webhook stuck in "received" status:**
1. Check if the webhook processor is running
2. Review processor logs for errors
3. Manually run `npm run scheduler:webhook:process:once` to debug

**Webhook repeatedly failing:**
1. Check the `lastError` field in the webhook event
2. After max attempts (3), the event is marked as failed
3. Manual intervention may be required

## Reconciliation Jobs

### Job Types

| Type | Detection Rule | Repair Action |
|------|----------------|---------------|
| `icims_note_missing` | Booking confirmed > 24h without iCIMS activity | Create iCIMS note |
| `calendar_event_missing` | Booking confirmed > 24h without calendar event | Create calendar event |
| `state_mismatch` | Request status inconsistent with booking state | Update request status |

### Reconciliation Workflow

1. **Detection** - Runs every minute (configurable) scanning for drift
2. **Job Creation** - Creates pending job for each detected issue
3. **Processing** - Attempts repair with exponential backoff
4. **Escalation** - After max attempts, sets `needsAttention` flag

### Troubleshooting Reconciliation

**Job keeps failing:**
1. Check the `lastError` field for specifics
2. Review external API availability (Graph, iCIMS)
3. Verify permissions and credentials

**False positive detections:**
1. Adjust `REPAIR_STALE_THRESHOLD_MS` (default 24h)
2. Check if detection rules are too aggressive
3. Review audit logs for context

## Requests Needing Attention

When automated repair fails, requests are flagged for operator attention.

### Review Process

1. Navigate to `/ops` → "Attention" tab
2. Click "View" to see full request details
3. Determine root cause from audit logs
4. Take manual action (reschedule, cancel, retry sync)
5. Click "Dismiss" to clear the flag

### Common Attention Reasons

| Reason | Action |
|--------|--------|
| "iCIMS sync failed after 3 attempts" | Verify iCIMS credentials, retry manually |
| "Calendar event creation failed" | Check Graph permissions, verify organizer email |
| "Reconciliation failed" | Review job details, check external APIs |

## API Endpoints

### Ops API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ops/health` | GET | System health summary |
| `/api/ops/webhooks` | GET | List webhook events (with filtering) |
| `/api/ops/reconciliation` | GET | List reconciliation jobs |
| `/api/ops/attention` | GET | List requests needing attention |
| `/api/ops/attention/[id]/dismiss` | POST | Dismiss attention flag |

### Query Parameters

Webhook filtering:
- `status` - Comma-separated: received, processing, processed, failed
- `provider` - Filter by provider (e.g., icims)

Reconciliation filtering:
- `status` - Comma-separated: pending, processing, completed, failed
- `jobType` - Filter by job type

## Environment Variables

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXTAUTH_URL` | (required) | Base URL of the application |
| `NEXTAUTH_SECRET` | (required) | Secret for JWT signing |
| `GOOGLE_CLIENT_ID` | (required) | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | (required) | Google OAuth client secret |
| `SUPERADMIN_EMAILS` | aidanbiggins@gmail.com | Comma-separated superadmin emails |

### Integration

| Variable | Default | Description |
|----------|---------|-------------|
| `ICIMS_WEBHOOK_SECRET` | test-webhook-secret | HMAC secret for webhook verification |
| `BATCH_SIZE` | 10 | Number of items per worker batch |
| `POLL_INTERVAL_MS` | varies | Polling interval for workers |

## Scheduled Tasks

Recommended cron schedule:

```bash
# Sync worker - every 5 minutes
*/5 * * * * npm run scheduler:sync:once

# Webhook processor - every minute
* * * * * npm run scheduler:webhook:process:once

# Reconciliation - every 10 minutes
*/10 * * * * npm run scheduler:reconcile:once
```

## Incident Response

### Webhook Backlog

If webhook events are accumulating:
1. Check processor logs for errors
2. Increase worker frequency temporarily
3. Consider running multiple processor instances

### iCIMS Integration Down

If iCIMS notes are failing:
1. Check iCIMS API status
2. Verify API credentials
3. Sync jobs will retry automatically
4. No data loss - jobs remain in queue

### Graph API Issues

If calendar events are failing:
1. Check Microsoft 365 service status
2. Verify Graph API permissions
3. Reschedule affected bookings if needed

## Monitoring Checklist

Daily:
- [ ] Review `/ops` health dashboard
- [ ] Check needs attention count
- [ ] Review failed webhook events

Weekly:
- [ ] Review reconciliation job patterns
- [ ] Check audit log for unusual activity
- [ ] Verify worker processes are running

## Contact

For escalation or questions about this system, contact the engineering team.
