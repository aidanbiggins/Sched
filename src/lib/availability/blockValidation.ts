/**
 * Block Validation and Normalization
 *
 * Validates and normalizes candidate availability blocks:
 * - Ensures 15-minute alignment
 * - Rejects overlapping blocks
 * - Merges adjacent blocks
 * - Enforces minimum requirements
 */

export interface InputBlock {
  startAt: string; // ISO 8601 UTC
  endAt: string;   // ISO 8601 UTC
}

export interface NormalizedBlock {
  startAt: Date;
  endAt: Date;
}

export interface ValidationOptions {
  windowStart: Date;
  windowEnd: Date;
  minTotalMinutes: number;
  minBlocks: number;
  durationMinutes: number; // Interview duration - blocks must be at least this long
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  normalizedBlocks: NormalizedBlock[];
  totalMinutes: number;
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * Round a date up to the next 15-minute boundary
 */
export function roundUpTo15Minutes(date: Date): Date {
  const ms = date.getTime();
  const remainder = ms % FIFTEEN_MINUTES;
  if (remainder === 0) return date;
  return new Date(ms + FIFTEEN_MINUTES - remainder);
}

/**
 * Round a date down to the previous 15-minute boundary
 */
export function roundDownTo15Minutes(date: Date): Date {
  const ms = date.getTime();
  const remainder = ms % FIFTEEN_MINUTES;
  return new Date(ms - remainder);
}

/**
 * Check if a date is aligned to 15-minute boundary
 */
export function isAlignedTo15Minutes(date: Date): boolean {
  return date.getTime() % FIFTEEN_MINUTES === 0;
}

/**
 * Parse and validate a single block
 */
function parseBlock(input: InputBlock, index: number): { block: NormalizedBlock | null; errors: string[] } {
  const errors: string[] = [];

  // Parse dates
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);

  // Check for invalid dates
  if (isNaN(startAt.getTime())) {
    errors.push(`Block ${index + 1}: Invalid start date`);
    return { block: null, errors };
  }
  if (isNaN(endAt.getTime())) {
    errors.push(`Block ${index + 1}: Invalid end date`);
    return { block: null, errors };
  }

  // Check start is before end
  if (startAt >= endAt) {
    errors.push(`Block ${index + 1}: Start time must be before end time`);
    return { block: null, errors };
  }

  // Round to 15-minute boundaries (start up, end down for safety)
  const roundedStart = roundUpTo15Minutes(startAt);
  const roundedEnd = roundDownTo15Minutes(endAt);

  // Check if rounding made the block invalid
  if (roundedStart >= roundedEnd) {
    errors.push(`Block ${index + 1}: Block too short after 15-minute alignment`);
    return { block: null, errors };
  }

  return {
    block: { startAt: roundedStart, endAt: roundedEnd },
    errors,
  };
}

/**
 * Check if two blocks overlap
 */
function blocksOverlap(a: NormalizedBlock, b: NormalizedBlock): boolean {
  return a.startAt < b.endAt && b.startAt < a.endAt;
}

/**
 * Check if two blocks are adjacent (can be merged)
 */
function blocksAdjacent(a: NormalizedBlock, b: NormalizedBlock): boolean {
  return a.endAt.getTime() === b.startAt.getTime() || b.endAt.getTime() === a.startAt.getTime();
}

/**
 * Merge two adjacent blocks
 */
function mergeBlocks(a: NormalizedBlock, b: NormalizedBlock): NormalizedBlock {
  return {
    startAt: new Date(Math.min(a.startAt.getTime(), b.startAt.getTime())),
    endAt: new Date(Math.max(a.endAt.getTime(), b.endAt.getTime())),
  };
}

/**
 * Sort blocks by start time
 */
function sortBlocks(blocks: NormalizedBlock[]): NormalizedBlock[] {
  return [...blocks].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}

/**
 * Merge all adjacent blocks in a sorted list
 */
function mergeAdjacentBlocks(sortedBlocks: NormalizedBlock[]): NormalizedBlock[] {
  if (sortedBlocks.length === 0) return [];

  const result: NormalizedBlock[] = [sortedBlocks[0]];

  for (let i = 1; i < sortedBlocks.length; i++) {
    const current = sortedBlocks[i];
    const last = result[result.length - 1];

    if (blocksAdjacent(last, current) || blocksOverlap(last, current)) {
      // Merge with previous
      result[result.length - 1] = mergeBlocks(last, current);
    } else {
      result.push(current);
    }
  }

  return result;
}

/**
 * Validate and normalize candidate availability blocks
 */
export function validateAndNormalizeBlocks(
  inputBlocks: InputBlock[],
  options: ValidationOptions
): ValidationResult {
  const errors: string[] = [];
  let parsedBlocks: NormalizedBlock[] = [];

  // Parse all blocks
  for (let i = 0; i < inputBlocks.length; i++) {
    const result = parseBlock(inputBlocks[i], i);
    errors.push(...result.errors);
    if (result.block) {
      parsedBlocks.push(result.block);
    }
  }

  // If we had parsing errors, return early
  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      normalizedBlocks: [],
      totalMinutes: 0,
    };
  }

  // Sort blocks by start time
  parsedBlocks = sortBlocks(parsedBlocks);

  // Check for overlaps (before merging adjacent)
  for (let i = 0; i < parsedBlocks.length - 1; i++) {
    for (let j = i + 1; j < parsedBlocks.length; j++) {
      if (blocksOverlap(parsedBlocks[i], parsedBlocks[j]) && !blocksAdjacent(parsedBlocks[i], parsedBlocks[j])) {
        errors.push(`Blocks ${i + 1} and ${j + 1} overlap`);
      }
    }
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      normalizedBlocks: [],
      totalMinutes: 0,
    };
  }

  // Merge adjacent blocks
  const mergedBlocks = mergeAdjacentBlocks(parsedBlocks);

  // Validate blocks are within the window
  for (let i = 0; i < mergedBlocks.length; i++) {
    const block = mergedBlocks[i];
    if (block.startAt < options.windowStart) {
      errors.push(`Block ${i + 1}: Starts before the scheduling window`);
    }
    if (block.endAt > options.windowEnd) {
      errors.push(`Block ${i + 1}: Ends after the scheduling window`);
    }
  }

  // Filter out blocks that are too short for the interview
  const validBlocks = mergedBlocks.filter((block) => {
    const durationMs = block.endAt.getTime() - block.startAt.getTime();
    const durationMinutes = durationMs / (60 * 1000);
    return durationMinutes >= options.durationMinutes;
  });

  // Calculate total minutes
  const totalMinutes = validBlocks.reduce((sum, block) => {
    const durationMs = block.endAt.getTime() - block.startAt.getTime();
    return sum + durationMs / (60 * 1000);
  }, 0);

  // Validate minimum requirements
  if (validBlocks.length < options.minBlocks) {
    errors.push(
      `Need at least ${options.minBlocks} availability blocks (${options.durationMinutes}+ min each), got ${validBlocks.length}`
    );
  }

  if (totalMinutes < options.minTotalMinutes) {
    errors.push(
      `Need at least ${options.minTotalMinutes} minutes of availability, got ${Math.floor(totalMinutes)}`
    );
  }

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      normalizedBlocks: validBlocks,
      totalMinutes,
    };
  }

  return {
    valid: true,
    errors: [],
    normalizedBlocks: validBlocks,
    totalMinutes,
  };
}
