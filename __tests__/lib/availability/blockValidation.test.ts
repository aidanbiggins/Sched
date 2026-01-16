/**
 * Tests for Block Validation and Normalization
 */

import {
  validateAndNormalizeBlocks,
  roundUpTo15Minutes,
  roundDownTo15Minutes,
  isAlignedTo15Minutes,
  InputBlock,
  ValidationOptions,
} from '@/lib/availability/blockValidation';

describe('roundUpTo15Minutes', () => {
  it('should not change already aligned times', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    expect(roundUpTo15Minutes(date).toISOString()).toBe('2024-01-15T10:00:00.000Z');
  });

  it('should round up 10:01 to 10:15', () => {
    const date = new Date('2024-01-15T10:01:00Z');
    expect(roundUpTo15Minutes(date).toISOString()).toBe('2024-01-15T10:15:00.000Z');
  });

  it('should round up 10:14 to 10:15', () => {
    const date = new Date('2024-01-15T10:14:00Z');
    expect(roundUpTo15Minutes(date).toISOString()).toBe('2024-01-15T10:15:00.000Z');
  });

  it('should round up 10:16 to 10:30', () => {
    const date = new Date('2024-01-15T10:16:00Z');
    expect(roundUpTo15Minutes(date).toISOString()).toBe('2024-01-15T10:30:00.000Z');
  });
});

describe('roundDownTo15Minutes', () => {
  it('should not change already aligned times', () => {
    const date = new Date('2024-01-15T10:00:00Z');
    expect(roundDownTo15Minutes(date).toISOString()).toBe('2024-01-15T10:00:00.000Z');
  });

  it('should round down 10:14 to 10:00', () => {
    const date = new Date('2024-01-15T10:14:00Z');
    expect(roundDownTo15Minutes(date).toISOString()).toBe('2024-01-15T10:00:00.000Z');
  });

  it('should round down 10:16 to 10:15', () => {
    const date = new Date('2024-01-15T10:16:00Z');
    expect(roundDownTo15Minutes(date).toISOString()).toBe('2024-01-15T10:15:00.000Z');
  });
});

describe('isAlignedTo15Minutes', () => {
  it('should return true for aligned times', () => {
    expect(isAlignedTo15Minutes(new Date('2024-01-15T10:00:00Z'))).toBe(true);
    expect(isAlignedTo15Minutes(new Date('2024-01-15T10:15:00Z'))).toBe(true);
    expect(isAlignedTo15Minutes(new Date('2024-01-15T10:30:00Z'))).toBe(true);
    expect(isAlignedTo15Minutes(new Date('2024-01-15T10:45:00Z'))).toBe(true);
  });

  it('should return false for unaligned times', () => {
    expect(isAlignedTo15Minutes(new Date('2024-01-15T10:01:00Z'))).toBe(false);
    expect(isAlignedTo15Minutes(new Date('2024-01-15T10:14:00Z'))).toBe(false);
    expect(isAlignedTo15Minutes(new Date('2024-01-15T10:37:00Z'))).toBe(false);
  });
});

describe('validateAndNormalizeBlocks', () => {
  const defaultOptions: ValidationOptions = {
    windowStart: new Date('2024-01-15T00:00:00Z'),
    windowEnd: new Date('2024-01-22T00:00:00Z'),
    minTotalMinutes: 180, // 3 hours
    minBlocks: 5,
    durationMinutes: 60, // 1 hour interview
  };

  it('should validate valid blocks', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-15T09:00:00Z', endAt: '2024-01-15T11:00:00Z' },
      { startAt: '2024-01-16T09:00:00Z', endAt: '2024-01-16T11:00:00Z' },
      { startAt: '2024-01-17T09:00:00Z', endAt: '2024-01-17T11:00:00Z' },
      { startAt: '2024-01-18T09:00:00Z', endAt: '2024-01-18T11:00:00Z' },
      { startAt: '2024-01-19T09:00:00Z', endAt: '2024-01-19T11:00:00Z' },
    ];

    const result = validateAndNormalizeBlocks(blocks, defaultOptions);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.normalizedBlocks).toHaveLength(5);
    expect(result.totalMinutes).toBe(600); // 5 blocks x 2 hours = 600 minutes
  });

  it('should reject blocks with invalid dates', () => {
    const blocks: InputBlock[] = [
      { startAt: 'invalid-date', endAt: '2024-01-15T11:00:00Z' },
    ];

    const result = validateAndNormalizeBlocks(blocks, defaultOptions);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Block 1: Invalid start date');
  });

  it('should reject blocks where start is after end', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-15T11:00:00Z', endAt: '2024-01-15T09:00:00Z' },
    ];

    const result = validateAndNormalizeBlocks(blocks, defaultOptions);

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Block 1: Start time must be before end time');
  });

  it('should round times to 15-minute boundaries', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-15T09:07:00Z', endAt: '2024-01-15T11:22:00Z' },
    ];

    const options: ValidationOptions = {
      ...defaultOptions,
      minBlocks: 1,
      minTotalMinutes: 60,
    };

    const result = validateAndNormalizeBlocks(blocks, options);

    expect(result.valid).toBe(true);
    // Start rounded up: 09:07 -> 09:15
    // End rounded down: 11:22 -> 11:15
    expect(result.normalizedBlocks[0].startAt.toISOString()).toBe('2024-01-15T09:15:00.000Z');
    expect(result.normalizedBlocks[0].endAt.toISOString()).toBe('2024-01-15T11:15:00.000Z');
  });

  it('should reject overlapping blocks', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-15T09:00:00Z', endAt: '2024-01-15T11:00:00Z' },
      { startAt: '2024-01-15T10:00:00Z', endAt: '2024-01-15T12:00:00Z' },
    ];

    const result = validateAndNormalizeBlocks(blocks, defaultOptions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('overlap'))).toBe(true);
  });

  it('should merge adjacent blocks', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-15T09:00:00Z', endAt: '2024-01-15T10:00:00Z' },
      { startAt: '2024-01-15T10:00:00Z', endAt: '2024-01-15T11:00:00Z' },
    ];

    const options: ValidationOptions = {
      ...defaultOptions,
      minBlocks: 1,
      minTotalMinutes: 60,
    };

    const result = validateAndNormalizeBlocks(blocks, options);

    expect(result.valid).toBe(true);
    expect(result.normalizedBlocks).toHaveLength(1);
    expect(result.normalizedBlocks[0].startAt.toISOString()).toBe('2024-01-15T09:00:00.000Z');
    expect(result.normalizedBlocks[0].endAt.toISOString()).toBe('2024-01-15T11:00:00.000Z');
    expect(result.totalMinutes).toBe(120);
  });

  it('should reject blocks outside the window', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-14T09:00:00Z', endAt: '2024-01-14T11:00:00Z' }, // Before window
    ];

    const result = validateAndNormalizeBlocks(blocks, defaultOptions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('before the scheduling window'))).toBe(true);
  });

  it('should reject when minimum blocks not met', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-15T09:00:00Z', endAt: '2024-01-15T12:00:00Z' },
      { startAt: '2024-01-16T09:00:00Z', endAt: '2024-01-16T12:00:00Z' },
    ];

    const result = validateAndNormalizeBlocks(blocks, defaultOptions);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least 5 availability blocks'))).toBe(true);
  });

  it('should reject when minimum total minutes not met', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-15T09:00:00Z', endAt: '2024-01-15T10:00:00Z' },
      { startAt: '2024-01-16T09:00:00Z', endAt: '2024-01-16T10:00:00Z' },
      { startAt: '2024-01-17T09:00:00Z', endAt: '2024-01-17T10:00:00Z' },
      { startAt: '2024-01-18T09:00:00Z', endAt: '2024-01-18T10:00:00Z' },
      { startAt: '2024-01-19T09:00:00Z', endAt: '2024-01-19T10:00:00Z' },
    ];

    const options: ValidationOptions = {
      ...defaultOptions,
      minTotalMinutes: 360, // 6 hours (but we only have 5)
    };

    const result = validateAndNormalizeBlocks(blocks, options);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('at least 360 minutes'))).toBe(true);
  });

  it('should filter out blocks shorter than interview duration', () => {
    const blocks: InputBlock[] = [
      { startAt: '2024-01-15T09:00:00Z', endAt: '2024-01-15T09:30:00Z' }, // 30 min, too short
      { startAt: '2024-01-16T09:00:00Z', endAt: '2024-01-16T11:00:00Z' }, // 2 hours, valid
    ];

    const options: ValidationOptions = {
      ...defaultOptions,
      minBlocks: 1,
      minTotalMinutes: 60,
      durationMinutes: 60, // 1 hour interview
    };

    const result = validateAndNormalizeBlocks(blocks, options);

    expect(result.valid).toBe(true);
    expect(result.normalizedBlocks).toHaveLength(1);
    expect(result.normalizedBlocks[0].startAt.toISOString()).toBe('2024-01-16T09:00:00.000Z');
  });
});
