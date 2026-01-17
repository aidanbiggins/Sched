/**
 * Recommendations Engine
 * M15: Scheduling Intelligence & Capacity Planning
 *
 * Generates deterministic recommendations based on capacity data.
 */

import {
  RecommendationType,
  RecommendationPriority,
  RecommendationInput,
  InterviewerLoadRollup,
  InterviewerProfile,
  SchedulingRecommendation,
} from '@/types/capacity';
import {
  getActiveInterviewerProfiles,
  getLoadRollupsByOrg,
  createRecommendation,
  getActiveRecommendationsByType,
} from '@/lib/db';
import { getWeekStart, getWeekEnd } from './loadCalculation';

// Thresholds for recommendations
const THRESHOLDS = {
  atCapacity: 90,         // >= 90% utilization
  overCapacity: 100,      // > 100% utilization
  burnoutRisk: 3,         // Consecutive weeks at capacity
  unbalancedLoad: 30,     // Variance in utilization > 30%
  inactiveWarningDays: 30, // Days of inactivity before warning
};

// Recommendation TTL in days
const DEFAULT_TTL_DAYS = 7;

interface RecommendationContext {
  organizationId: string;
  weekStart: Date;
  weekEnd: Date;
  dataVersion: string;
}

/**
 * Generate all recommendations for an organization
 */
export async function generateOrgRecommendations(
  organizationId: string
): Promise<SchedulingRecommendation[]> {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  const context: RecommendationContext = {
    organizationId,
    weekStart,
    weekEnd,
    dataVersion: '1.0',
  };

  // Get active profiles and their rollups
  const profiles = await getActiveInterviewerProfiles(organizationId);
  const rollups = await getLoadRollupsByOrg(organizationId, weekStart);

  // Map rollups by profile ID for easy lookup
  const rollupByProfile = new Map<string, InterviewerLoadRollup>();
  for (const rollup of rollups) {
    rollupByProfile.set(rollup.interviewerProfileId, rollup);
  }

  const recommendations: SchedulingRecommendation[] = [];

  // Check each profile for capacity issues
  for (const profile of profiles) {
    const rollup = rollupByProfile.get(profile.id);

    // Over capacity check
    if (rollup?.overCapacity) {
      const rec = await generateOverCapacityRecommendation(context, profile, rollup);
      if (rec) recommendations.push(rec);
    }
    // At capacity check
    else if (rollup?.atCapacity) {
      const rec = await generateAtCapacityRecommendation(context, profile, rollup);
      if (rec) recommendations.push(rec);
    }
  }

  // Check for unbalanced load
  if (rollups.length >= 2) {
    const unbalancedRec = await generateUnbalancedLoadRecommendation(context, profiles, rollups);
    if (unbalancedRec) recommendations.push(unbalancedRec);
  }

  // Check for org-wide capacity alerts
  const orgCapacityRec = await generateOrgCapacityRecommendation(context, profiles, rollups);
  if (orgCapacityRec) recommendations.push(orgCapacityRec);

  // Check for inactive interviewers
  for (const profile of profiles) {
    if (!profile.isActive) continue;
    const rollup = rollupByProfile.get(profile.id);
    if (!rollup || rollup.scheduledCount === 0) {
      const inactiveRec = await generateInactiveRecommendation(context, profile);
      if (inactiveRec) recommendations.push(inactiveRec);
    }
  }

  return recommendations;
}

/**
 * Generate recommendation for interviewer over capacity
 */
async function generateOverCapacityRecommendation(
  context: RecommendationContext,
  profile: InterviewerProfile,
  rollup: InterviewerLoadRollup
): Promise<SchedulingRecommendation | null> {
  // Check if similar recommendation already exists
  const existing = await getActiveRecommendationsByType(
    context.organizationId,
    'interviewer_over_capacity'
  );

  const hasExisting = existing.some(
    (r) => r.evidence.interviewerEmail === profile.email
  );
  if (hasExisting) return null;

  const input: RecommendationInput = {
    organizationId: context.organizationId,
    recommendationType: 'interviewer_over_capacity',
    priority: 'critical',
    title: `${profile.email} is over capacity`,
    description: `This interviewer has ${rollup.scheduledCount} interviews scheduled this week, exceeding their maximum of ${profile.maxInterviewsPerWeek}. Consider redistributing interviews to other team members.`,
    evidence: {
      generatedAt: new Date().toISOString(),
      dataVersion: context.dataVersion,
      interviewerEmail: profile.email,
      interviewerProfileId: profile.id,
      scheduledCount: rollup.scheduledCount,
      maxPerWeek: profile.maxInterviewsPerWeek,
      utilizationPct: rollup.utilizationPct,
      weekStart: context.weekStart.toISOString(),
    },
    suggestedAction: 'Reassign some interviews to less loaded interviewers',
    actionData: {
      interviewerId: profile.id,
      currentLoad: rollup.scheduledCount,
      capacity: profile.maxInterviewsPerWeek,
    },
    expiresAt: getExpiryDate(DEFAULT_TTL_DAYS),
  };

  return createRecommendation(input);
}

/**
 * Generate recommendation for interviewer at capacity
 */
async function generateAtCapacityRecommendation(
  context: RecommendationContext,
  profile: InterviewerProfile,
  rollup: InterviewerLoadRollup
): Promise<SchedulingRecommendation | null> {
  // Check if similar recommendation already exists
  const existing = await getActiveRecommendationsByType(
    context.organizationId,
    'interviewer_at_capacity'
  );

  const hasExisting = existing.some(
    (r) => r.evidence.interviewerEmail === profile.email
  );
  if (hasExisting) return null;

  const input: RecommendationInput = {
    organizationId: context.organizationId,
    recommendationType: 'interviewer_at_capacity',
    priority: 'high',
    title: `${profile.email} is at capacity`,
    description: `This interviewer has ${rollup.scheduledCount} interviews scheduled this week (${Math.round(rollup.utilizationPct)}% utilization). New interview requests should be directed to other team members.`,
    evidence: {
      generatedAt: new Date().toISOString(),
      dataVersion: context.dataVersion,
      interviewerEmail: profile.email,
      interviewerProfileId: profile.id,
      scheduledCount: rollup.scheduledCount,
      maxPerWeek: profile.maxInterviewsPerWeek,
      utilizationPct: rollup.utilizationPct,
      weekStart: context.weekStart.toISOString(),
    },
    suggestedAction: 'Avoid scheduling new interviews for this interviewer this week',
    expiresAt: getExpiryDate(DEFAULT_TTL_DAYS),
  };

  return createRecommendation(input);
}

/**
 * Generate recommendation for unbalanced load across team
 */
async function generateUnbalancedLoadRecommendation(
  context: RecommendationContext,
  profiles: InterviewerProfile[],
  rollups: InterviewerLoadRollup[]
): Promise<SchedulingRecommendation | null> {
  if (rollups.length < 2) return null;

  const utilizations = rollups.map((r) => r.utilizationPct);
  const min = Math.min(...utilizations);
  const max = Math.max(...utilizations);
  const variance = max - min;

  if (variance < THRESHOLDS.unbalancedLoad) return null;

  // Check if similar recommendation already exists
  const existing = await getActiveRecommendationsByType(
    context.organizationId,
    'unbalanced_load'
  );
  if (existing.length > 0) return null;

  // Find highest and lowest loaded interviewers
  const sortedByUtilization = rollups.sort((a, b) => b.utilizationPct - a.utilizationPct);
  const highest = sortedByUtilization[0];
  const lowest = sortedByUtilization[sortedByUtilization.length - 1];

  const highestProfile = profiles.find((p) => p.id === highest.interviewerProfileId);
  const lowestProfile = profiles.find((p) => p.id === lowest.interviewerProfileId);

  const input: RecommendationInput = {
    organizationId: context.organizationId,
    recommendationType: 'unbalanced_load',
    priority: 'medium',
    title: 'Interview load is unbalanced across team',
    description: `There's a ${Math.round(variance)}% difference in interviewer utilization. ${highestProfile?.email || 'One interviewer'} is at ${Math.round(highest.utilizationPct)}% while ${lowestProfile?.email || 'another'} is at ${Math.round(lowest.utilizationPct)}%. Consider redistributing upcoming interviews.`,
    evidence: {
      generatedAt: new Date().toISOString(),
      dataVersion: context.dataVersion,
      variance: Math.round(variance),
      highestUtilization: {
        email: highestProfile?.email,
        utilizationPct: highest.utilizationPct,
        scheduledCount: highest.scheduledCount,
      },
      lowestUtilization: {
        email: lowestProfile?.email,
        utilizationPct: lowest.utilizationPct,
        scheduledCount: lowest.scheduledCount,
      },
      weekStart: context.weekStart.toISOString(),
    },
    suggestedAction: 'Review interviewer assignments for upcoming scheduling requests',
    expiresAt: getExpiryDate(DEFAULT_TTL_DAYS),
  };

  return createRecommendation(input);
}

/**
 * Generate org-wide capacity alert
 */
async function generateOrgCapacityRecommendation(
  context: RecommendationContext,
  profiles: InterviewerProfile[],
  rollups: InterviewerLoadRollup[]
): Promise<SchedulingRecommendation | null> {
  if (profiles.length === 0) return null;

  const atCapacityCount = rollups.filter((r) => r.atCapacity).length;
  const overCapacityCount = rollups.filter((r) => r.overCapacity).length;
  const criticalCount = atCapacityCount + overCapacityCount;

  // Alert if more than half the team is at or over capacity
  const criticalRatio = criticalCount / profiles.length;
  if (criticalRatio < 0.5) return null;

  // Check if similar recommendation already exists
  const existing = await getActiveRecommendationsByType(
    context.organizationId,
    'capacity_alert_org'
  );
  if (existing.length > 0) return null;

  const priority: RecommendationPriority = overCapacityCount > 0 ? 'critical' : 'high';

  const input: RecommendationInput = {
    organizationId: context.organizationId,
    recommendationType: 'capacity_alert_org',
    priority,
    title: 'Team-wide capacity alert',
    description: `${criticalCount} out of ${profiles.length} interviewers are at or over capacity this week. This may impact the ability to schedule new interviews promptly.`,
    evidence: {
      generatedAt: new Date().toISOString(),
      dataVersion: context.dataVersion,
      totalInterviewers: profiles.length,
      atCapacityCount,
      overCapacityCount,
      criticalRatio: Math.round(criticalRatio * 100),
      weekStart: context.weekStart.toISOString(),
    },
    suggestedAction: 'Consider adding more interviewers or adjusting capacity limits',
    expiresAt: getExpiryDate(DEFAULT_TTL_DAYS),
  };

  return createRecommendation(input);
}

/**
 * Generate recommendation for inactive interviewer
 */
async function generateInactiveRecommendation(
  context: RecommendationContext,
  profile: InterviewerProfile
): Promise<SchedulingRecommendation | null> {
  // Check if similar recommendation already exists
  const existing = await getActiveRecommendationsByType(
    context.organizationId,
    'interviewer_inactive'
  );

  const hasExisting = existing.some(
    (r) => r.evidence.interviewerEmail === profile.email
  );
  if (hasExisting) return null;

  const input: RecommendationInput = {
    organizationId: context.organizationId,
    recommendationType: 'interviewer_inactive',
    priority: 'low',
    title: `${profile.email} has no interviews scheduled`,
    description: `This interviewer has capacity available but no interviews scheduled for the current week. Consider including them in upcoming scheduling requests.`,
    evidence: {
      generatedAt: new Date().toISOString(),
      dataVersion: context.dataVersion,
      interviewerEmail: profile.email,
      interviewerProfileId: profile.id,
      maxPerWeek: profile.maxInterviewsPerWeek,
      weekStart: context.weekStart.toISOString(),
    },
    suggestedAction: 'Include this interviewer in upcoming scheduling requests',
    expiresAt: getExpiryDate(DEFAULT_TTL_DAYS),
  };

  return createRecommendation(input);
}

/**
 * Get expiry date from now
 */
function getExpiryDate(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Get recommendation priority color for UI
 */
export function getPriorityColor(priority: RecommendationPriority): string {
  switch (priority) {
    case 'critical':
      return 'red';
    case 'high':
      return 'amber';
    case 'medium':
      return 'yellow';
    case 'low':
      return 'slate';
    default:
      return 'slate';
  }
}

/**
 * Get recommendation type label for UI
 */
export function getRecommendationTypeLabel(type: RecommendationType): string {
  switch (type) {
    case 'interviewer_over_capacity':
      return 'Over Capacity';
    case 'interviewer_at_capacity':
      return 'At Capacity';
    case 'unbalanced_load':
      return 'Unbalanced Load';
    case 'interviewer_burnout_risk':
      return 'Burnout Risk';
    case 'no_availability':
      return 'No Availability';
    case 'limited_slots':
      return 'Limited Slots';
    case 'suboptimal_match':
      return 'Suboptimal Match';
    case 'preferred_time_conflict':
      return 'Time Conflict';
    case 'capacity_alert_org':
      return 'Team Alert';
    case 'interviewer_inactive':
      return 'Inactive';
    default:
      return type;
  }
}
