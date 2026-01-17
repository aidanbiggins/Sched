/**
 * Notification Worker Service
 * Processes pending notification jobs
 */

import { v4 as uuidv4 } from 'uuid';
import {
  getPendingNotificationJobs,
  updateNotificationJob,
  createNotificationAttempt,
  getNotificationJobCounts,
} from '../db';
import { sendEmail } from '../notifications/EmailService';
import {
  candidateAvailabilityRequestTemplate,
  candidateSelfScheduleLinkTemplate,
  bookingConfirmationTemplate,
  rescheduleConfirmationTemplate,
  cancelNoticeTemplate,
  reminderTemplate,
} from '../notifications/templates';
import { NotificationJob, NotificationType } from '../../types/scheduling';
import { WorkerResult } from '../cron/types';
import { WorkerService, WorkerOptions } from './types';

// Configuration
const DEFAULT_BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;
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
  // Cast payload as unknown first to satisfy TypeScript's type narrowing
  const p = payload as unknown;
  switch (type) {
    case 'candidate_availability_request':
      return candidateAvailabilityRequestTemplate(p as Parameters<typeof candidateAvailabilityRequestTemplate>[0]);
    case 'candidate_self_schedule_link':
      return candidateSelfScheduleLinkTemplate(p as Parameters<typeof candidateSelfScheduleLinkTemplate>[0]);
    case 'booking_confirmation':
      return bookingConfirmationTemplate(p as Parameters<typeof bookingConfirmationTemplate>[0]);
    case 'reschedule_confirmation':
      return rescheduleConfirmationTemplate(p as Parameters<typeof rescheduleConfirmationTemplate>[0]);
    case 'cancel_notice':
      return cancelNoticeTemplate(p as Parameters<typeof cancelNoticeTemplate>[0]);
    case 'reminder_24h':
    case 'reminder_2h':
      return reminderTemplate(p as Parameters<typeof reminderTemplate>[0]);
    default:
      throw new Error(`Unknown notification type: ${type}`);
  }
}

/**
 * Process a single notification job
 */
async function processJob(job: NotificationJob): Promise<{ success: boolean; error?: string }> {
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

      return { success: true };
    } else {
      throw new Error(result.error || 'Unknown send error');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

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
    } else {
      // Schedule retry with exponential backoff
      const nextRun = calculateBackoff(attemptNumber);
      await updateNotificationJob(job.id, {
        status: 'PENDING',
        attempts: attemptNumber,
        runAfter: nextRun,
        lastError: errorMessage,
      });
    }

    return { success: false, error: errorMessage };
  }
}

/**
 * Notification Worker Service
 */
export const notifyWorkerService: WorkerService = {
  async processBatch(options?: WorkerOptions): Promise<WorkerResult> {
    const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
    const jobs = await getPendingNotificationJobs(batchSize);

    const result: WorkerResult = {
      processed: 0,
      failed: 0,
      skipped: 0,
      queueDepth: 0,
      errors: [],
    };

    for (const job of jobs) {
      const jobResult = await processJob(job);

      if (jobResult.success) {
        result.processed++;
      } else {
        result.failed++;
        result.errors.push({
          itemId: job.id,
          error: jobResult.error || 'Unknown error',
        });
      }
    }

    // Get remaining queue depth
    const counts = await getNotificationJobCounts();
    result.queueDepth = counts.pending;

    return result;
  },

  async getQueueDepth(): Promise<number> {
    const counts = await getNotificationJobCounts();
    return counts.pending;
  },
};
