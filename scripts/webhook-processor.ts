/**
 * Webhook Processor Script (M6)
 *
 * Processes pending webhook events from the database.
 * Run with: npm run scheduler:webhook:process
 *
 * This worker:
 * 1. Fetches webhook events with status 'received' and runAfter <= now
 * 2. Processes each event (event type handling)
 * 3. On success: marks event as 'processed'
 * 4. On failure: increments attempts, schedules retry with backoff
 * 5. After max attempts: marks event as 'failed'
 */

import {
  getPendingWebhookEvents,
  updateWebhookEvent,
} from '../src/lib/db';
import { getWebhookService } from '../src/lib/webhook';
import { WebhookEvent } from '../src/types/scheduling';

// Configuration
const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 30000; // 30 seconds
const RUN_ONCE = process.argv.includes('--once');

/**
 * Process a single webhook event
 */
async function processEvent(event: WebhookEvent): Promise<void> {
  console.log(`[${new Date().toISOString()}] Processing webhook ${event.id} (attempt ${event.attempts + 1}/${event.maxAttempts})`);
  console.log(`  Event type: ${event.eventType}`);
  console.log(`  External ID: ${event.eventId}`);

  // Mark as processing
  await updateWebhookEvent(event.id, { status: 'processing' });

  try {
    const service = getWebhookService();
    const result = await service.processWebhookEvent(event);

    if (result.success) {
      console.log(`[${new Date().toISOString()}] Webhook ${event.id} processed successfully`);
    } else {
      console.log(`[${new Date().toISOString()}] Webhook ${event.id} failed: ${result.error}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${new Date().toISOString()}] Error processing webhook ${event.id}:`, errorMessage);

    // Manually handle the error since processWebhookEvent should have handled it
    // but we catch any unexpected errors here
    await updateWebhookEvent(event.id, {
      status: 'failed',
      lastError: errorMessage,
    });
  }
}

/**
 * Main processing loop
 */
async function processPendingEvents(): Promise<number> {
  const events = await getPendingWebhookEvents(BATCH_SIZE);

  if (events.length === 0) {
    return 0;
  }

  console.log(`[${new Date().toISOString()}] Found ${events.length} pending webhook event(s)`);

  for (const event of events) {
    await processEvent(event);
  }

  return events.length;
}

/**
 * Run the worker
 */
async function run(): Promise<void> {
  console.log(`[${new Date().toISOString()}] Webhook processor started`);
  console.log(`Mode: ${RUN_ONCE ? 'Single run' : 'Continuous polling'}`);
  console.log(`Batch size: ${BATCH_SIZE}`);
  console.log(`Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log('');

  if (RUN_ONCE) {
    // Single run mode
    const processed = await processPendingEvents();
    console.log(`[${new Date().toISOString()}] Processed ${processed} webhook event(s). Exiting.`);
    return;
  }

  // Continuous mode
  while (true) {
    try {
      await processPendingEvents();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error processing webhooks:`, error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Run if executed directly
run().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
