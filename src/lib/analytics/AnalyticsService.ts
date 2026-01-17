/**
 * Analytics Service for M12
 * Core metrics computation for scheduling analytics
 */

import {
  AnalyticsPeriod,
  AnalyticsResponse,
  BookingMetrics,
  TimeToScheduleMetrics,
  TimeToScheduleDistribution,
  CancellationMetrics,
  EngagementMetrics,
  DateRange,
} from './types';
import {
  getAnalyticsData,
  getTimeToScheduleData,
  getAuditActionCounts,
} from '@/lib/db';

// ============================================
// Period Helpers
// ============================================

export function getDateRangeForPeriod(period: AnalyticsPeriod): DateRange {
  const end = new Date();
  let start: Date;

  switch (period) {
    case '7d':
      start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      start = new Date(end.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case 'all':
      start = new Date(0); // Beginning of time
      break;
    default:
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { start, end };
}

// ============================================
// Metrics Computation
// ============================================

function computeBookingMetrics(
  statusCounts: Record<string, number>,
  interviewTypeCounts: Record<string, number>
): BookingMetrics {
  const pending = statusCounts['pending'] || 0;
  const booked = statusCounts['booked'] || 0;
  const rescheduled = statusCounts['rescheduled'] || 0;
  const cancelled = statusCounts['cancelled'] || 0;
  const expired = statusCounts['expired'] || 0;

  const total = pending + booked + rescheduled + cancelled + expired;
  const successfulBookings = booked + rescheduled;
  const bookingRate = total > 0 ? successfulBookings / total : 0;

  return {
    total,
    byStatus: {
      pending,
      booked,
      rescheduled,
      cancelled,
      expired,
    },
    byInterviewType: {
      phone_screen: interviewTypeCounts['phone_screen'] || 0,
      hm_screen: interviewTypeCounts['hm_screen'] || 0,
      onsite: interviewTypeCounts['onsite'] || 0,
      final: interviewTypeCounts['final'] || 0,
    },
    bookingRate,
  };
}

function computeTimeToScheduleMetrics(
  timeToScheduleHours: number[]
): TimeToScheduleMetrics {
  if (timeToScheduleHours.length === 0) {
    return {
      averageHours: null,
      medianHours: null,
      distribution: {
        under24h: 0,
        '1to3d': 0,
        '3to7d': 0,
        over7d: 0,
      },
    };
  }

  // Sort for median calculation
  const sorted = [...timeToScheduleHours].sort((a, b) => a - b);
  const averageHours = sorted.reduce((a, b) => a + b, 0) / sorted.length;
  const midIndex = Math.floor(sorted.length / 2);
  const medianHours =
    sorted.length % 2 === 0
      ? (sorted[midIndex - 1] + sorted[midIndex]) / 2
      : sorted[midIndex];

  // Compute distribution
  const distribution: TimeToScheduleDistribution = {
    under24h: 0,
    '1to3d': 0,
    '3to7d': 0,
    over7d: 0,
  };

  for (const hours of timeToScheduleHours) {
    if (hours < 24) {
      distribution.under24h++;
    } else if (hours < 72) {
      // 3 days
      distribution['1to3d']++;
    } else if (hours < 168) {
      // 7 days
      distribution['3to7d']++;
    } else {
      distribution.over7d++;
    }
  }

  return {
    averageHours: Math.round(averageHours * 10) / 10,
    medianHours: Math.round(medianHours * 10) / 10,
    distribution,
  };
}

function computeCancellationMetrics(
  bookingStatusCounts: Record<string, number>,
  cancellationReasons: Record<string, number>
): CancellationMetrics {
  const confirmed = bookingStatusCounts['confirmed'] || 0;
  const rescheduled = bookingStatusCounts['rescheduled'] || 0;
  const cancelled = bookingStatusCounts['cancelled'] || 0;
  const totalBooked = confirmed + rescheduled + cancelled;

  return {
    cancellationRate: totalBooked > 0 ? cancelled / totalBooked : 0,
    rescheduleRate: totalBooked > 0 ? rescheduled / totalBooked : 0,
    cancellationReasons,
  };
}

function computeEngagementMetrics(
  auditActionCounts: Record<string, number>
): EngagementMetrics {
  const linksCreated = auditActionCounts['link_created'] || 0;
  const slotsViewed = auditActionCounts['slots_viewed'] || 0;

  return {
    linkClickRate: linksCreated > 0 ? slotsViewed / linksCreated : 0,
    linksCreated,
    slotsViewed,
  };
}

// ============================================
// Main Service Function
// ============================================

export async function getAnalytics(
  period: AnalyticsPeriod,
  userId?: string
): Promise<AnalyticsResponse> {
  const { start, end } = getDateRangeForPeriod(period);

  // Fetch all analytics data from database
  const [analyticsData, timeToScheduleData, auditActionCounts] = await Promise.all([
    getAnalyticsData(start, end, userId),
    getTimeToScheduleData(start, end, userId),
    getAuditActionCounts(start, end, userId),
  ]);

  // Compute metrics
  const bookingMetrics = computeBookingMetrics(
    analyticsData.statusCounts,
    analyticsData.interviewTypeCounts
  );

  const timeToScheduleMetrics = computeTimeToScheduleMetrics(timeToScheduleData);

  const cancellationMetrics = computeCancellationMetrics(
    analyticsData.bookingStatusCounts,
    analyticsData.cancellationReasons
  );

  const engagementMetrics = computeEngagementMetrics(auditActionCounts);

  return {
    period,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
    bookingMetrics,
    timeToSchedule: timeToScheduleMetrics,
    cancellationMetrics,
    engagement: engagementMetrics,
  };
}

// ============================================
// CSV Export
// ============================================

export function analyticsToCSV(analytics: AnalyticsResponse): string {
  const rows: string[] = [];

  // Header
  rows.push('Metric,Value,Period,Period Start,Period End');

  const addRow = (metric: string, value: string | number) => {
    // Escape commas in values
    const escapedValue = typeof value === 'string' && value.includes(',')
      ? `"${value}"`
      : value.toString();
    rows.push(
      `${metric},${escapedValue},${analytics.period},${analytics.periodStart},${analytics.periodEnd}`
    );
  };

  // Booking Metrics
  addRow('Total Requests', analytics.bookingMetrics.total);
  addRow('Booking Rate', `${(analytics.bookingMetrics.bookingRate * 100).toFixed(1)}%`);
  addRow('Status: Pending', analytics.bookingMetrics.byStatus.pending);
  addRow('Status: Booked', analytics.bookingMetrics.byStatus.booked);
  addRow('Status: Rescheduled', analytics.bookingMetrics.byStatus.rescheduled);
  addRow('Status: Cancelled', analytics.bookingMetrics.byStatus.cancelled);
  addRow('Status: Expired', analytics.bookingMetrics.byStatus.expired);
  addRow('Interview Type: Phone Screen', analytics.bookingMetrics.byInterviewType.phone_screen);
  addRow('Interview Type: HM Screen', analytics.bookingMetrics.byInterviewType.hm_screen);
  addRow('Interview Type: Onsite', analytics.bookingMetrics.byInterviewType.onsite);
  addRow('Interview Type: Final', analytics.bookingMetrics.byInterviewType.final);

  // Time to Schedule
  addRow(
    'Avg Time-to-Schedule (hours)',
    analytics.timeToSchedule.averageHours ?? 'N/A'
  );
  addRow(
    'Median Time-to-Schedule (hours)',
    analytics.timeToSchedule.medianHours ?? 'N/A'
  );
  addRow('Time Dist: Under 24h', analytics.timeToSchedule.distribution.under24h);
  addRow('Time Dist: 1-3 days', analytics.timeToSchedule.distribution['1to3d']);
  addRow('Time Dist: 3-7 days', analytics.timeToSchedule.distribution['3to7d']);
  addRow('Time Dist: Over 7 days', analytics.timeToSchedule.distribution.over7d);

  // Cancellation Metrics
  addRow(
    'Cancellation Rate',
    `${(analytics.cancellationMetrics.cancellationRate * 100).toFixed(1)}%`
  );
  addRow(
    'Reschedule Rate',
    `${(analytics.cancellationMetrics.rescheduleRate * 100).toFixed(1)}%`
  );

  // Add cancellation reasons
  for (const [reason, count] of Object.entries(
    analytics.cancellationMetrics.cancellationReasons
  )) {
    addRow(`Cancel Reason: ${reason || 'Not specified'}`, count);
  }

  // Engagement Metrics
  addRow('Links Created', analytics.engagement.linksCreated);
  addRow('Slots Viewed', analytics.engagement.slotsViewed);
  addRow(
    'Link Click-Through Rate',
    `${(analytics.engagement.linkClickRate * 100).toFixed(1)}%`
  );

  return rows.join('\n');
}
