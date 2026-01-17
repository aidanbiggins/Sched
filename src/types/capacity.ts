/**
 * Capacity Planning Types
 * M15: Scheduling Intelligence & Capacity Planning
 */

import { InterviewType } from './scheduling';

// ============================================
// Interviewer Profile Types
// ============================================

export interface InterviewerProfile {
  id: string;
  userId: string | null;
  email: string;
  organizationId: string | null;

  // Capacity settings
  maxInterviewsPerWeek: number;
  maxInterviewsPerDay: number;
  maxConcurrentPerDay: number;
  bufferMinutes: number;

  // Preferences
  preferredTimes: Record<string, string[]>; // {"mon": ["09:00-12:00"], ...}
  blackoutDates: string[]; // ["2026-01-20", ...]
  interviewTypePreferences: InterviewType[];

  // Tags for matching
  tags: string[];
  skillAreas: string[];
  seniorityLevels: string[];

  // Status
  isActive: boolean;
  lastCapacityOverrideAt: Date | null;
  lastCapacityOverrideBy: string | null;

  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

export interface InterviewerProfileInput {
  email: string;
  organizationId?: string;
  userId?: string;
  maxInterviewsPerWeek?: number;
  maxInterviewsPerDay?: number;
  maxConcurrentPerDay?: number;
  bufferMinutes?: number;
  preferredTimes?: Record<string, string[]>;
  blackoutDates?: string[];
  interviewTypePreferences?: InterviewType[];
  tags?: string[];
  skillAreas?: string[];
  seniorityLevels?: string[];
  isActive?: boolean;
}

// ============================================
// Load Rollup Types
// ============================================

export interface InterviewerLoadRollup {
  id: string;
  interviewerProfileId: string;
  organizationId: string;

  // Time window
  weekStart: Date;
  weekEnd: Date;

  // Interview counts
  scheduledCount: number;
  completedCount: number;
  cancelledCount: number;
  rescheduledCount: number;

  // Load metrics
  utilizationPct: number;
  peakDayCount: number;
  avgDailyCount: number;

  // Breakdowns
  byInterviewType: Record<string, number>;
  byDayOfWeek: Record<string, number>;
  byHourOfDay: Record<string, number>;

  // Capacity alerts
  atCapacity: boolean;
  overCapacity: boolean;

  // Computation metadata
  computedAt: Date;
  computationDurationMs: number | null;
}

export interface LoadRollupInput {
  interviewerProfileId: string;
  organizationId: string;
  weekStart: Date;
  weekEnd: Date;
  scheduledCount: number;
  completedCount: number;
  cancelledCount: number;
  rescheduledCount: number;
  utilizationPct: number;
  peakDayCount: number;
  avgDailyCount: number;
  byInterviewType: Record<string, number>;
  byDayOfWeek: Record<string, number>;
  byHourOfDay: Record<string, number>;
  atCapacity: boolean;
  overCapacity: boolean;
  computationDurationMs?: number;
}

// ============================================
// Recommendation Types
// ============================================

export type RecommendationType =
  | 'interviewer_over_capacity'
  | 'interviewer_at_capacity'
  | 'unbalanced_load'
  | 'interviewer_burnout_risk'
  | 'no_availability'
  | 'limited_slots'
  | 'suboptimal_match'
  | 'preferred_time_conflict'
  | 'capacity_alert_org'
  | 'interviewer_inactive';

export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'low';

export type RecommendationStatus = 'active' | 'dismissed' | 'acted' | 'expired';

export interface SchedulingRecommendation {
  id: string;
  organizationId: string;
  schedulingRequestId: string | null;
  availabilityRequestId: string | null;

  // Recommendation details
  recommendationType: RecommendationType;
  priority: RecommendationPriority;

  // Evidence
  title: string;
  description: string;
  evidence: RecommendationEvidence;

  // Suggested action
  suggestedAction: string | null;
  actionData: Record<string, unknown> | null;

  // Status
  status: RecommendationStatus;
  dismissedAt: Date | null;
  dismissedBy: string | null;
  dismissedReason: string | null;
  actedAt: Date | null;
  actedBy: string | null;

  // TTL
  expiresAt: Date | null;

  // Metadata
  createdAt: Date;
}

export interface RecommendationEvidence {
  generatedAt: string;
  dataVersion: string;
  [key: string]: unknown;
}

export interface RecommendationInput {
  organizationId: string;
  schedulingRequestId?: string;
  availabilityRequestId?: string;
  recommendationType: RecommendationType;
  priority: RecommendationPriority;
  title: string;
  description: string;
  evidence: RecommendationEvidence;
  suggestedAction?: string;
  actionData?: Record<string, unknown>;
  expiresAt?: Date;
}

// ============================================
// Load Calculation Types
// ============================================

export interface LoadCalculationInput {
  interviewerProfileId: string;
  weekStart: Date;
  weekEnd: Date;
}

export interface LoadCalculationResult {
  scheduledCount: number;
  completedCount: number;
  cancelledCount: number;
  rescheduledCount: number;
  utilizationPct: number;
  peakDayCount: number;
  avgDailyCount: number;
  byInterviewType: Record<string, number>;
  byDayOfWeek: Record<string, number>;
  byHourOfDay: Record<string, number>;
  atCapacity: boolean;
  overCapacity: boolean;
}

// ============================================
// Enhanced Scoring Types
// ============================================

export interface InterviewerWithLoad {
  email: string;
  profile: InterviewerProfile | null;
  currentWeekUtilization: number;
  currentWeekScheduled: number;
  atCapacity: boolean;
  overCapacity: boolean;
}

export interface EnhancedSuggestionScore {
  // Existing factors
  availabilityScore: number;
  timelinessScore: number;
  timeOfDayScore: number;

  // New capacity factors
  loadBalanceScore: number;
  capacityHeadroomScore: number;
  preferenceMatchScore: number;

  // Total
  totalScore: number;

  // Rationale components
  rationale: string[];
}

// ============================================
// Capacity Dashboard Types
// ============================================

export interface CapacityOverview {
  organizationId: string;
  weekStart: Date;
  totalInterviewers: number;
  activeInterviewers: number;
  avgUtilization: number;
  atCapacityCount: number;
  overCapacityCount: number;
  totalScheduledThisWeek: number;
}

export interface InterviewerLoadSummary {
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
  } | null;
  trend: 'increasing' | 'stable' | 'decreasing';
}
