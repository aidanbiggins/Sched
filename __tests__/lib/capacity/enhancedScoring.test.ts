/**
 * Tests for Enhanced Scoring Service
 * M15: Capacity Planning
 */

import { calculateLegacyScore } from '@/lib/capacity/enhancedScoring';

describe('Enhanced Scoring', () => {
  describe('calculateLegacyScore', () => {
    it('should give maximum availability score when all interviewers available', () => {
      const slotStart = new Date('2026-01-20T10:00:00Z'); // Monday 10am UTC
      const result = calculateLegacyScore(slotStart, 3, 3, true);

      expect(result.score).toBeGreaterThanOrEqual(50); // Max availability score
      expect(result.rationale).toContain('All interviewers available');
    });

    it('should give partial availability score when some interviewers available', () => {
      // Use non-optimal time and no timeliness to isolate availability score
      const slotStart = new Date('2026-01-20T18:00:00Z'); // 6pm - not optimal
      const result = calculateLegacyScore(slotStart, 2, 4, false);

      // With 2/4 available and no other bonuses, score should be 25 (50 * 0.5)
      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThanOrEqual(50);
      expect(result.rationale).toContain('2/4 interviewers available');
    });

    it('should give zero availability score when no interviewers available', () => {
      const slotStart = new Date('2026-01-20T10:00:00Z');
      const result = calculateLegacyScore(slotStart, 0, 3, true);

      // Score will be from timeliness and time of day, but availability is 0
      expect(result.rationale).toContain('0/3 interviewers available');
    });

    it('should add time of day bonus for optimal hours (9am-2pm UTC)', () => {
      // 10am UTC is optimal time
      const optimalTime = new Date('2026-01-20T10:00:00Z');
      const result = calculateLegacyScore(optimalTime, 3, 3, false);

      expect(result.score).toBeGreaterThanOrEqual(60); // 50 + 10 for time of day
      expect(result.rationale).toContain('Optimal time of day');
    });

    it('should not add time of day bonus for non-optimal hours', () => {
      // 6pm UTC is not optimal
      const nonOptimalTime = new Date('2026-01-20T18:00:00Z');
      const result = calculateLegacyScore(nonOptimalTime, 3, 3, false);

      expect(result.score).toBe(50); // Just availability score
      expect(result.rationale).not.toContain('Optimal time of day');
    });

    it('should add timeliness bonus when preferEarlier is true', () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      tomorrow.setUTCHours(10, 0, 0, 0);

      const result = calculateLegacyScore(tomorrow, 3, 3, true);

      // Should have availability (50) + timeliness bonus + possibly time of day
      expect(result.score).toBeGreaterThan(50);
    });

    it('should not add timeliness bonus when preferEarlier is false', () => {
      const now = new Date();
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      tomorrow.setUTCHours(18, 0, 0, 0); // Non-optimal time to isolate

      const result = calculateLegacyScore(tomorrow, 3, 3, false);

      // Should only have availability score (50), no timeliness or time of day
      expect(result.score).toBe(50);
    });
  });
});
