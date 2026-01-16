/**
 * Suggestion Service
 *
 * Generates interview time suggestions by matching:
 * - Candidate availability blocks
 * - Interviewer free/busy from Graph API
 */

import { DateTime } from 'luxon';
import {
  AvailabilityRequest,
  CandidateAvailabilityBlock,
  AvailabilitySuggestion,
  InterviewerAvailability,
  BusyInterval,
} from '@/types/scheduling';
import { getGraphCalendarClient } from '@/lib/graph';
import { getCalendarClient } from '@/lib/calendar';
import { isStandaloneMode } from '@/lib/config';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

// Default working hours for standalone mode
const DEFAULT_WORKING_HOURS = {
  start: '09:00',
  end: '17:00',
  timeZone: 'America/New_York',
  daysOfWeek: [1, 2, 3, 4, 5], // Mon-Fri
};

export interface SuggestionOptions {
  maxSuggestions?: number;
  preferEarlier?: boolean;
}

/**
 * Get interviewer availability - either from personal calendar or Graph API
 */
async function getInterviewerAvailability(
  interviewerEmails: string[],
  windowStart: Date,
  windowEnd: Date,
  createdByUserId: string | null
): Promise<InterviewerAvailability[]> {
  // In standalone mode, use the creator's personal calendar
  if (isStandaloneMode() && createdByUserId) {
    try {
      const calendarClient = await getCalendarClient(createdByUserId);
      const freeBusyResponses = await calendarClient.getFreeBusy({
        emails: interviewerEmails,
        startTime: windowStart,
        endTime: windowEnd,
      });

      return freeBusyResponses.map((response) => ({
        email: response.email,
        busyIntervals: response.busyIntervals.map((interval) => ({
          start: interval.start,
          end: interval.end,
          status: 'busy' as const,
          isPrivate: false,
        })),
        workingHours: DEFAULT_WORKING_HOURS,
      }));
    } catch (error) {
      console.error('Error fetching availability from personal calendar:', error);
      throw new Error('Could not fetch calendar availability. Please ensure your calendar is connected.');
    }
  }

  // Enterprise mode: use Graph API
  const graphClient = getGraphCalendarClient();
  return graphClient.getSchedule(interviewerEmails, windowStart, windowEnd, 15);
}

/**
 * Check if a time slot falls within busy intervals
 */
function isSlotBusy(
  slotStart: Date,
  slotEnd: Date,
  busyIntervals: BusyInterval[]
): boolean {
  for (const busy of busyIntervals) {
    // Check for any overlap
    if (slotStart < busy.end && slotEnd > busy.start) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a slot is within working hours
 */
function isWithinWorkingHours(
  slotStart: Date,
  slotEnd: Date,
  workingHours: InterviewerAvailability['workingHours']
): boolean {
  const dt = DateTime.fromJSDate(slotStart, { zone: workingHours.timeZone });
  const dayOfWeek = dt.weekday % 7; // Luxon uses 1-7, we need 0-6

  // Check if day is a working day
  if (!workingHours.daysOfWeek.includes(dayOfWeek)) {
    return false;
  }

  // Parse working hours
  const [startHour, startMin] = workingHours.start.split(':').map(Number);
  const [endHour, endMin] = workingHours.end.split(':').map(Number);

  const slotTime = dt.hour * 60 + dt.minute;
  const endDt = DateTime.fromJSDate(slotEnd, { zone: workingHours.timeZone });
  const slotEndTime = endDt.hour * 60 + endDt.minute;

  const workStart = startHour * 60 + startMin;
  const workEnd = endHour * 60 + endMin;

  return slotTime >= workStart && slotEndTime <= workEnd;
}

/**
 * Generate all possible interview slots from a candidate availability block
 */
function generateSlotsFromBlock(
  block: CandidateAvailabilityBlock,
  durationMinutes: number
): { start: Date; end: Date }[] {
  const slots: { start: Date; end: Date }[] = [];
  const durationMs = durationMinutes * 60 * 1000;

  let currentStart = block.startAt.getTime();
  const blockEnd = block.endAt.getTime();

  while (currentStart + durationMs <= blockEnd) {
    slots.push({
      start: new Date(currentStart),
      end: new Date(currentStart + durationMs),
    });
    currentStart += FIFTEEN_MINUTES; // 15-minute increments
  }

  return slots;
}

/**
 * Find interviewers available for a specific slot
 */
function findAvailableInterviewers(
  slotStart: Date,
  slotEnd: Date,
  interviewerAvailabilities: InterviewerAvailability[]
): string[] {
  const available: string[] = [];

  for (const interviewer of interviewerAvailabilities) {
    // Check working hours
    if (!isWithinWorkingHours(slotStart, slotEnd, interviewer.workingHours)) {
      continue;
    }

    // Check busy intervals
    if (!isSlotBusy(slotStart, slotEnd, interviewer.busyIntervals)) {
      available.push(interviewer.email);
    }
  }

  return available;
}

/**
 * Score a suggestion based on various factors
 */
function scoreSuggestion(
  slotStart: Date,
  availableInterviewers: string[],
  totalInterviewers: number,
  preferEarlier: boolean
): { score: number; rationale: string } {
  let score = 0;
  const reasons: string[] = [];

  // Higher score for more interviewers available
  const interviewerRatio = availableInterviewers.length / totalInterviewers;
  score += interviewerRatio * 50;

  if (availableInterviewers.length === totalInterviewers) {
    reasons.push('All interviewers available');
  } else {
    reasons.push(`${availableInterviewers.length}/${totalInterviewers} interviewers available`);
  }

  // Prefer earlier times if requested
  if (preferEarlier) {
    const now = Date.now();
    const daysFromNow = (slotStart.getTime() - now) / (24 * 60 * 60 * 1000);
    // Earlier slots get higher scores (max 30 points for today, decreasing)
    score += Math.max(0, 30 - daysFromNow * 2);
    if (daysFromNow < 3) {
      reasons.push('Available soon');
    }
  }

  // Prefer morning/midday times (business hours sweet spot)
  const hour = slotStart.getUTCHours();
  if (hour >= 9 && hour <= 14) {
    score += 10;
    reasons.push('Optimal time of day');
  }

  return {
    score: Math.round(score * 100) / 100,
    rationale: reasons.join(', '),
  };
}

/**
 * Generate suggestions for an availability request
 */
export async function generateSuggestions(
  availabilityRequest: AvailabilityRequest,
  candidateBlocks: CandidateAvailabilityBlock[],
  options: SuggestionOptions = {}
): Promise<AvailabilitySuggestion[]> {
  const { maxSuggestions = 10, preferEarlier = true } = options;

  if (candidateBlocks.length === 0) {
    return [];
  }

  // Get interviewer availability
  const interviewerAvailabilities = await getInterviewerAvailability(
    availabilityRequest.interviewerEmails,
    availabilityRequest.windowStart,
    availabilityRequest.windowEnd,
    availabilityRequest.createdBy
  );

  if (interviewerAvailabilities.length === 0) {
    return [];
  }

  // Generate all possible slots from candidate blocks
  const allSlots: { start: Date; end: Date }[] = [];
  for (const block of candidateBlocks) {
    const slots = generateSlotsFromBlock(block, availabilityRequest.durationMinutes);
    allSlots.push(...slots);
  }

  // Find matching slots where at least one interviewer is available
  const suggestions: AvailabilitySuggestion[] = [];

  for (const slot of allSlots) {
    const availableInterviewers = findAvailableInterviewers(
      slot.start,
      slot.end,
      interviewerAvailabilities
    );

    if (availableInterviewers.length > 0) {
      const { score, rationale } = scoreSuggestion(
        slot.start,
        availableInterviewers,
        availabilityRequest.interviewerEmails.length,
        preferEarlier
      );

      suggestions.push({
        startAt: slot.start,
        endAt: slot.end,
        interviewerEmails: availableInterviewers,
        score,
        rationale,
      });
    }
  }

  // Sort by score (descending) and take top suggestions
  suggestions.sort((a, b) => b.score - a.score);

  // Remove duplicates (same time slot might appear multiple times)
  const seen = new Set<string>();
  const uniqueSuggestions = suggestions.filter((s) => {
    const key = `${s.startAt.toISOString()}-${s.endAt.toISOString()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return uniqueSuggestions.slice(0, maxSuggestions);
}
