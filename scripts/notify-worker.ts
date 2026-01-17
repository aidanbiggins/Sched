/**
 * Notification Worker
 *
 * Background worker that processes pending notification jobs.
 *
 * Usage:
 *   npm run scheduler:notify         # Run continuously
 *   npm run scheduler:notify:once    # Process one batch and exit
 */

import {
  getPendingNotificationJobs,
  updateNotificationJob,
  createNotificationAttempt,
} from '../src/lib/db';
import { sendEmail } from '../src/lib/notifications/EmailService';
import {
  candidateAvailabilityRequestTemplate,
  candidateSelfScheduleLinkTemplate,
  bookingConfirmationTemplate,
  rescheduleConfirmationTemplate,
  cancelNoticeTemplate,
  reminderTemplate,
} from '../src/lib/notifications/templates';
import { NotificationJob, NotificationType } from '../src/types/scheduling';
import { v4 as uuidv4 } from 'uuid';

// Configuration
const BATCH_SIZE = 10;
const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 5;

// Exponential backoff base (minutes): 1, 4, 16, 64, 256
const BACKOFF_BASE_MINUTES = 4;

/**
 * Calculate next run time using exponential backoff
 */
function calculateBackoff(attempts: number): Date {
  const minutes = Math.pow(BACKOFF_BASE_MINUTES, attempts);
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Get email template based on notification type
 */
function getEmailContent(
  type: NotificationType,
  payload: Record<string, unknown>
): { subject: string; html: string; text: string } {
  switch (type) {
    case 'candidate_availability_request':
      return candidateAvailabilityRequestTemplate(payload as any);
    case 'candidate_self_schedule_link':
      return candidateSelfScheduleLinkTemplate(payload as any);
    case 'booking_confirmation':
      return bookingConfirmationTemplate(payload as any);
    case 'reschedule_confirmation':
      return rescheduleConfirmationTemplate(payload as any);
    case 'cancel_notice':
      return cancelNoticeTemplate(payload as any);
    case 'reminder_24h':
    case 'reminder_2h':
      return reminderTemplate(payload as any);
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

/**
 * Process a single notification job
 */
async function processJob(job: NotificationJob): Promise<void> {
  console.log(`[NotifyWorker] Processing job ${job.id} (type: ${job.type}, to: ${job.toEmail})`);

  // Mark as SENDING
  await updateNotificationJob(job.id, { status: 'SENDING' });

  const attemptNumber = job.attempts + 1;
  const attemptId = uuidv4();

  try {
    // Generate email content from template
    const { subject, html, text } = getEmailContent(job.type, job.payloadJson);

    // Send email
    const result = await sendEmail({
      to: job.toEmail,
      subject,
      html,
      text,
    });

    if (result.success) {
      // Mark as SENT
      await updateNotificationJob(job.id, {
        status: 'SENT',
        attempts: attemptNumber,
        sentAt: new Date(),
        lastError: null,
      });

      // Record successful attempt
      await createNotificationAttempt({
        id: attemptId,
        notificationJobId: job.id,
        attemptNumber,
        status: 'success',
        error: null,
        providerMessageId: result.messageId,
        createdAt: new Date(),
      });

      console.log(`[NotifyWorker] Job ${job.id} sent successfully (messageId: ${result.messageId})`);
    } else {
      throw new Error(result.error || 'Unknown send error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NotifyWorker] Job ${job.id} failed (attempt ${attemptNumber}): ${errorMessage}`);

    // Record failed attempt
    await createNotificationAttempt({
      id: attemptId,
      notificationJobId: job.id,
      attemptNumber,
      status: 'failure',
      error: errorMessage,
      providerMessageId: null,
      createdAt: new Date(),
    });

    // Check if max attempts reached
    if (attemptNumber >= MAX_ATTEMPTS) {
      await updateNotificationJob(job.id, {
        status: 'FAILED',
        attempts: attemptNumber,
        lastError: errorMessage,
      });
      console.log(`[NotifyWorker] Job ${job.id} marked as FAILED after ${attemptNumber} attempts`);
    } else {
      // Schedule retry with exponential backoff
      const nextRun = calculateBackoff(attemptNumber);
      await updateNotificationJob(job.id, {
        status: 'PENDING',
        attempts: attemptNumber,
        runAfter: nextRun,
        lastError: errorMessage,
      });
      console.log(`[NotifyWorker] Job ${job.id} rescheduled for ${nextRun.toISOString()}`);
    }
  }
}

/**
 * Process a batch of pending jobs
 */
async function processBatch(): Promise<number> {
  const jobs = await getPendingNotificationJobs(BATCH_SIZE);

  if (jobs.length === 0) {
    return 0;
  }

  console.log(`[NotifyWorker] Processing ${jobs.length} pending jobs`);

  for (const job of jobs) {
    await processJob(job);
  }

  return jobs.length;
}

/**
 * Main worker loop
 */
async function runWorker(once: boolean): Promise<void> {
  console.log('[NotifyWorker] Starting notification worker');
  console.log(`[NotifyWorker] Mode: ${once ? 'single batch' : 'continuous'}`);
  console.log(`[NotifyWorker] Batch size: ${BATCH_SIZE}`);
  console.log(`[NotifyWorker] Poll interval: ${POLL_INTERVAL_MS}ms`);
  console.log('');

  if (once) {
    const processed = await processBatch();
    console.log(`[NotifyWorker] Processed ${processed} jobs`);
    return;
  }

  // Continuous mode
  while (true) {
    try {
      await processBatch();
    } catch (error) {
      console.error('[NotifyWorker] Error processing batch:', error);
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Main entry point
const once = process.argv.includes('--once');
runWorker(once).catch((error) => {
  console.error('[NotifyWorker] Fatal error:', error);
  process.exit(1);
});
