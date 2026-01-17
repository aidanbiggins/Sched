/**
 * Enhanced Scoring Service
 * M15: Scheduling Intelligence & Capacity Planning
 *
 * Adds capacity-aware factors to slot scoring for load balancing.
 */

import {
  EnhancedSuggestionScore,
  InterviewerWithLoad,
  InterviewerProfile,
} from '@/types/capacity';
import { InterviewType } from '@/types/scheduling';
import { getInterviewerLoadForSlot } from './loadCalculation';

// Score weight configuration
const WEIGHTS = {
  availability: 50,       // 0-50: ratio of available interviewers
  timeliness: 30,         // 0-30: prefer sooner slots
  timeOfDay: 10,          // 0-10: 9am-2pm bonus
  loadBalance: 20,        // 0-20: prefer less-loaded interviewers
  capacityHeadroom: 15,   // 0-15: penalize at/over capacity
  preferenceMatch: 10,    // 0-10: match interviewer preferences
};

// Total max score: 135

/**
 * Calculate load balance score (0-20)
 * Prefer slots where available interviewers have lower current load
 */
function calculateLoadBalanceScore(
  interviewersWithLoad: InterviewerWithLoad[]
): { score: number; rationale: string | null } {
  if (interviewersWithLoad.length === 0) {
    return { score: 0, rationale: null };
  }

  const totalUtilization = interviewersWithLoad.reduce(
    (sum, i) => sum + i.currentWeekUtilization,
    0
  );
  const avgUtilization = totalUtilization / interviewersWithLoad.length;

  // 0% utilization = 20 points, 100% utilization = 0 points
  const score = Math.max(0, WEIGHTS.loadBalance - (avgUtilization * WEIGHTS.loadBalance / 100));

  let rationale: string | null = null;
  if (avgUtilization < 50) {
    rationale = 'Interviewers have low load this week';
  } else if (avgUtilization >= 90) {
    rationale = 'Interviewers heavily loaded this week';
  }

  return { score: Math.round(score * 100) / 100, rationale };
}

/**
 * Calculate capacity headroom score (0-15)
 * Penalize if any interviewer is at or over capacity
 */
function calculateCapacityHeadroomScore(
  interviewersWithLoad: InterviewerWithLoad[]
): { score: number; rationale: string | null } {
  if (interviewersWithLoad.length === 0) {
    return { score: WEIGHTS.capacityHeadroom, rationale: null };
  }

  const atCapacityCount = interviewersWithLoad.filter((i) => i.atCapacity).length;
  const overCapacityCount = interviewersWithLoad.filter((i) => i.overCapacity).length;

  if (overCapacityCount > 0) {
    return {
      score: 0,
      rationale: `${overCapacityCount} interviewer(s) over capacity`,
    };
  }

  if (atCapacityCount === interviewersWithLoad.length) {
    return {
      score: 3,
      rationale: 'All interviewers at capacity',
    };
  }

  if (atCapacityCount > 0) {
    const ratio = atCapacityCount / interviewersWithLoad.length;
    const score = Math.round((WEIGHTS.capacityHeadroom * (1 - ratio * 0.5)) * 100) / 100;
    return {
      score,
      rationale: `${atCapacityCount} interviewer(s) at capacity`,
    };
  }

  return { score: WEIGHTS.capacityHeadroom, rationale: null };
}

/**
 * Calculate preference match score (0-10)
 * Bonus for matching interview type preferences
 */
function calculatePreferenceMatchScore(
  interviewersWithLoad: InterviewerWithLoad[],
  interviewType: InterviewType
): { score: number; rationale: string | null } {
  const interviewersWithProfiles = interviewersWithLoad.filter((i) => i.profile);

  if (interviewersWithProfiles.length === 0) {
    return { score: WEIGHTS.preferenceMatch / 2, rationale: null };
  }

  let matchCount = 0;
  for (const interviewer of interviewersWithProfiles) {
    const prefs = interviewer.profile?.interviewTypePreferences || [];
    if (prefs.length === 0 || prefs.includes(interviewType)) {
      matchCount++;
    }
  }

  const matchRatio = matchCount / interviewersWithProfiles.length;
  const score = Math.round(matchRatio * WEIGHTS.preferenceMatch * 100) / 100;

  let rationale: string | null = null;
  if (matchRatio === 1 && interviewersWithProfiles.length > 0) {
    rationale = 'Interview type matches preferences';
  } else if (matchRatio < 0.5) {
    rationale = 'Some interviewers prefer other interview types';
  }

  return { score, rationale };
}

/**
 * Calculate availability score (original logic)
 */
function calculateAvailabilityScore(
  availableCount: number,
  totalCount: number
): { score: number; rationale: string } {
  const ratio = totalCount > 0 ? availableCount / totalCount : 0;
  const score = Math.round(ratio * WEIGHTS.availability * 100) / 100;

  let rationale: string;
  if (availableCount === totalCount) {
    rationale = 'All interviewers available';
  } else {
    rationale = `${availableCount}/${totalCount} interviewers available`;
  }

  return { score, rationale };
}

/**
 * Calculate timeliness score (original logic)
 */
function calculateTimelinessScore(
  slotStart: Date,
  preferEarlier: boolean
): { score: number; rationale: string | null } {
  if (!preferEarlier) {
    return { score: 0, rationale: null };
  }

  const now = Date.now();
  const daysFromNow = (slotStart.getTime() - now) / (24 * 60 * 60 * 1000);
  const score = Math.max(0, WEIGHTS.timeliness - daysFromNow * 2);

  let rationale: string | null = null;
  if (daysFromNow < 1) {
    rationale = 'Available today';
  } else if (daysFromNow < 3) {
    rationale = 'Available soon';
  }

  return { score: Math.round(score * 100) / 100, rationale };
}

/**
 * Calculate time of day score (original logic)
 */
function calculateTimeOfDayScore(
  slotStart: Date
): { score: number; rationale: string | null } {
  const hour = slotStart.getUTCHours();

  if (hour >= 9 && hour <= 14) {
    return {
      score: WEIGHTS.timeOfDay,
      rationale: 'Optimal time of day',
    };
  }

  return { score: 0, rationale: null };
}

export interface EnhancedScoringInput {
  slotStart: Date;
  slotEnd: Date;
  availableInterviewerEmails: string[];
  totalInterviewerEmails: string[];
  organizationId: string | null;
  interviewType: InterviewType;
  preferEarlier?: boolean;
}

/**
 * Calculate enhanced suggestion score with capacity factors
 */
export async function calculateEnhancedScore(
  input: EnhancedScoringInput
): Promise<EnhancedSuggestionScore> {
  const {
    slotStart,
    availableInterviewerEmails,
    totalInterviewerEmails,
    organizationId,
    interviewType,
    preferEarlier = true,
  } = input;

  // Get load info for available interviewers
  const interviewersWithLoad: InterviewerWithLoad[] = await Promise.all(
    availableInterviewerEmails.map((email) =>
      getInterviewerLoadForSlot(email, organizationId, slotStart)
    )
  );

  // Calculate all score components
  const availability = calculateAvailabilityScore(
    availableInterviewerEmails.length,
    totalInterviewerEmails.length
  );

  const timeliness = calculateTimelinessScore(slotStart, preferEarlier);
  const timeOfDay = calculateTimeOfDayScore(slotStart);
  const loadBalance = calculateLoadBalanceScore(interviewersWithLoad);
  const capacityHeadroom = calculateCapacityHeadroomScore(interviewersWithLoad);
  const preferenceMatch = calculatePreferenceMatchScore(interviewersWithLoad, interviewType);

  // Build rationale from all components
  const rationale: string[] = [];
  rationale.push(availability.rationale);

  if (timeliness.rationale) rationale.push(timeliness.rationale);
  if (timeOfDay.rationale) rationale.push(timeOfDay.rationale);
  if (loadBalance.rationale) rationale.push(loadBalance.rationale);
  if (capacityHeadroom.rationale) rationale.push(capacityHeadroom.rationale);
  if (preferenceMatch.rationale) rationale.push(preferenceMatch.rationale);

  const totalScore =
    availability.score +
    timeliness.score +
    timeOfDay.score +
    loadBalance.score +
    capacityHeadroom.score +
    preferenceMatch.score;

  return {
    availabilityScore: availability.score,
    timelinessScore: timeliness.score,
    timeOfDayScore: timeOfDay.score,
    loadBalanceScore: loadBalance.score,
    capacityHeadroomScore: capacityHeadroom.score,
    preferenceMatchScore: preferenceMatch.score,
    totalScore: Math.round(totalScore * 100) / 100,
    rationale,
  };
}

/**
 * Calculate a simple legacy score (for backwards compatibility)
 */
export function calculateLegacyScore(
  slotStart: Date,
  availableCount: number,
  totalCount: number,
  preferEarlier: boolean
): { score: number; rationale: string } {
  const availability = calculateAvailabilityScore(availableCount, totalCount);
  const timeliness = calculateTimelinessScore(slotStart, preferEarlier);
  const timeOfDay = calculateTimeOfDayScore(slotStart);

  const reasons: string[] = [availability.rationale];
  if (timeliness.rationale) reasons.push(timeliness.rationale);
  if (timeOfDay.rationale) reasons.push(timeOfDay.rationale);

  return {
    score: Math.round((availability.score + timeliness.score + timeOfDay.score) * 100) / 100,
    rationale: reasons.join(', '),
  };
}

/**
 * Sort suggestions by enhanced score
 */
export function sortByEnhancedScore<T extends { enhancedScore?: EnhancedSuggestionScore }>(
  suggestions: T[]
): T[] {
  return [...suggestions].sort((a, b) => {
    const scoreA = a.enhancedScore?.totalScore ?? 0;
    const scoreB = b.enhancedScore?.totalScore ?? 0;
    return scoreB - scoreA;
  });
}
