# UNIFIED_TIMEGRID_CALENDAR_COMPONENT

**Status:** Complete
**Completed:** 2026-01-15

## Overview

This document describes the unified calendar component (`AvailabilityTimeGrid`) that provides a consistent, reusable week time-grid calendar for availability management across the application.

## Architecture

### Component: `AvailabilityTimeGrid`

**Location:** `src/components/scheduling/AvailabilityTimeGrid.tsx`

A production-ready calendar component built on FullCalendar that supports:
- Week view with time grid (like Google Calendar/Outlook)
- Drag to select availability blocks
- Click to remove blocks
- 15-minute snapping (configurable)
- Timezone selector support
- Edit and readonly modes

### Block Utilities

**Location:** `src/lib/scheduling/availabilityBlocks.ts`

Pure functions for managing availability blocks with timezone support:

```typescript
// Core types
interface AvailabilityBlock {
  id: string;
  startUtcIso: string;  // ISO 8601 UTC string
  endUtcIso: string;    // ISO 8601 UTC string
}

// Key functions
snapToInterval(date, intervalMinutes, direction)  // Snap to nearest interval
normalizeBlocks(blocks, options)                  // Filter, snap, sort, merge
mergeAdjacent(blocks, maxGapMinutes)             // Merge adjacent/overlapping
overlaps(a, b)                                    // Check if intervals overlap
subtractBusy(blocks, busyIntervals)              // Remove busy time from blocks
toApiFormat(block)                                // Convert to API format
fromApiFormat(data, index)                        // Convert from API format
```

## Props Reference

```typescript
interface AvailabilityTimeGridProps {
  // Required
  mode: 'edit' | 'readonly';
  blocks: AvailabilityBlock[];

  // Edit mode
  onChange?: (blocks: AvailabilityBlock[]) => void;

  // Display options
  timezone?: string;              // IANA timezone or 'local' (default: 'local')
  initialDate?: Date;             // Initial date to display (default: today)
  minTime?: string;               // Earliest visible time (default: '07:00:00')
  maxTime?: string;               // Latest visible time (default: '21:00:00')
  slotDuration?: number;          // Slot duration in minutes (default: 15)
  showNavigation?: boolean;       // Show week navigation buttons (default: true)
  header?: React.ReactNode;       // Custom header content
  className?: string;             // Custom CSS class

  // Constraints
  validRangeStart?: Date;         // Earliest selectable date
  validRangeEnd?: Date;           // Latest selectable date

  // State
  loading?: boolean;
  error?: string | null;
  onDismissError?: () => void;
}
```

## Common Timezones

The component exports `COMMON_TIMEZONES` for use in timezone selectors:

```typescript
import { COMMON_TIMEZONES } from '@/components/scheduling';

// Returns array of { value: string, label: string }
// Includes: Local, ET, CT, MT, PT, Arizona, London, Paris, Tokyo, UTC
```

## Usage Examples

### Edit Mode (Candidate Availability)

```tsx
import { AvailabilityTimeGrid } from '@/components/scheduling';

function CandidateAvailabilityForm() {
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [timezone, setTimezone] = useState('America/New_York');

  return (
    <AvailabilityTimeGrid
      mode="edit"
      blocks={blocks}
      onChange={setBlocks}
      timezone={timezone}
      initialDate={new Date(request.windowStart)}
      validRangeStart={new Date(request.windowStart)}
      validRangeEnd={new Date(request.windowEnd)}
      showNavigation={true}
    />
  );
}
```

### Readonly Mode (Coordinator View)

```tsx
import { AvailabilityTimeGrid } from '@/components/scheduling';

function CoordinatorAvailabilityView({ blocks, timezone }) {
  return (
    <AvailabilityTimeGrid
      mode="readonly"
      blocks={blocks}
      timezone={timezone}
      showNavigation={true}
    />
  );
}
```

## Block Storage & Normalization

### Storage Format

All blocks are stored in UTC ISO 8601 format:
```typescript
{
  id: "block-1736956800000-abc123def",
  startUtcIso: "2026-01-15T14:00:00.000Z",
  endUtcIso: "2026-01-15T16:00:00.000Z"
}
```

### Normalization Process

When blocks are added/modified, they go through normalization:

1. **Filter** - Remove invalid blocks (start >= end, invalid dates)
2. **Snap** - Round times to interval boundaries (ceil for start, floor for end)
3. **Sort** - Order by start time
4. **Merge** - Combine adjacent and overlapping blocks

```typescript
const normalizedBlocks = normalizeBlocks(blocks, {
  intervalMinutes: 15,    // Snap to 15-minute boundaries
  maxGapMinutes: 0,       // Only merge if touching (no gap)
  minDurationMinutes: 15, // Minimum block length
});
```

## Timezone Handling

### Display

The component displays times in the user's selected timezone:
```typescript
// Internal storage: UTC
block.startUtcIso = "2026-01-15T14:00:00.000Z"

// Display in Eastern Time: "9:00 AM"
// Display in Pacific Time: "6:00 AM"
```

### FullCalendar Integration

FullCalendar receives the timezone prop and handles conversion:
```tsx
<FullCalendar
  timeZone={timezone === 'local' ? 'local' : timezone}
  // Events are stored in UTC, FullCalendar converts for display
/>
```

### Utility Functions

```typescript
import { formatInTimezone } from '@/lib/scheduling/availabilityBlocks';

// Format date for display in specific timezone
formatInTimezone(date, 'America/New_York', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
// => "Wed, Jan 15, 9:00 AM"
```

## Dependencies

```json
{
  "@fullcalendar/core": "^6.x",
  "@fullcalendar/react": "^6.x",
  "@fullcalendar/timegrid": "^6.x",
  "@fullcalendar/daygrid": "^6.x",
  "@fullcalendar/interaction": "^6.x"
}
```

## Manual QA Checklist

### Candidate Availability Page (`/availability/[token]`)

- [ ] Page loads without errors
- [ ] Calendar displays correct week based on request window
- [ ] Timezone selector works and updates display
- [ ] Can drag to select availability blocks
- [ ] Blocks snap to 15-minute intervals
- [ ] Adjacent blocks merge automatically
- [ ] Can click blocks to remove them
- [ ] "Clear All" button removes all blocks
- [ ] Week navigation (prev/next/today) works
- [ ] Review step shows all selected blocks
- [ ] Submit successfully sends to API
- [ ] Confirmation page displays after submit

### Block Utilities

- [ ] Blocks outside valid range are rejected
- [ ] Overlapping blocks merge correctly
- [ ] Adjacent blocks (no gap) merge correctly
- [ ] Blocks shorter than minimum duration are filtered
- [ ] Times snap correctly (start=ceil, end=floor)
- [ ] API format conversion works both directions

### Timezone Handling

- [ ] Times display correctly in selected timezone
- [ ] Switching timezones updates all displayed times
- [ ] Blocks created in one timezone appear correctly in another
- [ ] UTC storage format is consistent

### Accessibility

- [ ] Keyboard navigation works
- [ ] Screen reader announces block details
- [ ] Focus states are visible
- [ ] Color contrast meets WCAG requirements

## Test Coverage

Unit tests are located at `__tests__/lib/scheduling/availabilityBlocks.test.ts`:

- 41 tests covering all utility functions
- Snapping (round, floor, ceil)
- Block validation
- Merging adjacent/overlapping blocks
- Normalization pipeline
- Busy time subtraction
- API format conversion

Run tests:
```bash
npm test -- --testPathPattern=availabilityBlocks
```

## Files Changed

### New Files
- `src/lib/scheduling/availabilityBlocks.ts` - Block utilities
- `src/components/scheduling/AvailabilityTimeGrid.tsx` - Calendar component
- `src/components/scheduling/index.ts` - Exports
- `__tests__/lib/scheduling/availabilityBlocks.test.ts` - Unit tests

### Modified Files
- `src/app/availability/[token]/page.tsx` - Refactored to use new component
- `package.json` - Added FullCalendar dependencies
