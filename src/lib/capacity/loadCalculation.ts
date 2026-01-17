/**
 * Load Calculation Service
 * M15: Scheduling Intelligence & Capacity Planning
 *
 * Calculates interviewer load metrics for capacity planning.
 */

import {
  InterviewerProfile,
  LoadCalculationInput,
  LoadCalculationResult,
  LoadRollupInput,
  InterviewerWithLoad,
} from '@/types/capacity';
import {
  getBookingsInTimeRange,
  getSchedulingRequestById,
  getInterviewerProfileByEmail,
  getLoadRollupByProfileAndWeek,
  createInterviewerProfile,
} from '@/lib/db';
import { Booking, InterviewType } from '@/types/scheduling';

// Default capacity settings for auto-created profiles
const DEFAULT_MAX_INTERVIEWS_PER_WEEK = 10;
const DEFAULT_MAX_INTERVIEWS_PER_DAY = 3;

/**
 * Get the Monday (start) of the week for a given date (ISO week)
 */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday is 1, Sunday is 0
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the Sunday (end) of the week for a given date (ISO week)
 */
export function getWeekEnd(date: Date): Date {
  const monday = getWeekStart(date);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return sunday;
}

/**
 * Get the day of week key (mon, tue, wed, thu, fri, sat, sun)
 */
function getDayOfWeekKey(date: Date): string {
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  return days[date.getUTCDay()];
}

/**
 * Get the hour key (00, 01, ..., 23)
 */
function getHourKey(date: Date): string {
  return date.getUTCHours().toString().padStart(2, '0');
}

/**
 * Calculate load metrics for a single interviewer over a week
 */
export async function calculateWeeklyLoad(
  input: LoadCalculationInput
): Promise<LoadCalculationResult> {
  const { interviewerProfileId, weekStart, weekEnd } = input;

  // Get the profile to find the email and capacity settings
  const { getInterviewerProfileById } = await import('@/lib/db');
  const profile = await getInterviewerProfileById(interviewerProfileId);

  if (!profile) {
    throw new Error(`Interviewer profile not found: ${interviewerProfileId}`);
  }

  const email = profile.email;
  const maxPerWeek = profile.maxInterviewsPerWeek ?? DEFAULT_MAX_INTERVIEWS_PER_WEEK;

  // Get all bookings for this interviewer in the time window
  const allBookings = await getBookingsInTimeRange(weekStart, weekEnd, [email]);

  // Filter to get bookings where this specific interviewer is involved
  const interviewerBookings: Array<{
    booking: Booking;
    interviewType: InterviewType;
  }> = [];

  for (const booking of allBookings) {
    if (!booking.requestId) continue;

    const request = await getSchedulingRequestById(booking.requestId);
    if (!request) continue;

    // Check if this interviewer is in the request's interviewer list
    const isInvolved = request.interviewerEmails.some(
      (e) => e.toLowerCase() === email.toLowerCase()
    );

    if (isInvolved) {
      interviewerBookings.push({
        booking,
        interviewType: request.interviewType,
      });
    }
  }

  // Count by status
  let scheduledCount = 0;
  let completedCount = 0;
  let cancelledCount = 0;
  let rescheduledCount = 0;

  const now = new Date();
  const byInterviewType: Record<string, number> = {};
  const byDayOfWeek: Record<string, number> = {};
  const byHourOfDay: Record<string, number> = {};
  const dailyCounts: Record<string, number> = {};

  for (const { booking, interviewType } of interviewerBookings) {
    if (booking.status === 'cancelled') {
      cancelledCount++;
      continue;
    }

    if (booking.status === 'rescheduled') {
      rescheduledCount++;
      continue;
    }

    // Count as scheduled
    scheduledCount++;

    // Check if completed (past end time)
    if (booking.scheduledEnd < now) {
      completedCount++;
    }

    // Track by interview type
    byInterviewType[interviewType] = (byInterviewType[interviewType] || 0) + 1;

    // Track by day of week
    const dayKey = getDayOfWeekKey(booking.scheduledStart);
    byDayOfWeek[dayKey] = (byDayOfWeek[dayKey] || 0) + 1;

    // Track by hour
    const hourKey = getHourKey(booking.scheduledStart);
    byHourOfDay[hourKey] = (byHourOfDay[hourKey] || 0) + 1;

    // Track daily counts for peak calculation
    const dateKey = booking.scheduledStart.toISOString().split('T')[0];
    dailyCounts[dateKey] = (dailyCounts[dateKey] || 0) + 1;
  }

  // Calculate metrics
  const utilizationPct = maxPerWeek > 0
    ? Math.min(999, (scheduledCount / maxPerWeek) * 100)
    : 0;

  const dailyValues = Object.values(dailyCounts);
  const peakDayCount = dailyValues.length > 0 ? Math.max(...dailyValues) : 0;
  const avgDailyCount = dailyValues.length > 0
    ? dailyValues.reduce((a, b) => a + b, 0) / 5 // Assume 5 working days
    : 0;

  const atCapacity = utilizationPct >= 90;
  const overCapacity = utilizationPct > 100;

  return {
    scheduledCount,
    completedCount,
    cancelledCount,
    rescheduledCount,
    utilizationPct,
    peakDayCount,
    avgDailyCount,
    byInterviewType,
    byDayOfWeek,
    byHourOfDay,
    atCapacity,
    overCapacity,
  };
}

/**
 * Calculate load for the current week
 */
export async function calculateCurrentWeekLoad(
  interviewerProfileId: string
): Promise<LoadCalculationResult> {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  return calculateWeeklyLoad({
    interviewerProfileId,
    weekStart,
    weekEnd,
  });
}

/**
 * Get or create an interviewer profile for an email
 */
export async function getOrCreateInterviewerProfile(
  email: string,
  organizationId: string | null
): Promise<InterviewerProfile> {
  // Try to find existing profile
  const existing = await getInterviewerProfileByEmail(
    email,
    organizationId || undefined
  );

  if (existing) {
    return existing;
  }

  // Create a new profile with defaults
  return createInterviewerProfile({
    email,
    organizationId: organizationId || undefined,
    maxInterviewsPerWeek: DEFAULT_MAX_INTERVIEWS_PER_WEEK,
    maxInterviewsPerDay: DEFAULT_MAX_INTERVIEWS_PER_DAY,
    isActive: true,
  });
}

/**
 * Get interviewer load information for slot scoring
 */
export async function getInterviewerLoadForSlot(
  email: string,
  organizationId: string | null,
  slotDate: Date
): Promise<InterviewerWithLoad> {
  // Try to get profile
  let profile = await getInterviewerProfileByEmail(
    email,
    organizationId || undefined
  );

  // Calculate current week utilization
  const weekStart = getWeekStart(slotDate);
  const weekEnd = getWeekEnd(slotDate);

  let currentWeekUtilization = 0;
  let currentWeekScheduled = 0;
  let atCapacity = false;
  let overCapacity = false;

  if (profile) {
    // Try to get cached rollup first
    const rollup = await getLoadRollupByProfileAndWeek(profile.id, weekStart);

    if (rollup) {
      currentWeekUtilization = rollup.utilizationPct;
      currentWeekScheduled = rollup.scheduledCount;
      atCapacity = rollup.atCapacity;
      overCapacity = rollup.overCapacity;
    } else {
      // Calculate on-the-fly
      const load = await calculateWeeklyLoad({
        interviewerProfileId: profile.id,
        weekStart,
        weekEnd,
      });
      currentWeekUtilization = load.utilizationPct;
      currentWeekScheduled = load.scheduledCount;
      atCapacity = load.atCapacity;
      overCapacity = load.overCapacity;
    }
  }

  return {
    email,
    profile,
    currentWeekUtilization,
    currentWeekScheduled,
    atCapacity,
    overCapacity,
  };
}

/**
 * Build load rollup input from calculation result
 */
export function buildLoadRollupInput(
  interviewerProfileId: string,
  organizationId: string,
  weekStart: Date,
  weekEnd: Date,
  result: LoadCalculationResult,
  computationDurationMs?: number
): LoadRollupInput {
  return {
    interviewerProfileId,
    organizationId,
    weekStart,
    weekEnd,
    scheduledCount: result.scheduledCount,
    completedCount: result.completedCount,
    cancelledCount: result.cancelledCount,
    rescheduledCount: result.rescheduledCount,
    utilizationPct: result.utilizationPct,
    peakDayCount: result.peakDayCount,
    avgDailyCount: result.avgDailyCount,
    byInterviewType: result.byInterviewType,
    byDayOfWeek: result.byDayOfWeek,
    byHourOfDay: result.byHourOfDay,
    atCapacity: result.atCapacity,
    overCapacity: result.overCapacity,
    computationDurationMs,
  };
}

/**
 * Check if an interviewer would exceed daily capacity at a given time
 */
export async function wouldExceedDailyCapacity(
  email: string,
  organizationId: string | null,
  proposedSlotStart: Date
): Promise<boolean> {
  const profile = await getInterviewerProfileByEmail(
    email,
    organizationId || undefined
  );

  const maxPerDay = profile?.maxInterviewsPerDay ?? DEFAULT_MAX_INTERVIEWS_PER_DAY;

  // Get bookings for that day
  const dayStart = new Date(proposedSlotStart);
  dayStart.setUTCHours(0, 0, 0, 0);

  const dayEnd = new Date(proposedSlotStart);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const dayBookings = await getBookingsInTimeRange(dayStart, dayEnd, [email]);

  // Count non-cancelled bookings
  const activeCount = dayBookings.filter((b) => b.status !== 'cancelled').length;

  return activeCount >= maxPerDay;
}

/**
 * Check if booking this slot would put interviewer over weekly capacity
 */
export async function wouldExceedWeeklyCapacity(
  email: string,
  organizationId: string | null,
  proposedSlotStart: Date
): Promise<boolean> {
  const profile = await getInterviewerProfileByEmail(
    email,
    organizationId || undefined
  );

  const maxPerWeek = profile?.maxInterviewsPerWeek ?? DEFAULT_MAX_INTERVIEWS_PER_WEEK;

  const weekStart = getWeekStart(proposedSlotStart);
  const weekEnd = getWeekEnd(proposedSlotStart);

  const weekBookings = await getBookingsInTimeRange(weekStart, weekEnd, [email]);

  // Count non-cancelled bookings
  const activeCount = weekBookings.filter((b) => b.status !== 'cancelled').length;

  return activeCount >= maxPerWeek;
}
