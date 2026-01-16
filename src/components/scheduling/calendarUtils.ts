/**
 * Calendar Utilities
 *
 * Time-to-pixel calculations, snapping, and working hours helpers
 * for the ProfessionalCalendar component.
 */

import { DateTime } from 'luxon';

// Constants
export const HOUR_HEIGHT = 60; // pixels per hour
export const MINUTES_PER_SLOT = 15;
export const SLOT_HEIGHT = HOUR_HEIGHT / 4; // 15 pixels per 15-min slot

export interface WorkingHours {
  start: string; // "09:00"
  end: string; // "17:00"
  days: number[]; // 0=Sun, 1=Mon, ... 6=Sat
}

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  start: '09:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5], // Mon-Fri
};

export const DEFAULT_DAY_RANGE = {
  start: '07:00', // 7 AM
  end: '21:00', // 9 PM
};

/**
 * Parse time string "HH:mm" to minutes since midnight
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes since midnight to time string
 */
export function formatMinutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
}

/**
 * Convert minutes since day start to pixel offset
 */
export function minutesToPixels(minutes: number, dayStartMinutes: number): number {
  return ((minutes - dayStartMinutes) / 60) * HOUR_HEIGHT;
}

/**
 * Convert pixel offset to minutes since midnight
 */
export function pixelsToMinutes(pixels: number, dayStartMinutes: number): number {
  return dayStartMinutes + (pixels / HOUR_HEIGHT) * 60;
}

/**
 * Snap minutes to the nearest slot boundary
 */
export function snapToSlot(minutes: number, direction: 'round' | 'floor' | 'ceil' = 'round'): number {
  if (direction === 'floor') {
    return Math.floor(minutes / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;
  }
  if (direction === 'ceil') {
    return Math.ceil(minutes / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;
  }
  return Math.round(minutes / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;
}

/**
 * Get the pixel position for a time on a given day
 */
export function getTimePosition(
  date: Date,
  timezone: string,
  dayStartMinutes: number
): number {
  const dt = DateTime.fromJSDate(date).setZone(timezone);
  const minutes = dt.hour * 60 + dt.minute;
  return minutesToPixels(minutes, dayStartMinutes);
}

/**
 * Get a Date from a pixel position on a given day
 */
export function getTimeFromPosition(
  dayDate: Date,
  pixelY: number,
  timezone: string,
  dayStartMinutes: number
): Date {
  const minutes = pixelsToMinutes(pixelY, dayStartMinutes);
  const snappedMinutes = snapToSlot(minutes);
  const hours = Math.floor(snappedMinutes / 60);
  const mins = snappedMinutes % 60;

  const dt = DateTime.fromJSDate(dayDate)
    .setZone(timezone)
    .startOf('day')
    .plus({ hours, minutes: mins });

  return dt.toJSDate();
}

/**
 * Check if a time is within working hours
 */
export function isWithinWorkingHours(
  date: Date,
  timezone: string,
  workingHours: WorkingHours
): boolean {
  const dt = DateTime.fromJSDate(date).setZone(timezone);
  const dayOfWeek = dt.weekday % 7; // Luxon uses 1-7 (Mon-Sun), convert to 0-6
  const minutes = dt.hour * 60 + dt.minute;

  const startMinutes = parseTimeToMinutes(workingHours.start);
  const endMinutes = parseTimeToMinutes(workingHours.end);

  return (
    workingHours.days.includes(dayOfWeek === 0 ? 7 : dayOfWeek) && // Handle Sunday
    minutes >= startMinutes &&
    minutes < endMinutes
  );
}

/**
 * Get the days to display for a given week
 */
export function getWeekDays(startDate: Date, timezone: string): Date[] {
  const start = DateTime.fromJSDate(startDate).setZone(timezone).startOf('week');
  const days: Date[] = [];

  for (let i = 0; i < 7; i++) {
    days.push(start.plus({ days: i }).toJSDate());
  }

  return days;
}

/**
 * Format a date for display in the calendar header
 */
export function formatDayHeader(date: Date, timezone: string): { weekday: string; date: string } {
  const dt = DateTime.fromJSDate(date).setZone(timezone);
  return {
    weekday: dt.toFormat('EEE'),
    date: dt.toFormat('M/d'),
  };
}

/**
 * Format a time for display
 */
export function formatTime(date: Date, timezone: string): string {
  return DateTime.fromJSDate(date).setZone(timezone).toFormat('h:mm a');
}

/**
 * Check if two dates are the same day
 */
export function isSameDay(date1: Date, date2: Date, timezone: string): boolean {
  const dt1 = DateTime.fromJSDate(date1).setZone(timezone);
  const dt2 = DateTime.fromJSDate(date2).setZone(timezone);
  return dt1.hasSame(dt2, 'day');
}

/**
 * Get the time labels to display (every hour)
 */
export function getTimeLabels(dayStart: string, dayEnd: string): string[] {
  const startHour = parseInt(dayStart.split(':')[0]);
  const endHour = parseInt(dayEnd.split(':')[0]);
  const labels: string[] = [];

  for (let hour = startHour; hour <= endHour; hour++) {
    const suffix = hour >= 12 ? 'pm' : 'am';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    labels.push(`${displayHour}${suffix}`);
  }

  return labels;
}

/**
 * Calculate the height of the calendar grid
 */
export function getGridHeight(dayStart: string, dayEnd: string): number {
  const startMinutes = parseTimeToMinutes(dayStart);
  const endMinutes = parseTimeToMinutes(dayEnd);
  return ((endMinutes - startMinutes) / 60) * HOUR_HEIGHT;
}

/**
 * Get the top position for working hours overlay (before working hours)
 */
export function getBeforeWorkingHoursHeight(
  dayStart: string,
  workingHoursStart: string
): number {
  const dayStartMinutes = parseTimeToMinutes(dayStart);
  const workStartMinutes = parseTimeToMinutes(workingHoursStart);
  return Math.max(0, ((workStartMinutes - dayStartMinutes) / 60) * HOUR_HEIGHT);
}

/**
 * Get the height of the after working hours overlay
 */
export function getAfterWorkingHoursHeight(
  dayEnd: string,
  workingHoursEnd: string
): number {
  const dayEndMinutes = parseTimeToMinutes(dayEnd);
  const workEndMinutes = parseTimeToMinutes(workingHoursEnd);
  return Math.max(0, ((dayEndMinutes - workEndMinutes) / 60) * HOUR_HEIGHT);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Generate a unique block ID
 */
export function generateBlockId(): string {
  return `block-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
