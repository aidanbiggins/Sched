/**
 * Analytics Types for M12
 * Defines types for scheduling analytics and reporting
 */

import { InterviewType, SchedulingRequestStatus, BookingStatus } from '@/types/scheduling';

// ============================================
// Time Periods
// ============================================

export type AnalyticsPeriod = '7d' | '30d' | '90d' | 'all';

export interface DateRange {
  start: Date;
  end: Date;
}

// ============================================
// Booking Metrics
// ============================================

export interface BookingMetrics {
  total: number;
  byStatus: {
    pending: number;
    booked: number;
    rescheduled: number;
    cancelled: number;
    expired: number;
  };
  byInterviewType: {
    phone_screen: number;
    hm_screen: number;
    onsite: number;
    final: number;
  };
  bookingRate: number; // 0-1, booked / total
}

// ============================================
// Time-to-Schedule Metrics
// ============================================

export interface TimeToScheduleDistribution {
  under24h: number;
  '1to3d': number;
  '3to7d': number;
  over7d: number;
}

export interface TimeToScheduleMetrics {
  averageHours: number | null;
  medianHours: number | null;
  distribution: TimeToScheduleDistribution;
}

// ============================================
// Cancellation Metrics
// ============================================

export interface CancellationMetrics {
  cancellationRate: number; // cancelled / total booked
  rescheduleRate: number;   // rescheduled / total booked
  cancellationReasons: Record<string, number>;
}

// ============================================
// Engagement Metrics
// ============================================

export interface EngagementMetrics {
  linkClickRate: number; // slots_viewed / link_created
  linksCreated: number;
  slotsViewed: number;
}

// ============================================
// Aggregated Response
// ============================================

export interface AnalyticsResponse {
  period: AnalyticsPeriod;
  periodStart: string; // ISO date
  periodEnd: string;   // ISO date

  bookingMetrics: BookingMetrics;
  timeToSchedule: TimeToScheduleMetrics;
  cancellationMetrics: CancellationMetrics;
  engagement: EngagementMetrics;
}

// ============================================
// Raw Data for Aggregation
// ============================================

export interface SchedulingRequestRaw {
  id: string;
  status: SchedulingRequestStatus;
  interviewType: InterviewType;
  createdAt: Date;
  createdBy: string | null;
}

export interface BookingRaw {
  id: string;
  requestId: string | null;
  status: BookingStatus;
  bookedAt: Date;
  cancelledAt: Date | null;
  cancellationReason: string | null;
}

export interface AuditLogRaw {
  id: string;
  requestId: string | null;
  action: string;
  createdAt: Date;
}

// ============================================
// Database Aggregation Results
// ============================================

export interface StatusCount {
  status: string;
  count: number;
}

export interface InterviewTypeCount {
  interviewType: InterviewType;
  count: number;
}

export interface TimeToScheduleRaw {
  requestId: string;
  createdAt: Date;
  bookedAt: Date;
}

export interface CancellationReasonCount {
  reason: string | null;
  count: number;
}

export interface AuditActionCount {
  action: string;
  count: number;
}

// ============================================
// CSV Export
// ============================================

export interface AnalyticsExportRow {
  metric: string;
  value: string | number;
  period: string;
  periodStart: string;
  periodEnd: string;
}
