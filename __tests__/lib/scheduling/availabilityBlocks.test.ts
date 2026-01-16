/**
 * Tests for Availability Block Utilities
 */

import {
  AvailabilityBlock,
  snapToInterval,
  roundUpTo15Minutes,
  roundDownTo15Minutes,
  isAlignedToInterval,
  overlaps,
  blocksOverlap,
  isValidBlock,
  getBlockDurationMinutes,
  areAdjacent,
  mergeBlocks,
  mergeAdjacent,
  normalizeBlocks,
  subtractBusy,
  toApiFormat,
  fromApiFormat,
  generateBlockId,
} from '@/lib/scheduling/availabilityBlocks';

describe('snapToInterval', () => {
  it('should not change already aligned times', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    expect(snapToInterval(date, 15).toISOString()).toBe('2024-01-15T10:00:00.000Z');
  });

  it('should round to nearest 15 minutes by default', () => {
    // 10:07 -> 10:00 (closer to 10:00)
    expect(snapToInterval(new Date('2024-01-15T10:07:00Z'), 15).toISOString())
      .toBe('2024-01-15T10:00:00.000Z');

    // 10:08 -> 10:15 (closer to 10:15)
    expect(snapToInterval(new Date('2024-01-15T10:08:00Z'), 15).toISOString())
      .toBe('2024-01-15T10:15:00.000Z');
  });

  it('should round up when direction is ceil', () => {
    expect(snapToInterval(new Date('2024-01-15T10:01:00Z'), 15, 'ceil').toISOString())
      .toBe('2024-01-15T10:15:00.000Z');

    expect(snapToInterval(new Date('2024-01-15T10:14:00Z'), 15, 'ceil').toISOString())
      .toBe('2024-01-15T10:15:00.000Z');
  });

  it('should round down when direction is floor', () => {
    expect(snapToInterval(new Date('2024-01-15T10:14:00Z'), 15, 'floor').toISOString())
      .toBe('2024-01-15T10:00:00.000Z');

    expect(snapToInterval(new Date('2024-01-15T10:29:00Z'), 15, 'floor').toISOString())
      .toBe('2024-01-15T10:15:00.000Z');
  });

  it('should support different interval sizes', () => {
    // 30-minute intervals
    expect(snapToInterval(new Date('2024-01-15T10:20:00Z'), 30).toISOString())
      .toBe('2024-01-15T10:30:00.000Z');

    // 60-minute intervals
    expect(snapToInterval(new Date('2024-01-15T10:25:00Z'), 60).toISOString())
      .toBe('2024-01-15T10:00:00.000Z');
  });
});

describe('roundUpTo15Minutes / roundDownTo15Minutes', () => {
  it('roundUpTo15Minutes should round up correctly', () => {
    expect(roundUpTo15Minutes(new Date('2024-01-15T10:01:00Z')).toISOString())
      .toBe('2024-01-15T10:15:00.000Z');
    expect(roundUpTo15Minutes(new Date('2024-01-15T10:15:00Z')).toISOString())
      .toBe('2024-01-15T10:15:00.000Z');
  });

  it('roundDownTo15Minutes should round down correctly', () => {
    expect(roundDownTo15Minutes(new Date('2024-01-15T10:14:00Z')).toISOString())
      .toBe('2024-01-15T10:00:00.000Z');
    expect(roundDownTo15Minutes(new Date('2024-01-15T10:15:00Z')).toISOString())
      .toBe('2024-01-15T10:15:00.000Z');
  });
});

describe('isAlignedToInterval', () => {
  it('should return true for aligned times', () => {
    expect(isAlignedToInterval(new Date('2024-01-15T10:00:00Z'), 15)).toBe(true);
    expect(isAlignedToInterval(new Date('2024-01-15T10:15:00Z'), 15)).toBe(true);
    expect(isAlignedToInterval(new Date('2024-01-15T10:30:00Z'), 15)).toBe(true);
    expect(isAlignedToInterval(new Date('2024-01-15T10:45:00Z'), 15)).toBe(true);
  });

  it('should return false for unaligned times', () => {
    expect(isAlignedToInterval(new Date('2024-01-15T10:01:00Z'), 15)).toBe(false);
    expect(isAlignedToInterval(new Date('2024-01-15T10:14:00Z'), 15)).toBe(false);
    expect(isAlignedToInterval(new Date('2024-01-15T10:37:00Z'), 15)).toBe(false);
  });
});

describe('overlaps', () => {
  it('should detect overlapping intervals', () => {
    const a = { start: new Date('2024-01-15T10:00:00Z'), end: new Date('2024-01-15T12:00:00Z') };
    const b = { start: new Date('2024-01-15T11:00:00Z'), end: new Date('2024-01-15T13:00:00Z') };
    expect(overlaps(a, b)).toBe(true);
  });

  it('should not detect non-overlapping intervals', () => {
    const a = { start: new Date('2024-01-15T10:00:00Z'), end: new Date('2024-01-15T11:00:00Z') };
    const b = { start: new Date('2024-01-15T12:00:00Z'), end: new Date('2024-01-15T13:00:00Z') };
    expect(overlaps(a, b)).toBe(false);
  });

  it('should not consider adjacent intervals as overlapping', () => {
    const a = { start: new Date('2024-01-15T10:00:00Z'), end: new Date('2024-01-15T11:00:00Z') };
    const b = { start: new Date('2024-01-15T11:00:00Z'), end: new Date('2024-01-15T12:00:00Z') };
    expect(overlaps(a, b)).toBe(false);
  });

  it('should detect when one interval contains another', () => {
    const a = { start: new Date('2024-01-15T10:00:00Z'), end: new Date('2024-01-15T14:00:00Z') };
    const b = { start: new Date('2024-01-15T11:00:00Z'), end: new Date('2024-01-15T12:00:00Z') };
    expect(overlaps(a, b)).toBe(true);
  });
});

describe('blocksOverlap', () => {
  it('should detect overlapping blocks', () => {
    const a: AvailabilityBlock = {
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T12:00:00Z',
    };
    const b: AvailabilityBlock = {
      id: '2',
      startUtcIso: '2024-01-15T11:00:00Z',
      endUtcIso: '2024-01-15T13:00:00Z',
    };
    expect(blocksOverlap(a, b)).toBe(true);
  });
});

describe('isValidBlock', () => {
  it('should validate correct blocks', () => {
    expect(isValidBlock({
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T11:00:00Z',
    })).toBe(true);
  });

  it('should reject blocks where start equals end', () => {
    expect(isValidBlock({
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T10:00:00Z',
    })).toBe(false);
  });

  it('should reject blocks where start is after end', () => {
    expect(isValidBlock({
      id: '1',
      startUtcIso: '2024-01-15T11:00:00Z',
      endUtcIso: '2024-01-15T10:00:00Z',
    })).toBe(false);
  });

  it('should reject blocks with invalid dates', () => {
    expect(isValidBlock({
      id: '1',
      startUtcIso: 'invalid-date',
      endUtcIso: '2024-01-15T10:00:00Z',
    })).toBe(false);
  });
});

describe('getBlockDurationMinutes', () => {
  it('should calculate duration correctly', () => {
    expect(getBlockDurationMinutes({
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T11:00:00Z',
    })).toBe(60);

    expect(getBlockDurationMinutes({
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T10:30:00Z',
    })).toBe(30);
  });
});

describe('areAdjacent', () => {
  it('should detect adjacent blocks with no gap', () => {
    const a: AvailabilityBlock = {
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T11:00:00Z',
    };
    const b: AvailabilityBlock = {
      id: '2',
      startUtcIso: '2024-01-15T11:00:00Z',
      endUtcIso: '2024-01-15T12:00:00Z',
    };
    expect(areAdjacent(a, b, 0)).toBe(true);
  });

  it('should detect adjacent blocks with allowed gap', () => {
    const a: AvailabilityBlock = {
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T11:00:00Z',
    };
    const b: AvailabilityBlock = {
      id: '2',
      startUtcIso: '2024-01-15T11:15:00Z',
      endUtcIso: '2024-01-15T12:00:00Z',
    };
    expect(areAdjacent(a, b, 15)).toBe(true);
    expect(areAdjacent(a, b, 0)).toBe(false);
  });

  it('should not detect non-adjacent blocks', () => {
    const a: AvailabilityBlock = {
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T11:00:00Z',
    };
    const b: AvailabilityBlock = {
      id: '2',
      startUtcIso: '2024-01-15T13:00:00Z',
      endUtcIso: '2024-01-15T14:00:00Z',
    };
    expect(areAdjacent(a, b, 0)).toBe(false);
  });
});

describe('mergeBlocks', () => {
  it('should merge two adjacent blocks', () => {
    const a: AvailabilityBlock = {
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T11:00:00Z',
    };
    const b: AvailabilityBlock = {
      id: '2',
      startUtcIso: '2024-01-15T11:00:00Z',
      endUtcIso: '2024-01-15T12:00:00Z',
    };
    const merged = mergeBlocks(a, b);
    expect(merged.startUtcIso).toBe('2024-01-15T10:00:00.000Z');
    expect(merged.endUtcIso).toBe('2024-01-15T12:00:00.000Z');
    expect(merged.id).toBe('1'); // Keeps first block's ID
  });
});

describe('mergeAdjacent', () => {
  it('should merge adjacent blocks', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T11:00:00Z' },
      { id: '2', startUtcIso: '2024-01-15T11:00:00Z', endUtcIso: '2024-01-15T12:00:00Z' },
    ];
    const merged = mergeAdjacent(blocks);
    expect(merged).toHaveLength(1);
    expect(merged[0].startUtcIso).toBe('2024-01-15T10:00:00.000Z');
    expect(merged[0].endUtcIso).toBe('2024-01-15T12:00:00.000Z');
  });

  it('should not merge non-adjacent blocks', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T11:00:00Z' },
      { id: '2', startUtcIso: '2024-01-15T14:00:00Z', endUtcIso: '2024-01-15T15:00:00Z' },
    ];
    const merged = mergeAdjacent(blocks);
    expect(merged).toHaveLength(2);
  });

  it('should handle unsorted input', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '2', startUtcIso: '2024-01-15T11:00:00Z', endUtcIso: '2024-01-15T12:00:00Z' },
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T11:00:00Z' },
    ];
    const merged = mergeAdjacent(blocks);
    expect(merged).toHaveLength(1);
    expect(merged[0].startUtcIso).toBe('2024-01-15T10:00:00.000Z');
    expect(merged[0].endUtcIso).toBe('2024-01-15T12:00:00.000Z');
  });

  it('should merge overlapping blocks', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T12:00:00Z' },
      { id: '2', startUtcIso: '2024-01-15T11:00:00Z', endUtcIso: '2024-01-15T13:00:00Z' },
    ];
    const merged = mergeAdjacent(blocks);
    expect(merged).toHaveLength(1);
    expect(merged[0].startUtcIso).toBe('2024-01-15T10:00:00.000Z');
    expect(merged[0].endUtcIso).toBe('2024-01-15T13:00:00.000Z');
  });

  it('should return empty array for empty input', () => {
    expect(mergeAdjacent([])).toEqual([]);
  });
});

describe('normalizeBlocks', () => {
  it('should normalize blocks correctly', () => {
    const blocks: AvailabilityBlock[] = [
      // Unaligned times that will be snapped
      { id: '1', startUtcIso: '2024-01-15T10:07:00Z', endUtcIso: '2024-01-15T11:22:00Z' },
    ];

    const normalized = normalizeBlocks(blocks);
    expect(normalized).toHaveLength(1);
    // Start rounded up: 10:07 -> 10:15
    // End rounded down: 11:22 -> 11:15
    expect(normalized[0].startUtcIso).toBe('2024-01-15T10:15:00.000Z');
    expect(normalized[0].endUtcIso).toBe('2024-01-15T11:15:00.000Z');
  });

  it('should filter out invalid blocks', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T11:00:00Z', endUtcIso: '2024-01-15T10:00:00Z' }, // Invalid
      { id: '2', startUtcIso: '2024-01-15T12:00:00Z', endUtcIso: '2024-01-15T13:00:00Z' }, // Valid
    ];

    const normalized = normalizeBlocks(blocks);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe('2');
  });

  it('should filter out blocks that become invalid after snapping', () => {
    const blocks: AvailabilityBlock[] = [
      // After snapping: 10:15 -> 10:15 (zero duration)
      { id: '1', startUtcIso: '2024-01-15T10:01:00Z', endUtcIso: '2024-01-15T10:14:00Z' },
    ];

    const normalized = normalizeBlocks(blocks);
    expect(normalized).toHaveLength(0);
  });

  it('should merge adjacent blocks', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T11:00:00Z' },
      { id: '2', startUtcIso: '2024-01-15T11:00:00Z', endUtcIso: '2024-01-15T12:00:00Z' },
    ];

    const normalized = normalizeBlocks(blocks);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].startUtcIso).toBe('2024-01-15T10:00:00.000Z');
    expect(normalized[0].endUtcIso).toBe('2024-01-15T12:00:00.000Z');
  });

  it('should filter blocks shorter than minimum duration', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T10:10:00Z' }, // 10 min
      { id: '2', startUtcIso: '2024-01-15T12:00:00Z', endUtcIso: '2024-01-15T13:00:00Z' }, // 60 min
    ];

    const normalized = normalizeBlocks(blocks, { minDurationMinutes: 30 });
    expect(normalized).toHaveLength(1);
    expect(normalized[0].id).toBe('2');
  });
});

describe('subtractBusy', () => {
  it('should subtract busy time from blocks', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T14:00:00Z' },
    ];
    const busy = [
      { start: new Date('2024-01-15T11:00:00Z'), end: new Date('2024-01-15T12:00:00Z') },
    ];

    const result = subtractBusy(blocks, busy);
    expect(result).toHaveLength(2);
    // Before busy
    expect(result[0].startUtcIso).toBe('2024-01-15T10:00:00.000Z');
    expect(result[0].endUtcIso).toBe('2024-01-15T11:00:00.000Z');
    // After busy
    expect(result[1].startUtcIso).toBe('2024-01-15T12:00:00.000Z');
    expect(result[1].endUtcIso).toBe('2024-01-15T14:00:00.000Z');
  });

  it('should handle no overlap', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T11:00:00Z' },
    ];
    const busy = [
      { start: new Date('2024-01-15T14:00:00Z'), end: new Date('2024-01-15T15:00:00Z') },
    ];

    const result = subtractBusy(blocks, busy);
    expect(result).toHaveLength(1);
    expect(result[0].startUtcIso).toBe('2024-01-15T10:00:00.000Z');
    expect(result[0].endUtcIso).toBe('2024-01-15T11:00:00.000Z');
  });

  it('should handle empty busy list', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T11:00:00Z' },
    ];

    const result = subtractBusy(blocks, []);
    expect(result).toEqual(blocks);
  });

  it('should handle completely blocked time', () => {
    const blocks: AvailabilityBlock[] = [
      { id: '1', startUtcIso: '2024-01-15T10:00:00Z', endUtcIso: '2024-01-15T11:00:00Z' },
    ];
    const busy = [
      { start: new Date('2024-01-15T09:00:00Z'), end: new Date('2024-01-15T12:00:00Z') },
    ];

    const result = subtractBusy(blocks, busy);
    expect(result).toHaveLength(0);
  });
});

describe('toApiFormat / fromApiFormat', () => {
  it('should convert to API format', () => {
    const block: AvailabilityBlock = {
      id: '1',
      startUtcIso: '2024-01-15T10:00:00Z',
      endUtcIso: '2024-01-15T11:00:00Z',
    };
    const api = toApiFormat(block);
    expect(api.startAt).toBe('2024-01-15T10:00:00Z');
    expect(api.endAt).toBe('2024-01-15T11:00:00Z');
  });

  it('should convert from API format', () => {
    const api = {
      id: '1',
      startAt: '2024-01-15T10:00:00Z',
      endAt: '2024-01-15T11:00:00Z',
    };
    const block = fromApiFormat(api);
    expect(block.id).toBe('1');
    expect(block.startUtcIso).toBe('2024-01-15T10:00:00Z');
    expect(block.endUtcIso).toBe('2024-01-15T11:00:00Z');
  });

  it('should generate ID if not provided', () => {
    const api = {
      startAt: '2024-01-15T10:00:00Z',
      endAt: '2024-01-15T11:00:00Z',
    };
    const block = fromApiFormat(api, 5);
    expect(block.id).toBe('block-5');
  });
});

describe('generateBlockId', () => {
  it('should generate unique IDs', () => {
    const id1 = generateBlockId();
    const id2 = generateBlockId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^block-\d+-[a-z0-9]+$/);
  });
});
