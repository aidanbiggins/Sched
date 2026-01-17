# M15: Scheduling Intelligence & Capacity Planning

## Overview

Add interviewer capacity management, load balancing, and intelligent scheduling recommendations to optimize interview scheduling across the organization.

**Context**: Core scheduling, ops, security, and analytics are in place. This milestone adds intelligence to:
- Track interviewer capacity and preferences
- Balance interview load across interviewers
- Generate actionable recommendations for coordinators
- Alert ops to saturation and capacity issues

---

## 1. Data Model Additions

### 1.1 `interviewer_profiles` Table

Stores interviewer capacity limits, preferences, and tags for intelligent matching.

```sql
-- Migration: 006_scheduling_intelligence.sql

CREATE TABLE interviewer_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity linkage
  user_id UUID REFERENCES users(id),              -- NULL if not a user yet
  email TEXT NOT NULL,                            -- Primary identifier
  organization_id UUID REFERENCES organizations(id),

  -- Capacity settings
  max_interviews_per_week INTEGER DEFAULT 10,     -- Weekly cap
  max_interviews_per_day INTEGER DEFAULT 3,       -- Daily cap
  max_concurrent_per_day INTEGER DEFAULT 2,       -- Same-day limit
  buffer_minutes INTEGER DEFAULT 15,              -- Required gap between interviews

  -- Preferences
  preferred_times JSONB DEFAULT '{}',             -- {"mon": ["09:00-12:00"], "tue": [...]}
  blackout_dates JSONB DEFAULT '[]',              -- ["2026-01-20", "2026-01-21"]
  interview_type_preferences TEXT[] DEFAULT '{}', -- ['phone_screen', 'hm_screen']

  -- Tags for matching
  tags TEXT[] DEFAULT '{}',                       -- ['engineering', 'senior', 'hiring-manager']
  skill_areas TEXT[] DEFAULT '{}',                -- ['backend', 'frontend', 'ml']
  seniority_levels TEXT[] DEFAULT '{}',           -- ['junior', 'mid', 'senior', 'staff']

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_capacity_override_at TIMESTAMP,            -- Manual override tracking
  last_capacity_override_by UUID REFERENCES users(id),

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(organization_id, email)
);

-- Indexes
CREATE INDEX idx_interviewer_profiles_org ON interviewer_profiles(organization_id);
CREATE INDEX idx_interviewer_profiles_email ON interviewer_profiles(LOWER(email));
CREATE INDEX idx_interviewer_profiles_tags ON interviewer_profiles USING GIN(tags);
CREATE INDEX idx_interviewer_profiles_active ON interviewer_profiles(organization_id, is_active);
```

### 1.2 `interviewer_load_rollups` Table

Weekly aggregate metrics for each interviewer, computed by background job.

```sql
CREATE TABLE interviewer_load_rollups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  interviewer_profile_id UUID NOT NULL REFERENCES interviewer_profiles(id),
  organization_id UUID NOT NULL REFERENCES organizations(id),

  -- Time window
  week_start DATE NOT NULL,                       -- Monday of the week (ISO week)
  week_end DATE NOT NULL,                         -- Sunday of the week

  -- Interview counts
  scheduled_count INTEGER DEFAULT 0,              -- Total scheduled this week
  completed_count INTEGER DEFAULT 0,              -- Completed (past)
  cancelled_count INTEGER DEFAULT 0,              -- Cancelled
  rescheduled_count INTEGER DEFAULT 0,            -- Rescheduled (in or out)

  -- Load metrics
  utilization_pct DECIMAL(5,2) DEFAULT 0,         -- scheduled / max_per_week * 100
  peak_day_count INTEGER DEFAULT 0,               -- Max interviews on any single day
  avg_daily_count DECIMAL(4,2) DEFAULT 0,         -- Average per working day

  -- Interview type breakdown
  by_interview_type JSONB DEFAULT '{}',           -- {"phone_screen": 3, "onsite": 2}

  -- Time distribution
  by_day_of_week JSONB DEFAULT '{}',              -- {"mon": 2, "tue": 1, ...}
  by_hour_of_day JSONB DEFAULT '{}',              -- {"09": 1, "10": 2, ...}

  -- Capacity alerts
  at_capacity BOOLEAN DEFAULT false,              -- utilization >= 90%
  over_capacity BOOLEAN DEFAULT false,            -- utilization > 100%

  -- Computation metadata
  computed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  computation_duration_ms INTEGER,

  UNIQUE(interviewer_profile_id, week_start)
);

-- Indexes
CREATE INDEX idx_load_rollups_org_week ON interviewer_load_rollups(organization_id, week_start);
CREATE INDEX idx_load_rollups_at_capacity ON interviewer_load_rollups(organization_id, week_start, at_capacity);
CREATE INDEX idx_load_rollups_over_capacity ON interviewer_load_rollups(organization_id, week_start, over_capacity);
```

### 1.3 `scheduling_recommendations` Table

Deterministic recommendations generated for coordinators.

```sql
CREATE TABLE scheduling_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  organization_id UUID NOT NULL REFERENCES organizations(id),
  scheduling_request_id UUID REFERENCES scheduling_requests(id),
  availability_request_id UUID REFERENCES availability_requests(id),

  -- Recommendation details
  recommendation_type TEXT NOT NULL,              -- See types below
  priority TEXT NOT NULL DEFAULT 'medium',        -- 'critical' | 'high' | 'medium' | 'low'

  -- Evidence
  title TEXT NOT NULL,                            -- Short summary
  description TEXT NOT NULL,                      -- Detailed explanation
  evidence JSONB NOT NULL,                        -- Structured evidence data

  -- Suggested action
  suggested_action TEXT,                          -- What to do
  action_data JSONB,                              -- Data for action (e.g., alternate interviewers)

  -- Status
  status TEXT DEFAULT 'active',                   -- 'active' | 'dismissed' | 'acted' | 'expired'
  dismissed_at TIMESTAMP,
  dismissed_by UUID REFERENCES users(id),
  dismissed_reason TEXT,
  acted_at TIMESTAMP,
  acted_by UUID REFERENCES users(id),

  -- TTL
  expires_at TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT valid_entity CHECK (
    scheduling_request_id IS NOT NULL OR
    availability_request_id IS NOT NULL OR
    recommendation_type IN ('capacity_alert', 'interviewer_burnout', 'unbalanced_load')
  )
);

-- Indexes
CREATE INDEX idx_recommendations_org_status ON scheduling_recommendations(organization_id, status);
CREATE INDEX idx_recommendations_request ON scheduling_recommendations(scheduling_request_id);
CREATE INDEX idx_recommendations_type ON scheduling_recommendations(organization_id, recommendation_type, status);
CREATE INDEX idx_recommendations_priority ON scheduling_recommendations(organization_id, priority, status);
```

---

## 2. Load Calculation Rules

### 2.1 Weekly Load Calculation

```typescript
interface LoadCalculationInput {
  interviewerProfileId: string;
  weekStart: Date;  // Monday 00:00 UTC
  weekEnd: Date;    // Sunday 23:59 UTC
}

interface LoadCalculationResult {
  scheduledCount: number;
  completedCount: number;
  cancelledCount: number;
  rescheduledCount: number;
  utilizationPct: number;
  peakDayCount: number;
  avgDailyCount: number;
  byInterviewType: Record<InterviewType, number>;
  byDayOfWeek: Record<string, number>;  // 'mon', 'tue', etc.
  byHourOfDay: Record<string, number>;  // '09', '10', etc.
  atCapacity: boolean;
  overCapacity: boolean;
}
```

**Calculation Rules:**

1. **Scheduled Count**: All bookings where interviewer is in `interviewer_emails` array AND `scheduled_start` falls within the week AND `status != 'cancelled'`

2. **Completed Count**: Scheduled bookings where `scheduled_end < NOW()`

3. **Cancelled Count**: Bookings where interviewer was assigned AND `status = 'cancelled'`

4. **Rescheduled Count**: Bookings where interviewer was assigned AND `status = 'rescheduled'`

5. **Utilization %**: `(scheduled_count / max_interviews_per_week) * 100`
   - Capped at 999% for display purposes

6. **Peak Day Count**: `MAX(interviews per day)` across the week

7. **At Capacity**: `utilization_pct >= 90`

8. **Over Capacity**: `utilization_pct > 100`

### 2.2 Edge Cases

| Scenario | Handling |
|----------|----------|
| **New interviewer (no profile)** | Auto-create profile with default caps when first scheduled |
| **Interviewer removed mid-week** | Keep in rollup, mark `is_active = false` on profile |
| **Rescheduled to different week** | Decrement source week, increment target week |
| **Cancelled then rebooked** | Count as new booking (not double-count) |
| **Multi-interviewer booking** | Each interviewer counted separately |
| **Cross-org interviewer** | Separate profiles per org, separate rollups |
| **Week boundary booking** | Counted in week where `scheduled_start` falls |
| **Profile cap changed mid-week** | Use new cap for utilization calculation |
| **No max_per_week set (NULL)** | Use organization default (10) |

### 2.3 Data Freshness Rules

- **Real-time data**: Used for slot generation decisions (always query current bookings)
- **Rollup data**: Used for dashboard display and recommendations (updated by weekly job)
- **Hybrid approach**: Suggestions use real-time counts but rollup for historical context

---

## 3. Matching Algorithm Changes

### 3.1 Current Scoring (Baseline)

```typescript
// Current scoring in suggestionService.ts
score = (availableInterviewers / totalInterviewers) * 50  // max 50
      + (30 - daysFromNow * 2)                            // max 30 (prefer sooner)
      + (isOptimalTimeOfDay ? 10 : 0)                     // max 10
// Total max: ~90
```

### 3.2 Enhanced Scoring with Capacity

```typescript
interface EnhancedSuggestionScore {
  // Existing factors
  availabilityScore: number;      // 0-50: ratio of available interviewers
  timelinessScore: number;        // 0-30: prefer sooner slots
  timeOfDayScore: number;         // 0-10: 9am-2pm bonus

  // New capacity factors
  loadBalanceScore: number;       // 0-20: prefer less-loaded interviewers
  capacityHeadroomScore: number;  // 0-15: penalize at/over capacity
  preferenceMatchScore: number;   // 0-10: match interviewer preferences

  // Total: 0-135
  totalScore: number;

  // Rationale components
  rationale: string[];
}
```

**New Scoring Components:**

#### Load Balance Score (0-20)
```typescript
function calculateLoadBalanceScore(
  availableInterviewers: InterviewerWithLoad[]
): number {
  // Prefer slots where available interviewers have lower current load
  const avgUtilization = average(availableInterviewers.map(i => i.currentWeekUtilization));

  // 0% utilization = 20 points, 100% utilization = 0 points
  return Math.max(0, 20 - (avgUtilization * 20 / 100));
}
```

#### Capacity Headroom Score (0-15)
```typescript
function calculateCapacityHeadroomScore(
  availableInterviewers: InterviewerWithLoad[]
): number {
  // Penalize if any interviewer is at or over capacity
  const atCapacityCount = availableInterviewers.filter(i => i.atCapacity).length;
  const overCapacityCount = availableInterviewers.filter(i => i.overCapacity).length;

  if (overCapacityCount > 0) return 0;
  if (atCapacityCount > 0) return 5;
  if (atCapacityCount === 0 && allHaveHeadroom) return 15;
  return 10;
}
```

#### Preference Match Score (0-10)
```typescript
function calculatePreferenceMatchScore(
  slot: TimeSlot,
  availableInterviewers: InterviewerProfile[]
): number {
  let score = 10;

  for (const interviewer of availableInterviewers) {
    // Penalty if slot is outside preferred times
    if (!isWithinPreferredTimes(slot, interviewer.preferredTimes)) {
      score -= 2;
    }

    // Penalty if interview type not in preferences
    if (!interviewer.interviewTypePreferences.includes(interviewType)) {
      score -= 2;
    }
  }

  return Math.max(0, score);
}
```

### 3.3 Fail-Closed Rules

When capacity data is missing or incomplete, the algorithm fails closed (conservative):

| Missing Data | Behavior |
|--------------|----------|
| **No profile for interviewer** | Assume default capacity (10/week, 3/day), still generate slots |
| **No rollup data for current week** | Use real-time booking count, skip load balance score |
| **Profile marked inactive** | Exclude from suggestions, warn coordinator |
| **Stale rollup (> 7 days)** | Use real-time counts, add "stale data" note |
| **Calendar API error** | Exclude interviewer from slot, show "unavailable" |
| **All interviewers at capacity** | Still show slots but with warning, score penalty |

### 3.4 Ranking Order

1. Filter: Remove slots where no interviewers available
2. Filter: Remove slots where ALL interviewers are over-capacity (optional flag)
3. Score: Apply all scoring components
4. Sort: Descending by total score
5. Limit: Return top 30 slots
6. Annotate: Include rationale for each slot

---

## 4. Recommendations Engine

### 4.1 Recommendation Types

| Type | Trigger | Priority | Evidence |
|------|---------|----------|----------|
| `interviewer_over_capacity` | Any interviewer utilization > 100% | critical | `{email, utilization, cap, scheduled}` |
| `interviewer_at_capacity` | Any interviewer utilization >= 90% | high | `{email, utilization, cap, scheduled}` |
| `unbalanced_load` | Std dev of team utilization > 30% | medium | `{team_avg, min, max, spread}` |
| `interviewer_burnout_risk` | > 3 consecutive weeks at > 80% | high | `{email, weeks, avg_utilization}` |
| `no_availability` | Request has 0 available slots | critical | `{request_id, interviewers, reason}` |
| `limited_slots` | Request has < 5 available slots | high | `{request_id, slot_count, reason}` |
| `suboptimal_match` | Best slot scores < 50 | medium | `{request_id, best_score, issues}` |
| `preferred_time_conflict` | Slot outside all interviewer preferences | low | `{slot, preferences}` |
| `capacity_alert_org` | Org avg utilization > 85% | high | `{org_id, avg_utilization, count}` |
| `interviewer_inactive` | Scheduled for inactive interviewer | critical | `{email, request_id}` |

### 4.2 Evidence Structure

```typescript
interface RecommendationEvidence {
  // Always present
  generatedAt: string;        // ISO timestamp
  dataVersion: string;        // Rollup week or "realtime"

  // Type-specific evidence
  [key: string]: unknown;
}

// Example: interviewer_over_capacity
{
  generatedAt: "2026-01-17T10:00:00Z",
  dataVersion: "2026-01-13",  // Week of rollup
  interviewerEmail: "alice@example.com",
  currentUtilization: 120,
  weeklyCapacity: 10,
  scheduledCount: 12,
  peakDay: "wednesday",
  peakDayCount: 5
}

// Example: unbalanced_load
{
  generatedAt: "2026-01-17T10:00:00Z",
  dataVersion: "2026-01-13",
  teamSize: 8,
  avgUtilization: 65,
  minUtilization: 20,
  maxUtilization: 120,
  standardDeviation: 35,
  overloadedInterviewers: ["alice@example.com"],
  underutilizedInterviewers: ["bob@example.com", "carol@example.com"]
}
```

### 4.3 Deterministic Generation

Recommendations are generated deterministically based on:
1. Current state of rollup tables
2. Active scheduling requests
3. Interviewer profiles

**Idempotency**: Same input state = same recommendations. Use composite key `(type, entity_id, week_start)` to prevent duplicates.

### 4.4 Lifecycle

```
Created → Active → Dismissed | Acted | Expired
```

- **Auto-expire**: Recommendations expire when underlying condition resolves
- **Dismiss**: Coordinator acknowledges but takes no action
- **Acted**: Coordinator took suggested action

---

## 5. UI Changes

### 5.1 Coordinator Dashboard - "Why This Suggestion"

Add explainer UI to slot selection:

```tsx
// src/components/scheduling/SlotCard.tsx

interface SlotCardProps {
  slot: AvailabilitySuggestion;
  showRationale?: boolean;
}

function SlotCard({ slot, showRationale = true }: SlotCardProps) {
  return (
    <div className="bg-slate-800 rounded-lg p-4">
      <div className="flex justify-between">
        <TimeDisplay start={slot.startAt} end={slot.endAt} />
        <ScoreBadge score={slot.score} max={135} />
      </div>

      {/* Available interviewers */}
      <InterviewerList emails={slot.interviewerEmails} />

      {/* Why this suggestion */}
      {showRationale && (
        <div className="mt-3 pt-3 border-t border-slate-700">
          <h4 className="text-xs font-medium text-slate-400 mb-2">
            Why this slot?
          </h4>
          <ul className="text-xs text-slate-500 space-y-1">
            {slot.rationale.map((reason, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-emerald-400">✓</span>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

**Rationale Examples:**
- "All 3 interviewers available"
- "Balanced load: avg 45% utilization this week"
- "Within preferred hours for Alice and Bob"
- "2 days from now - prompt scheduling"
- "Optimal time of day (10am)"

**Warning Examples:**
- "Alice is at 95% capacity this week"
- "Outside Bob's preferred hours (prefers mornings)"
- "Limited options - only 3 slots available"

### 5.2 Ops Dashboard - Saturation Alerts

Add "Capacity" tab to ops dashboard:

```tsx
// New tab: 'capacity'
type Tab = 'overview' | ... | 'capacity';

// Capacity Tab Content
function CapacityTab({
  rollups,
  recommendations,
  onDismiss,
}: CapacityTabProps) {
  return (
    <div className="space-y-6">
      {/* Org-wide metrics */}
      <OrgCapacityOverview rollups={rollups} />

      {/* Saturation alerts */}
      <SaturationAlerts
        recommendations={recommendations.filter(r =>
          ['interviewer_over_capacity', 'interviewer_at_capacity', 'capacity_alert_org'].includes(r.type)
        )}
        onDismiss={onDismiss}
      />

      {/* Interviewer load table */}
      <InterviewerLoadTable rollups={rollups} />

      {/* Load distribution chart */}
      <LoadDistributionChart rollups={rollups} />
    </div>
  );
}
```

**Saturation Alert Card:**
```tsx
function SaturationAlertCard({ recommendation }: { recommendation: Recommendation }) {
  const severityColors = {
    critical: 'border-red-500 bg-red-500/10',
    high: 'border-amber-500 bg-amber-500/10',
    medium: 'border-yellow-500 bg-yellow-500/10',
    low: 'border-slate-500 bg-slate-500/10',
  };

  return (
    <div className={`border-l-4 rounded-lg p-4 ${severityColors[recommendation.priority]}`}>
      <div className="flex justify-between items-start">
        <div>
          <h4 className="font-medium">{recommendation.title}</h4>
          <p className="text-sm text-slate-400 mt-1">{recommendation.description}</p>
        </div>
        <PriorityBadge priority={recommendation.priority} />
      </div>

      {/* Evidence display */}
      <EvidencePanel evidence={recommendation.evidence} />

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        {recommendation.suggestedAction && (
          <button className="px-3 py-1 text-sm bg-cyan-600 hover:bg-cyan-500 rounded">
            {recommendation.suggestedAction}
          </button>
        )}
        <button className="px-3 py-1 text-sm bg-slate-700 hover:bg-slate-600 rounded">
          Dismiss
        </button>
      </div>
    </div>
  );
}
```

### 5.3 Interviewer Load Table

```tsx
interface InterviewerLoadRow {
  email: string;
  name: string | null;
  thisWeek: {
    scheduled: number;
    capacity: number;
    utilization: number;
    status: 'ok' | 'warning' | 'critical';
  };
  nextWeek: {
    scheduled: number;
    capacity: number;
    utilization: number;
    status: 'ok' | 'warning' | 'critical';
  };
  trend: 'increasing' | 'stable' | 'decreasing';
}
```

| Email | Name | This Week | Next Week | Trend |
|-------|------|-----------|-----------|-------|
| alice@ex.com | Alice Smith | 8/10 (80%) | 6/10 (60%) | ↓ |
| bob@ex.com | Bob Jones | 12/10 (120%) ⚠️ | 10/10 (100%) | ↓ |
| carol@ex.com | Carol Lee | 3/10 (30%) | 2/10 (20%) | ↓ |

---

## 6. Worker Needs

### 6.1 Weekly Rollup Job

Add new job to existing cron infrastructure:

```typescript
// src/lib/cron/types.ts
type JobName = 'notify' | 'sync' | 'webhook' | 'reconcile' | 'capacity_rollup';

// Schedule: Sunday 23:00 UTC (after week ends)
// vercel.json
{
  "crons": [
    // ... existing crons
    {
      "path": "/api/cron/capacity-rollup",
      "schedule": "0 23 * * 0"  // Sunday 11pm UTC
    }
  ]
}
```

### 6.2 Rollup Worker Implementation

```typescript
// src/lib/workers/capacityRollupWorker.ts

interface CapacityRollupResult {
  processed: number;     // Interviewer profiles processed
  rollupsCreated: number;
  rollupsUpdated: number;
  recommendationsGenerated: number;
  errors: string[];
}

async function processCapacityRollup(): Promise<CapacityRollupResult> {
  const result: CapacityRollupResult = {
    processed: 0,
    rollupsCreated: 0,
    rollupsUpdated: 0,
    recommendationsGenerated: 0,
    errors: [],
  };

  // Get all active interviewer profiles
  const profiles = await getActiveInterviewerProfiles();

  // Calculate week boundaries (just-ended week)
  const { weekStart, weekEnd } = getLastWeekBoundaries();

  for (const profile of profiles) {
    try {
      // Calculate load metrics
      const metrics = await calculateLoadMetrics(profile, weekStart, weekEnd);

      // Upsert rollup
      await upsertLoadRollup(profile.id, weekStart, metrics);
      result.rollupsCreated++;

      // Generate recommendations if needed
      const recs = await generateCapacityRecommendations(profile, metrics);
      result.recommendationsGenerated += recs.length;

      result.processed++;
    } catch (error) {
      result.errors.push(`${profile.email}: ${error.message}`);
    }
  }

  // Generate org-level recommendations
  const orgRecs = await generateOrgCapacityRecommendations();
  result.recommendationsGenerated += orgRecs.length;

  return result;
}
```

### 6.3 API Endpoint

```typescript
// src/app/api/cron/capacity-rollup/route.ts

import { createCronHandler } from '@/lib/cron/handler';
import { processCapacityRollup } from '@/lib/workers/capacityRollupWorker';

export const GET = createCronHandler('capacity_rollup', async () => {
  return await processCapacityRollup();
});
```

### 6.4 Queue Depth Calculation

```typescript
// For ops dashboard job status
async function getCapacityRollupQueueDepth(): Promise<number> {
  // Count profiles needing rollup update (no rollup for current week)
  const { weekStart } = getCurrentWeekBoundaries();

  return await db.count({
    table: 'interviewer_profiles',
    where: {
      is_active: true,
      id: { notIn: getProfilesWithRollupForWeek(weekStart) }
    }
  });
}
```

---

## 7. Tests Plan

### 7.1 Unit Tests

```typescript
// __tests__/lib/capacity/loadCalculation.test.ts
describe('Load Calculation', () => {
  describe('calculateWeeklyLoad', () => {
    it('counts bookings correctly for a week');
    it('excludes cancelled bookings from scheduled count');
    it('counts rescheduled bookings correctly');
    it('calculates utilization percentage correctly');
    it('identifies peak day correctly');
    it('handles multi-interviewer bookings');
    it('uses default capacity when profile has null value');
  });

  describe('edge cases', () => {
    it('handles interviewer with no bookings');
    it('handles week with no working days (holidays)');
    it('handles cross-week rescheduling');
    it('handles profile capacity changes mid-week');
  });
});

// __tests__/lib/capacity/scoring.test.ts
describe('Enhanced Scoring', () => {
  describe('loadBalanceScore', () => {
    it('gives max score for 0% utilization');
    it('gives 0 score for 100% utilization');
    it('averages across available interviewers');
  });

  describe('capacityHeadroomScore', () => {
    it('gives max score when all have headroom');
    it('penalizes at-capacity interviewers');
    it('gives 0 when any over-capacity');
  });

  describe('preferenceMatchScore', () => {
    it('gives max score when all preferences match');
    it('penalizes outside preferred times');
    it('penalizes mismatched interview types');
  });

  describe('fail-closed behavior', () => {
    it('uses default capacity when profile missing');
    it('skips load score when rollup stale');
    it('excludes inactive interviewers');
  });
});

// __tests__/lib/capacity/recommendations.test.ts
describe('Recommendations Engine', () => {
  describe('generation', () => {
    it('generates over_capacity for > 100% utilization');
    it('generates at_capacity for >= 90% utilization');
    it('generates unbalanced_load when std dev > 30%');
    it('generates burnout_risk for 3+ weeks at > 80%');
  });

  describe('idempotency', () => {
    it('does not duplicate recommendations for same condition');
    it('updates existing recommendation instead of creating new');
  });

  describe('lifecycle', () => {
    it('auto-expires when condition resolves');
    it('tracks dismissal correctly');
    it('tracks action correctly');
  });
});
```

### 7.2 Integration Tests

```typescript
// __tests__/api/capacity.test.ts
describe('Capacity API', () => {
  describe('GET /api/ops/capacity', () => {
    it('returns rollups for organization');
    it('returns active recommendations');
    it('requires superadmin auth');
  });

  describe('POST /api/cron/capacity-rollup', () => {
    it('requires cron auth');
    it('processes all active profiles');
    it('generates recommendations');
    it('handles partial failures gracefully');
  });
});

// __tests__/integration/suggestion-with-capacity.test.ts
describe('Suggestion Generation with Capacity', () => {
  it('includes capacity scores in suggestions');
  it('ranks lower-load interviewers higher');
  it('warns when all interviewers at capacity');
  it('still generates slots when data missing (fail-open)');
});
```

### 7.3 Component Tests

```typescript
// __tests__/components/SlotCard.test.tsx
describe('SlotCard', () => {
  it('displays rationale when showRationale=true');
  it('hides rationale when showRationale=false');
  it('shows warnings for capacity issues');
  it('shows score badge with correct color');
});

// __tests__/components/CapacityTab.test.tsx
describe('CapacityTab', () => {
  it('displays org-wide metrics');
  it('displays saturation alerts');
  it('displays interviewer load table');
  it('allows dismissing recommendations');
});
```

---

## 8. Step-by-Step Build Plan

### Step 1: Database Schema (Migration 006)
- [ ] Create `interviewer_profiles` table with indexes
- [ ] Create `interviewer_load_rollups` table with indexes
- [ ] Create `scheduling_recommendations` table with indexes
- [ ] Add RLS policies for new tables
- [ ] Test migration applies cleanly

### Step 2: Type Definitions
- [ ] Add `InterviewerProfile` type
- [ ] Add `InterviewerLoadRollup` type
- [ ] Add `SchedulingRecommendation` type
- [ ] Add scoring-related types
- [ ] Export from index

### Step 3: Database Adapters
- [ ] Add interviewer profile CRUD to memory adapter
- [ ] Add load rollup CRUD to memory adapter
- [ ] Add recommendations CRUD to memory adapter
- [ ] Mirror to supabase adapter
- [ ] Unit tests for adapters

### Step 4: Load Calculation Service
- [ ] Implement `calculateWeeklyLoad()` function
- [ ] Implement edge case handling
- [ ] Implement `getInterviewerLoadForSlot()` for real-time
- [ ] Unit tests for load calculation

### Step 5: Enhanced Scoring
- [ ] Implement `calculateLoadBalanceScore()`
- [ ] Implement `calculateCapacityHeadroomScore()`
- [ ] Implement `calculatePreferenceMatchScore()`
- [ ] Integrate into `suggestionService.ts`
- [ ] Add rationale generation
- [ ] Unit tests for scoring

### Step 6: Recommendations Engine
- [ ] Implement `generateCapacityRecommendations()`
- [ ] Implement `generateOrgCapacityRecommendations()`
- [ ] Implement idempotency logic
- [ ] Implement auto-expiration logic
- [ ] Unit tests for recommendations

### Step 7: Capacity Rollup Worker
- [ ] Create `capacityRollupWorker.ts`
- [ ] Create `/api/cron/capacity-rollup` endpoint
- [ ] Add to `vercel.json` cron config
- [ ] Add to job types and locks
- [ ] Integration tests

### Step 8: Coordinator UI - Rationale Display
- [ ] Create `SlotCard` component with rationale
- [ ] Update suggestion display in booking flow
- [ ] Add warning indicators
- [ ] Component tests

### Step 9: Ops Dashboard - Capacity Tab
- [ ] Add 'capacity' tab to ops page
- [ ] Create `OrgCapacityOverview` component
- [ ] Create `SaturationAlerts` component
- [ ] Create `InterviewerLoadTable` component
- [ ] Wire up API endpoints
- [ ] Component tests

### Step 10: API Endpoints
- [ ] Create `GET /api/ops/capacity` for rollups and recommendations
- [ ] Create `POST /api/ops/capacity/recommendations/[id]/dismiss`
- [ ] Create `GET /api/interviewer-profiles` for coordinator use
- [ ] Auth and org scoping for all endpoints

### Step 11: Profile Management UI (Optional)
- [ ] Create interviewer profile editor
- [ ] Allow setting caps, preferences, tags
- [ ] Admin-only access

### Step 12: Final Integration & Testing
- [ ] End-to-end flow testing
- [ ] Performance testing with realistic data
- [ ] Documentation updates
- [ ] Build verification

---

## Definition of Done

- [ ] `interviewer_profiles` table created with indexes and RLS
- [ ] `interviewer_load_rollups` table created with indexes and RLS
- [ ] `scheduling_recommendations` table created with indexes and RLS
- [ ] Load calculation correctly handles all edge cases
- [ ] Enhanced scoring integrated into suggestion generation
- [ ] Recommendations generated deterministically with idempotency
- [ ] Weekly rollup job runs on schedule via Vercel Cron
- [ ] Coordinator sees "why this suggestion" rationale
- [ ] Ops sees saturation alerts in Capacity tab
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] `npm run build` passes
- [ ] `npm test` passes

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/supabase/migrations/006_scheduling_intelligence.sql` | Database schema |
| `src/types/capacity.ts` | Type definitions |
| `src/lib/capacity/loadCalculation.ts` | Load metric calculations |
| `src/lib/capacity/scoring.ts` | Enhanced scoring functions |
| `src/lib/capacity/recommendations.ts` | Recommendation generation |
| `src/lib/workers/capacityRollupWorker.ts` | Weekly rollup worker |
| `src/app/api/cron/capacity-rollup/route.ts` | Cron endpoint |
| `src/app/api/ops/capacity/route.ts` | Capacity data API |
| `src/app/api/ops/capacity/recommendations/[id]/dismiss/route.ts` | Dismiss API |
| `src/components/scheduling/SlotCard.tsx` | Slot with rationale |
| `src/components/ops/CapacityTab.tsx` | Ops capacity tab |
| `src/components/ops/SaturationAlerts.tsx` | Alert display |
| `src/components/ops/InterviewerLoadTable.tsx` | Load table |

## Files to Modify

| File | Changes |
|------|---------|
| `src/lib/availability/suggestionService.ts` | Integrate capacity scoring |
| `src/lib/cron/types.ts` | Add `capacity_rollup` job type |
| `src/app/ops/page.tsx` | Add Capacity tab |
| `vercel.json` | Add cron schedule |
| `src/lib/db/memory-adapter.ts` | Add CRUD for new tables |
| `src/lib/db/supabase-adapter.ts` | Add CRUD for new tables |
| `src/lib/db/index.ts` | Export new functions |

---

*Plan created: 2026-01-17*
