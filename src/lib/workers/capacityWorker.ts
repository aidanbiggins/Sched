/**
 * Capacity Worker
 * M15: Scheduling Intelligence & Capacity Planning
 *
 * Computes weekly load rollups and generates recommendations.
 */

import { WorkerService, WorkerOptions } from './types';
import { WorkerResult } from '../cron/types';
import {
  getWeekStart,
  getWeekEnd,
  calculateWeeklyLoad,
  buildLoadRollupInput,
} from '../capacity/loadCalculation';
import { generateOrgRecommendations } from '../capacity/recommendationsEngine';
import {
  getActiveInterviewerProfiles,
  upsertLoadRollup,
  expireOldRecommendations,
} from '@/lib/db';

// Default batch size
const DEFAULT_BATCH_SIZE = 50;

// Get all active organizations from interviewer profiles
async function getActiveOrganizations(): Promise<string[]> {
  // Get all active profiles (no org filter)
  const profiles = await getActiveInterviewerProfiles();
  const orgIds = new Set<string>();

  for (const profile of profiles) {
    if (profile.organizationId) {
      orgIds.add(profile.organizationId);
    }
  }

  return Array.from(orgIds);
}

/**
 * Process load rollups for all active interviewer profiles
 */
async function processLoadRollups(
  batchSize: number
): Promise<{ processed: number; failed: number; errors: Array<{ itemId: string; error: string }> }> {
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  // Get all active organizations
  const orgIds = await getActiveOrganizations();

  let processed = 0;
  let failed = 0;
  const errors: Array<{ itemId: string; error: string }> = [];

  for (const orgId of orgIds) {
    // Get active profiles for this org
    const profiles = await getActiveInterviewerProfiles(orgId);

    for (const profile of profiles.slice(0, batchSize - processed)) {
      if (processed >= batchSize) break;

      try {
        const startTime = Date.now();

        // Calculate load for this interviewer
        const loadResult = await calculateWeeklyLoad({
          interviewerProfileId: profile.id,
          weekStart,
          weekEnd,
        });

        const computationDurationMs = Date.now() - startTime;

        // Build and upsert rollup
        const rollupInput = buildLoadRollupInput(
          profile.id,
          profile.organizationId || orgId,
          weekStart,
          weekEnd,
          loadResult,
          computationDurationMs
        );

        await upsertLoadRollup(rollupInput);
        processed++;

        console.log(
          `[Capacity] Computed rollup for ${profile.email}: ` +
          `scheduled=${loadResult.scheduledCount}, utilization=${Math.round(loadResult.utilizationPct)}%`
        );
      } catch (error) {
        failed++;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({
          itemId: profile.id,
          error: errorMessage,
        });
        console.error(`[Capacity] Error processing profile ${profile.id}:`, errorMessage);
      }
    }
  }

  return { processed, failed, errors };
}

/**
 * Generate recommendations for all organizations
 */
async function processRecommendations(): Promise<{ processed: number; failed: number; errors: Array<{ itemId: string; error: string }> }> {
  const orgIds = await getActiveOrganizations();

  let processed = 0;
  let failed = 0;
  const errors: Array<{ itemId: string; error: string }> = [];

  // Expire old recommendations first (globally, not per-org)
  try {
    await expireOldRecommendations();
  } catch (error) {
    console.error('[Capacity] Error expiring old recommendations:', error);
  }

  for (const orgId of orgIds) {
    try {
      // Generate new recommendations
      const recommendations = await generateOrgRecommendations(orgId);
      processed += recommendations.length;

      console.log(`[Capacity] Generated ${recommendations.length} recommendations for org ${orgId.slice(0, 8)}`);
    } catch (error) {
      failed++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        itemId: orgId,
        error: errorMessage,
      });
      console.error(`[Capacity] Error generating recommendations for org ${orgId}:`, errorMessage);
    }
  }

  return { processed, failed, errors };
}

/**
 * Get queue depth (number of active profiles to process)
 */
async function getQueueDepth(): Promise<number> {
  const profiles = await getActiveInterviewerProfiles();
  return profiles.length;
}

/**
 * Process a batch of capacity computations
 */
async function processBatch(options?: WorkerOptions): Promise<WorkerResult> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;

  console.log(`[Capacity] Starting capacity rollup batch (size: ${batchSize})`);

  // Process load rollups
  const rollupResult = await processLoadRollups(batchSize);

  // Process recommendations
  const recResult = await processRecommendations();

  // Get final queue depth
  const queueDepth = await getQueueDepth();

  const totalProcessed = rollupResult.processed + recResult.processed;
  const totalFailed = rollupResult.failed + recResult.failed;
  const allErrors = [...rollupResult.errors, ...recResult.errors];

  console.log(
    `[Capacity] Batch complete: rollups=${rollupResult.processed}, recommendations=${recResult.processed}, ` +
    `failed=${totalFailed}, queue=${queueDepth}`
  );

  return {
    processed: totalProcessed,
    failed: totalFailed,
    skipped: 0,
    queueDepth,
    errors: allErrors,
  };
}

/**
 * Capacity worker service
 */
export const capacityWorkerService: WorkerService = {
  processBatch,
  getQueueDepth,
};
