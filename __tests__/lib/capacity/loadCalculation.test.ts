/**
 * Tests for Load Calculation Service
 * M15: Capacity Planning
 */

import {
  getWeekStart,
  getWeekEnd,
} from '@/lib/capacity/loadCalculation';

describe('Load Calculation Utilities', () => {
  describe('getWeekStart', () => {
    it('should return Monday for a mid-week date', () => {
      // Wednesday Jan 15, 2026
      const date = new Date('2026-01-15T12:00:00Z');
      const weekStart = getWeekStart(date);

      expect(weekStart.getUTCDay()).toBe(1); // Monday
      expect(weekStart.getUTCDate()).toBe(12); // Jan 12
      expect(weekStart.getUTCHours()).toBe(0);
      expect(weekStart.getUTCMinutes()).toBe(0);
    });

    it('should return the same Monday for a Monday date', () => {
      // Monday Jan 12, 2026
      const date = new Date('2026-01-12T12:00:00Z');
      const weekStart = getWeekStart(date);

      expect(weekStart.getUTCDay()).toBe(1); // Monday
      expect(weekStart.getUTCDate()).toBe(12); // Same day
    });

    it('should return previous Monday for a Sunday date', () => {
      // Sunday Jan 18, 2026
      const date = new Date('2026-01-18T12:00:00Z');
      const weekStart = getWeekStart(date);

      expect(weekStart.getUTCDay()).toBe(1); // Monday
      expect(weekStart.getUTCDate()).toBe(12); // Previous Monday
    });
  });

  describe('getWeekEnd', () => {
    it('should return Sunday for a mid-week date', () => {
      // Wednesday Jan 15, 2026
      const date = new Date('2026-01-15T12:00:00Z');
      const weekEnd = getWeekEnd(date);

      expect(weekEnd.getUTCDay()).toBe(0); // Sunday
      expect(weekEnd.getUTCDate()).toBe(18); // Jan 18
      expect(weekEnd.getUTCHours()).toBe(23);
      expect(weekEnd.getUTCMinutes()).toBe(59);
    });

    it('should return the same Sunday for a Sunday date', () => {
      // Sunday Jan 18, 2026
      const date = new Date('2026-01-18T12:00:00Z');
      const weekEnd = getWeekEnd(date);

      expect(weekEnd.getUTCDay()).toBe(0); // Sunday
      expect(weekEnd.getUTCDate()).toBe(18); // Same day
    });
  });

  describe('Week Span', () => {
    it('should return a 7-day span', () => {
      const date = new Date('2026-01-15T12:00:00Z');
      const weekStart = getWeekStart(date);
      const weekEnd = getWeekEnd(date);

      // weekEnd is Sunday 23:59:59.999, weekStart is Monday 00:00:00.000
      // That's 6 days + 23 hours + 59 minutes which rounds to 7
      const daysDiff = Math.round(
        (weekEnd.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000)
      );
      expect(daysDiff).toBe(7); // Monday 00:00 to Sunday 23:59 = ~7 days
    });
  });
});
