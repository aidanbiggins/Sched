/**
 * SlotGenerationService
 *
 * Deterministic slot generation based on interviewer availability.
 * Uses Graph API busy intervals and excludes existing bookings.
 */

import { DateTime } from 'luxon';
import { createHash } from 'crypto';
import {
  SchedulingRequest,
  Booking,
  InterviewerAvailability,
  BusyInterval,
  AvailableSlot,
} from '@/types/scheduling';

const MAX_SLOTS = 30;
const SLOT_INCREMENT_MINUTES = 15;

/**
 * Generate available slots for a scheduling request
 */
export function generateAvailableSlots(
  request: SchedulingRequest,
  availability: InterviewerAvailability[],
  existingBookings: Booking[]
): AvailableSlot[] {
  const slots: AvailableSlot[] = [];
  const durationMs = request.durationMinutes * 60 * 1000;
  const incrementMs = SLOT_INCREMENT_MINUTES * 60 * 1000;

  // Start at the later of: window start or next 15-minute boundary from now
  const now = new Date();
  let current = roundUpTo15Minutes(
    new Date(Math.max(request.windowStart.getTime(), now.getTime()))
  );

  const windowEnd = request.windowEnd;

  while (current < windowEnd && slots.length < MAX_SLOTS) {
    const slotEnd = new Date(current.getTime() + durationMs);

    // Skip if slot extends past window
    if (slotEnd > windowEnd) {
      current = new Date(current.getTime() + incrementMs);
      continue;
    }

    // Check all interviewers are available
    const allFree = availability.every((ia) =>
      isSlotAvailable(current, slotEnd, ia)
    );

    // Check no existing booking conflicts
    const noConflict = !hasBookingConflict(
      current,
      slotEnd,
      existingBookings,
      request.interviewerEmails
    );

    if (allFree && noConflict) {
      slots.push({
        slotId: generateSlotId(current, slotEnd, request.interviewerEmails),
        start: current,
        end: slotEnd,
        displayStart: formatInTimezone(current, request.candidateTimezone),
        displayEnd: formatInTimezone(slotEnd, request.candidateTimezone),
      });
    }

    current = new Date(current.getTime() + incrementMs);
  }

  return slots;
}

/**
 * Round a date up to the next 15-minute boundary
 */
export function roundUpTo15Minutes(date: Date): Date {
  const ms = date.getTime();
  const interval = 15 * 60 * 1000;
  const rounded = Math.ceil(ms / interval) * interval;
  return new Date(rounded);
}

/**
 * Check if a slot is available for an interviewer
 * - Must be within working hours
 * - Must not overlap with busy intervals
 */
function isSlotAvailable(
  start: Date,
  end: Date,
  availability: InterviewerAvailability
): boolean {
  // Check working hours
  if (!isWithinWorkingHours(start, end, availability.workingHours)) {
    return false;
  }

  // Check busy intervals
  if (overlapsAnyInterval(start, end, availability.busyIntervals)) {
    return false;
  }

  return true;
}

/**
 * Check if slot falls within interviewer's working hours
 */
function isWithinWorkingHours(
  start: Date,
  end: Date,
  workingHours: InterviewerAvailability['workingHours']
): boolean {
  const tz = workingHours.timeZone;
  const startLocal = DateTime.fromJSDate(start).setZone(tz);
  const endLocal = DateTime.fromJSDate(end).setZone(tz);

  // Check day of week
  const dayOfWeek = startLocal.weekday % 7; // Luxon: 1=Mon, 7=Sun → 0=Sun, 1=Mon, etc.
  if (!workingHours.daysOfWeek.includes(dayOfWeek === 0 ? 7 : dayOfWeek)) {
    // Convert to Mon=1, Sun=7 format that Luxon uses
    const luxonDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    // Check if this day is in daysOfWeek (which uses 0=Sun, 1=Mon format)
    const jsDay = startLocal.weekday === 7 ? 0 : startLocal.weekday;
    if (!workingHours.daysOfWeek.includes(jsDay)) {
      return false;
    }
  }

  // Parse working hours
  const [startHour, startMin] = workingHours.start.split(':').map(Number);
  const [endHour, endMin] = workingHours.end.split(':').map(Number);

  const workStart = startLocal.set({
    hour: startHour,
    minute: startMin,
    second: 0,
    millisecond: 0,
  });
  const workEnd = startLocal.set({
    hour: endHour,
    minute: endMin,
    second: 0,
    millisecond: 0,
  });

  return startLocal >= workStart && endLocal <= workEnd;
}

/**
 * Check if slot overlaps with any busy interval
 */
function overlapsAnyInterval(
  start: Date,
  end: Date,
  intervals: BusyInterval[]
): boolean {
  return intervals.some(
    (interval) => start < interval.end && end > interval.start
  );
}

/**
 * Check if slot conflicts with existing bookings for the same interviewers
 */
function hasBookingConflict(
  start: Date,
  end: Date,
  bookings: Booking[],
  interviewerEmails: string[]
): boolean {
  for (const booking of bookings) {
    if (booking.status === 'cancelled') continue;

    // Check time overlap
    if (start < booking.scheduledEnd && end > booking.scheduledStart) {
      return true;
    }
  }
  return false;
}

/**
 * Generate a deterministic slot ID based on start, end, and interviewers
 */
export function generateSlotId(
  start: Date,
  end: Date,
  interviewerEmails: string[]
): string {
  const data = `${start.toISOString()}|${end.toISOString()}|${interviewerEmails
    .map((e) => e.toLowerCase())
    .sort()
    .join(',')}`;
  return createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Format a date in a specific timezone for display
 */
export function formatInTimezone(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date)
    .setZone(timezone)
    .toFormat("ccc, LLL d 'at' h:mm a ZZZZ");
}

/**
 * Parse a slot ID to extract start time (reverse of generateSlotId for validation)
 * Note: This only works if we have the original data to verify against
 */
export function validateSlotId(
  slotId: string,
  start: Date,
  end: Date,
  interviewerEmails: string[]
): boolean {
  const expectedId = generateSlotId(start, end, interviewerEmails);
  return slotId === expectedId;
}

/**
 * Find a slot by ID in a list of available slots
 */
export function findSlotById(
  slots: AvailableSlot[],
  slotId: string
): AvailableSlot | undefined {
  return slots.find((slot) => slot.slotId === slotId);
}
