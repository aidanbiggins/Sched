/**
 * Availability Block Utilities
 *
 * Pure functions for managing availability blocks with timezone support.
 * All blocks are stored in UTC and converted to/from local time for display.
 */

// ============================================
// Types
// ============================================

export interface AvailabilityBlock {
  id: string;
  startUtcIso: string;  // ISO 8601 UTC string
  endUtcIso: string;    // ISO 8601 UTC string
}

export interface TimeInterval {
  start: Date;
  end: Date;
}

// ============================================
// Constants
// ============================================

export const DEFAULT_SLOT_MINUTES = 15;
export const MS_PER_MINUTE = 60 * 1000;

// ============================================
// Timezone Utilities
// ============================================

/**
 * Convert a UTC ISO string to a Date object in a specific timezone for display.
 * Returns a Date object - the actual time representation stays in UTC internally,
 * but this can be used with toLocaleString for display in the target timezone.
 */
export function toZonedDateTime(utcIso: string, _timezone: string): Date {
  return new Date(utcIso);
}

/**
 * Convert a local datetime (from user input in their timezone) to UTC ISO string.
 * The input date should represent the wall-clock time the user selected.
 */
export function toUtcIso(localDateTime: Date, _timezone: string): string {
  return localDateTime.toISOString();
}

/**
 * Format a date for display in a specific timezone.
 */
export function formatInTimezone(
  date: Date,
  timezone: string,
  options: Intl.DateTimeFormatOptions = {}
): string {
  return date.toLocaleString('en-US', {
    timeZone: timezone === 'local' ? undefined : timezone,
    ...options,
  });
}

/**
 * Get the start of day in a specific timezone.
 */
export function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  const dateStr = formatInTimezone(date, timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // Parse MM/DD/YYYY format
  const [month, day, year] = dateStr.split('/').map(Number);
  const result = new Date(year, month - 1, day, 0, 0, 0, 0);
  return result;
}

// ============================================
// Snapping Utilities
// ============================================

/**
 * Snap a datetime to the nearest interval boundary.
 *
 * @param dateTime - The datetime to snap
 * @param intervalMinutes - The interval in minutes (default 15)
 * @param direction - 'round' | 'floor' | 'ceil'
 * @returns Snapped datetime
 */
export function snapToInterval(
  dateTime: Date,
  intervalMinutes: number = DEFAULT_SLOT_MINUTES,
  direction: 'round' | 'floor' | 'ceil' = 'round'
): Date {
  const ms = dateTime.getTime();
  const intervalMs = intervalMinutes * MS_PER_MINUTE;

  let snappedMs: number;
  switch (direction) {
    case 'floor':
      snappedMs = Math.floor(ms / intervalMs) * intervalMs;
      break;
    case 'ceil':
      snappedMs = Math.ceil(ms / intervalMs) * intervalMs;
      break;
    case 'round':
    default:
      snappedMs = Math.round(ms / intervalMs) * intervalMs;
      break;
  }

  return new Date(snappedMs);
}

/**
 * Round up to the next interval boundary (for block starts).
 */
export function roundUpTo15Minutes(date: Date): Date {
  return snapToInterval(date, 15, 'ceil');
}

/**
 * Round down to the previous interval boundary (for block ends).
 */
export function roundDownTo15Minutes(date: Date): Date {
  return snapToInterval(date, 15, 'floor');
}

/**
 * Check if a time is aligned to the interval.
 */
export function isAlignedToInterval(date: Date, intervalMinutes: number = DEFAULT_SLOT_MINUTES): boolean {
  const ms = date.getTime();
  const intervalMs = intervalMinutes * MS_PER_MINUTE;
  return ms % intervalMs === 0;
}

// ============================================
// Block Validation
// ============================================

/**
 * Check if two time intervals overlap.
 */
export function overlaps(a: TimeInterval, b: TimeInterval): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Check if two blocks overlap.
 */
export function blocksOverlap(a: AvailabilityBlock, b: AvailabilityBlock): boolean {
  return overlaps(
    { start: new Date(a.startUtcIso), end: new Date(a.endUtcIso) },
    { start: new Date(b.startUtcIso), end: new Date(b.endUtcIso) }
  );
}

/**
 * Check if a block is valid (start before end, positive duration).
 */
export function isValidBlock(block: AvailabilityBlock): boolean {
  const start = new Date(block.startUtcIso);
  const end = new Date(block.endUtcIso);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return false;
  }

  return start < end;
}

/**
 * Get block duration in minutes.
 */
export function getBlockDurationMinutes(block: AvailabilityBlock): number {
  const start = new Date(block.startUtcIso);
  const end = new Date(block.endUtcIso);
  return (end.getTime() - start.getTime()) / MS_PER_MINUTE;
}

// ============================================
// Block Merging
// ============================================

/**
 * Check if two blocks are adjacent (end of one equals start of another).
 */
export function areAdjacent(
  a: AvailabilityBlock,
  b: AvailabilityBlock,
  maxGapMinutes: number = 0
): boolean {
  const aEnd = new Date(a.endUtcIso).getTime();
  const bStart = new Date(b.startUtcIso).getTime();
  const bEnd = new Date(b.endUtcIso).getTime();
  const aStart = new Date(a.startUtcIso).getTime();

  const gapMs = maxGapMinutes * MS_PER_MINUTE;

  // a ends at or near b's start, or b ends at or near a's start
  return (
    (bStart - aEnd >= 0 && bStart - aEnd <= gapMs) ||
    (aStart - bEnd >= 0 && aStart - bEnd <= gapMs)
  );
}

/**
 * Merge two adjacent blocks into one.
 */
export function mergeBlocks(a: AvailabilityBlock, b: AvailabilityBlock): AvailabilityBlock {
  const aStart = new Date(a.startUtcIso);
  const aEnd = new Date(a.endUtcIso);
  const bStart = new Date(b.startUtcIso);
  const bEnd = new Date(b.endUtcIso);

  const start = aStart < bStart ? aStart : bStart;
  const end = aEnd > bEnd ? aEnd : bEnd;

  return {
    id: a.id, // Keep the first block's ID
    startUtcIso: start.toISOString(),
    endUtcIso: end.toISOString(),
  };
}

/**
 * Merge adjacent blocks in a sorted array.
 * Blocks must be sorted by start time before calling.
 */
export function mergeAdjacent(
  blocks: AvailabilityBlock[],
  maxGapMinutes: number = 0
): AvailabilityBlock[] {
  if (blocks.length === 0) return [];

  const sorted = [...blocks].sort(
    (a, b) => new Date(a.startUtcIso).getTime() - new Date(b.startUtcIso).getTime()
  );

  const merged: AvailabilityBlock[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (areAdjacent(last, current, maxGapMinutes) || blocksOverlap(last, current)) {
      // Merge into the last block
      merged[merged.length - 1] = mergeBlocks(last, current);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

// ============================================
// Block Normalization
// ============================================

/**
 * Normalize a list of blocks:
 * 1. Filter out invalid blocks
 * 2. Snap times to interval boundaries
 * 3. Sort by start time
 * 4. Merge adjacent and overlapping blocks
 */
export function normalizeBlocks(
  blocks: AvailabilityBlock[],
  options: {
    intervalMinutes?: number;
    maxGapMinutes?: number;
    minDurationMinutes?: number;
  } = {}
): AvailabilityBlock[] {
  const {
    intervalMinutes = DEFAULT_SLOT_MINUTES,
    maxGapMinutes = 0,
    minDurationMinutes = intervalMinutes,
  } = options;

  // Step 1: Filter invalid blocks and snap times
  const snapped = blocks
    .filter(isValidBlock)
    .map((block) => ({
      ...block,
      startUtcIso: snapToInterval(new Date(block.startUtcIso), intervalMinutes, 'ceil').toISOString(),
      endUtcIso: snapToInterval(new Date(block.endUtcIso), intervalMinutes, 'floor').toISOString(),
    }))
    // After snapping, re-validate (snapping might make start >= end)
    .filter(isValidBlock)
    // Filter blocks that are too short
    .filter((block) => getBlockDurationMinutes(block) >= minDurationMinutes);

  // Step 2: Sort by start time
  const sorted = snapped.sort(
    (a, b) => new Date(a.startUtcIso).getTime() - new Date(b.startUtcIso).getTime()
  );

  // Step 3: Merge adjacent and overlapping
  return mergeAdjacent(sorted, maxGapMinutes);
}

// ============================================
// Block Subtraction (for busy time handling)
// ============================================

/**
 * Subtract busy intervals from availability blocks.
 * Returns the remaining available time.
 */
export function subtractBusy(
  blocks: AvailabilityBlock[],
  busyIntervals: TimeInterval[]
): AvailabilityBlock[] {
  if (busyIntervals.length === 0) return blocks;

  const result: AvailabilityBlock[] = [];

  for (const block of blocks) {
    let remaining: TimeInterval[] = [
      { start: new Date(block.startUtcIso), end: new Date(block.endUtcIso) }
    ];

    for (const busy of busyIntervals) {
      const newRemaining: TimeInterval[] = [];

      for (const interval of remaining) {
        if (!overlaps(interval, busy)) {
          // No overlap, keep the interval
          newRemaining.push(interval);
        } else {
          // There's overlap - split the interval
          // Part before busy
          if (interval.start < busy.start) {
            newRemaining.push({ start: interval.start, end: busy.start });
          }
          // Part after busy
          if (interval.end > busy.end) {
            newRemaining.push({ start: busy.end, end: interval.end });
          }
        }
      }

      remaining = newRemaining;
    }

    // Convert remaining intervals back to blocks
    for (let i = 0; i < remaining.length; i++) {
      const interval = remaining[i];
      result.push({
        id: `${block.id}-${i}`,
        startUtcIso: interval.start.toISOString(),
        endUtcIso: interval.end.toISOString(),
      });
    }
  }

  return result;
}

// ============================================
// Conversion helpers for API
// ============================================

/**
 * Convert internal AvailabilityBlock format to the format expected by the API.
 */
export function toApiFormat(block: AvailabilityBlock): { startAt: string; endAt: string } {
  return {
    startAt: block.startUtcIso,
    endAt: block.endUtcIso,
  };
}

/**
 * Convert API format to internal AvailabilityBlock format.
 */
export function fromApiFormat(
  data: { id?: string; startAt: string; endAt: string },
  index: number = 0
): AvailabilityBlock {
  return {
    id: data.id || `block-${index}`,
    startUtcIso: data.startAt,
    endUtcIso: data.endAt,
  };
}

/**
 * Generate a unique ID for a new block.
 */
export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
