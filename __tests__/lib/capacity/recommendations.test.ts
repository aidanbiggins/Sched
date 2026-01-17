/**
 * Tests for Recommendations Engine
 * M15: Capacity Planning
 */

import {
  getPriorityColor,
  getRecommendationTypeLabel,
} from '@/lib/capacity/recommendationsEngine';
import type { RecommendationPriority, RecommendationType } from '@/types/capacity';

describe('Recommendations Engine Utilities', () => {
  describe('getPriorityColor', () => {
    it('should return red for critical priority', () => {
      expect(getPriorityColor('critical')).toBe('red');
    });

    it('should return amber for high priority', () => {
      expect(getPriorityColor('high')).toBe('amber');
    });

    it('should return yellow for medium priority', () => {
      expect(getPriorityColor('medium')).toBe('yellow');
    });

    it('should return slate for low priority', () => {
      expect(getPriorityColor('low')).toBe('slate');
    });

    it('should return slate for unknown priority', () => {
      expect(getPriorityColor('unknown' as RecommendationPriority)).toBe('slate');
    });
  });

  describe('getRecommendationTypeLabel', () => {
    it('should return "Over Capacity" for interviewer_over_capacity', () => {
      expect(getRecommendationTypeLabel('interviewer_over_capacity')).toBe('Over Capacity');
    });

    it('should return "At Capacity" for interviewer_at_capacity', () => {
      expect(getRecommendationTypeLabel('interviewer_at_capacity')).toBe('At Capacity');
    });

    it('should return "Unbalanced Load" for unbalanced_load', () => {
      expect(getRecommendationTypeLabel('unbalanced_load')).toBe('Unbalanced Load');
    });

    it('should return "Burnout Risk" for interviewer_burnout_risk', () => {
      expect(getRecommendationTypeLabel('interviewer_burnout_risk')).toBe('Burnout Risk');
    });

    it('should return "Team Alert" for capacity_alert_org', () => {
      expect(getRecommendationTypeLabel('capacity_alert_org')).toBe('Team Alert');
    });

    it('should return "Inactive" for interviewer_inactive', () => {
      expect(getRecommendationTypeLabel('interviewer_inactive')).toBe('Inactive');
    });

    it('should return the type itself for unknown types', () => {
      const unknownType = 'unknown_type' as RecommendationType;
      expect(getRecommendationTypeLabel(unknownType)).toBe('unknown_type');
    });
  });
});
