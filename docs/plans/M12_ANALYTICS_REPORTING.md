# M12: Analytics & Reporting

**Status:** Complete
**Created:** 2026-01-17
**Implementation:** 2026-01-16

---

## 1. KPI Definitions

### Booking Metrics

| KPI | Formula | Source |
|-----|---------|--------|
| **Total Requests** | COUNT(scheduling_requests) WHERE created_at IN period | scheduling_requests |
| **Booking Rate** | (booked + rescheduled) / total_requests | scheduling_requests.status |
| **Status Distribution** | COUNT(*) GROUP BY status | scheduling_requests.status |
| **Interview Type Distribution** | COUNT(*) GROUP BY interview_type | scheduling_requests.interview_type |

### Time-to-Schedule Metrics

| KPI | Formula | Source |
|-----|---------|--------|
| **Avg Time-to-Schedule** | AVG(booking.booked_at - request.created_at) in hours | scheduling_requests + bookings |
| **Median Time-to-Schedule** | MEDIAN(booking.booked_at - request.created_at) | scheduling_requests + bookings |
| **Distribution Buckets** | COUNT in buckets: <24h, 1-3d, 3-7d, >7d | scheduling_requests + bookings |

### Cancellation Metrics

| KPI | Formula | Source |
|-----|---------|--------|
| **Cancellation Rate** | cancelled_bookings / total_bookings | bookings.status |
| **Reschedule Rate** | rescheduled_bookings / total_bookings | bookings.status |
| **Cancellation Reasons** | COUNT(*) GROUP BY cancellation_reason | bookings.cancellation_reason |

### Engagement Metrics

| KPI | Formula | Source |
|-----|---------|--------|
| **Links Created** | COUNT(audit_logs WHERE action = 'link_created') | audit_logs |
| **Slots Viewed** | COUNT(audit_logs WHERE action = 'slots_viewed') | audit_logs |
| **Click-Through Rate** | slots_viewed / links_created | audit_logs |

---

## 2. Source Tables and Events

### Existing Tables Used

| Table | Fields Used | Purpose |
|-------|-------------|---------|
| `scheduling_requests` | id, status, interview_type, created_at, created_by | Request counts, status distribution |
| `bookings` | id, request_id, status, booked_at, cancelled_at, cancellation_reason | Booking metrics, time-to-schedule |
| `audit_logs` | id, action, created_at | Engagement metrics |

### Events Tracked

| Event | Audit Action | Timestamp Field |
|-------|-------------|-----------------|
| Link Created | `link_created` | audit_logs.created_at |
| Slots Viewed | `slots_viewed` | audit_logs.created_at |
| Booked | `booked` | bookings.booked_at |
| Cancelled | `cancelled` | bookings.cancelled_at |
| Rescheduled | `rescheduled` | bookings.updated_at |

### Gaps Identified

**None** - The current schema provides all data needed for M12 KPIs.

---

## 3. Aggregation Strategy

### Real-Time Aggregation (Implemented)

M12 uses **real-time SQL/memory aggregation** rather than rollup tables:

```typescript
// AnalyticsService.ts
const [analyticsData, timeToScheduleData, auditActionCounts] = await Promise.all([
  getAnalyticsData(start, end, userId),
  getTimeToScheduleData(start, end, userId),
  getAuditActionCounts(start, end, userId),
]);
```

**Rationale:**
- Current data volumes are low (hundreds to thousands of requests)
- Real-time queries are fast (<100ms)
- Simpler implementation without rollup worker complexity
- No stale data issues

### Future Rollup Strategy (If Needed)

If data volumes grow significantly:

1. **Daily Rollup Table Schema:**
```sql
CREATE TABLE analytics_daily_rollup (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  user_id UUID,
  total_requests INT,
  booked_count INT,
  cancelled_count INT,
  pending_count INT,
  avg_time_to_schedule_hours DECIMAL,
  links_created INT,
  slots_viewed INT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, user_id)
);
```

2. **Aggregation Cadence:**
   - Daily rollup at 00:05 UTC
   - Last 24h computed real-time

3. **Late Events:**
   - Re-aggregate previous day if events arrive late
   - Use updated_at > created_at to detect late updates

---

## 4. API Endpoints

### GET /api/analytics

Returns analytics for a time period.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| period | `7d` \| `30d` \| `90d` \| `all` | `30d` | Time period |

**Response:**
```typescript
{
  period: AnalyticsPeriod;
  periodStart: string;  // ISO date
  periodEnd: string;    // ISO date

  bookingMetrics: {
    total: number;
    byStatus: { pending, booked, rescheduled, cancelled, expired };
    byInterviewType: { phone_screen, hm_screen, onsite, final };
    bookingRate: number;  // 0-1
  };

  timeToSchedule: {
    averageHours: number | null;
    medianHours: number | null;
    distribution: { under24h, '1to3d', '3to7d', over7d };
  };

  cancellationMetrics: {
    cancellationRate: number;
    rescheduleRate: number;
    cancellationReasons: Record<string, number>;
  };

  engagement: {
    linkClickRate: number;
    linksCreated: number;
    slotsViewed: number;
  };
}
```

### GET /api/analytics/export

Exports analytics as CSV file.

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| period | `7d` \| `30d` \| `90d` \| `all` | `30d` | Time period |

**Response:** CSV file download (`text/csv`)

**CSV Columns:**
- Metric
- Value
- Period
- Period Start
- Period End

---

## 5. UI Specification

### Dashboard Layout

```
+----------------------------------------------------------+
| Analytics                    [7d|30d|90d|All] [Export CSV]|
+----------------------------------------------------------+
| +-------------+ +-------------+ +-------------+ +---------+
| | Total       | | Booking     | | Avg Time to | | Cancel  |
| | Requests    | | Rate        | | Schedule    | | Rate    |
| |    156      | |   62.8%     | |   18.5h     | |  22.4%  |
| +-------------+ +-------------+ +-------------+ +---------+
+----------------------------------------------------------+
| Request Status                 | Interview Types          |
| [======= Booked 62.8% =======] | [=== Phone Screen 29%]   |
| [=== Cancelled 22.4% ====]     | [==== HM Screen 40% ==]  |
| [= Pending 7.7% =]             | [=== Onsite 24% ====]    |
+----------------------------------------------------------+
| Time-to-Schedule Distribution                             |
| <24h  |████████████████████████████| 65 (66%)            |
| 1-3d  |████████████                | 28 (29%)            |
| 3-7d  |██                          |  4 (4%)             |
| 7d+   |█                           |  1 (1%)             |
+----------------------------------------------------------+
| Link Engagement              | Cancellation Reasons       |
| Links Created: 156           | Schedule conflict: 12      |
| Slots Viewed: 98             | Position filled: 8         |
| CTR: 62.8%                   | Candidate withdrew: 5      |
+----------------------------------------------------------+
```

### Components

| Component | File | Purpose |
|-----------|------|---------|
| `MetricCard` | `src/components/analytics/MetricCard.tsx` | Summary stat with color accent |
| `HorizontalBar` | `src/components/analytics/HorizontalBar.tsx` | Bar chart for distributions |
| `DistributionChart` | `src/components/analytics/DistributionChart.tsx` | Time-to-schedule buckets |
| `PeriodSelector` | `src/components/analytics/PeriodSelector.tsx` | Period toggle (7d/30d/90d/all) |

### Theme

- Dark slate theme (slate-900, slate-800)
- Status colors: emerald (success), amber (pending), red (cancelled/error)
- Responsive grid layout

### States

| State | Display |
|-------|---------|
| Loading | Centered spinner |
| Error | Red alert box with error message |
| Empty | Illustration with "No data yet" message |
| Success | Full analytics dashboard |

---

## 6. Worker Specification

### Current Implementation

M12 does **not** use a background worker for rollups. Analytics are computed real-time on each request.

**Files:**
- `src/lib/analytics/AnalyticsService.ts` - Core computation
- `src/lib/db/memory-adapter.ts` - Memory aggregation functions
- `src/lib/db/supabase-adapter.ts` - SQL aggregation functions

### Future Worker (If Needed)

If rollup tables are added:

```bash
npm run scheduler:analytics-rollup
```

**Cron Schedule:** `5 0 * * *` (daily at 00:05 UTC)

**Locking:** Use existing M13 lock infrastructure with `analytics` job name

---

## 7. Tests

### Unit Tests

Located in `src/__tests__/analytics.test.ts`:

| Test | Description |
|------|-------------|
| getAnalyticsData | Counts requests by status, interview type, user |
| getTimeToScheduleData | Calculates time-to-schedule in hours |
| getAuditActionCounts | Counts audit actions |
| getAnalytics | Returns complete analytics response |
| analyticsToCSV | Generates valid CSV with escaped values |

### Coverage

- Status counting by period
- Interview type grouping
- User filtering
- Time-to-schedule calculation
- Booking rate calculation
- CSV export formatting
- Empty state handling

---

## 8. Build Plan (Completed)

All steps implemented as of 2026-01-16:

1. ✅ **Types** - Created `src/lib/analytics/types.ts` with all type definitions
2. ✅ **Database Functions** - Added `getAnalyticsData`, `getTimeToScheduleData`, `getAuditActionCounts` to both adapters
3. ✅ **Analytics Service** - Created `src/lib/analytics/AnalyticsService.ts` with computation logic
4. ✅ **API Endpoint** - Created `GET /api/analytics` with period filtering
5. ✅ **Export Endpoint** - Created `GET /api/analytics/export` with CSV generation
6. ✅ **MetricCard Component** - Summary stat card with color themes
7. ✅ **HorizontalBar Component** - Bar chart for status/type distributions
8. ✅ **DistributionChart Component** - Time-to-schedule bucket visualization
9. ✅ **PeriodSelector Component** - Period toggle button group
10. ✅ **Analytics Page** - Full dashboard at `/analytics`
11. ✅ **Tests** - Unit tests for all analytics functions
12. ✅ **Build Verification** - `npm run build` passes

---

## Key Files

### Backend

| File | Purpose |
|------|---------|
| `src/lib/analytics/types.ts` | Type definitions |
| `src/lib/analytics/AnalyticsService.ts` | Core metrics computation |
| `src/app/api/analytics/route.ts` | GET analytics endpoint |
| `src/app/api/analytics/export/route.ts` | CSV export endpoint |
| `src/lib/db/memory-adapter.ts` | Memory aggregation (lines 1025-1100) |
| `src/lib/db/supabase-adapter.ts` | SQL aggregation |

### Frontend

| File | Purpose |
|------|---------|
| `src/app/analytics/page.tsx` | Analytics dashboard |
| `src/components/analytics/MetricCard.tsx` | Summary stat card |
| `src/components/analytics/HorizontalBar.tsx` | Bar chart |
| `src/components/analytics/DistributionChart.tsx` | Distribution chart |
| `src/components/analytics/PeriodSelector.tsx` | Period selector |

### Tests

| File | Purpose |
|------|---------|
| `src/__tests__/analytics.test.ts` | Analytics unit tests |

---

## Verification Checklist

- [x] `npm run build` passes
- [x] `npm test` passes (analytics tests)
- [x] Analytics page loads at `/analytics`
- [x] Period selector updates metrics
- [x] CSV export downloads correctly
- [x] Empty state displays when no data
- [x] Responsive layout works on mobile
- [x] User-scoped analytics (only sees own data)
