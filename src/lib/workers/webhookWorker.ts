/**
 * Webhook Worker Service
 * Processes pending webhook events
 */

import {
  getPendingWebhookEvents,
  updateWebhookEvent,
  getWebhookEventCounts,
} from '../db';
import { getWebhookService } from '../webhook';
import { WebhookEvent } from '../../types/scheduling';
import { WorkerResult } from '../cron/types';
import { WorkerService, WorkerOptions } from './types';

// Configuration
const DEFAULT_BATCH_SIZE = 10;

/**
 * Process a single webhook event
 */
async function processEvent(event: WebhookEvent): Promise<{ success: boolean; error?: string }> {
  // Mark as processing
  await updateWebhookEvent(event.id, { status: 'processing' });

  try {
    const service = getWebhookService();
    const result = await service.processWebhookEvent(event);

    if (result.success) {
      return { success: true };
    } else {
      return { success: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Mark as failed since processWebhookEvent should have handled normal failures
    await updateWebhookEvent(event.id, {
      status: 'failed',
      lastError: errorMessage,
    });

    return { success: false, error: errorMessage };
  }
}

/**
 * Webhook Worker Service
 */
export const webhookWorkerService: WorkerService = {
  async processBatch(options?: WorkerOptions): Promise<WorkerResult> {
    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    const events = await getPendingWebhookEvents(batchSize);

    const result: WorkerResult = {
      processed: 0,
      failed: 0,
      skipped: 0,
      queueDepth: 0,
      errors: [],
    };

    for (const event of events) {
      const eventResult = await processEvent(event);

      if (eventResult.success) {
        result.processed++;
      } else {
        result.failed++;
        result.errors.push({
          itemId: event.id,
          error: eventResult.error || 'Unknown error',
        });
      }
    }

    // Get remaining queue depth
    const counts = await getWebhookEventCounts();
    result.queueDepth = counts.received;

    return result;
  },

  async getQueueDepth(): Promise<number> {
    const counts = await getWebhookEventCounts();
    return counts.received;
  },
};
