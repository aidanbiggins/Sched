/**
 * Escalation Service
 *
 * Handles no-response nudges and coordinator escalations for pending scheduling requests.
 *
 * Timeline (configurable per org):
 * - T+48h: First nudge reminder to candidate
 * - T+96h: Second nudge reminder (urgent)
 * - T+120h: Escalate to coordinator
 * - T+168h: Auto-expire and notify coordinator
 */

import { v4 as uuidv4 } from 'uuid';
import {
  getAllSchedulingRequests,
  createNotificationJob,
  getNotificationJobsByEntityId,
  updateSchedulingRequest,
} from '@/lib/db';
import { SchedulingRequest, NotificationJob, EscalationConfig, NotificationType } from '@/types/scheduling';

/**
 * Helper to build a full NotificationJob object
 */
function buildNotificationJob(params: {
  tenantId: string | null;
  type: NotificationType;
  entityType: 'scheduling_request' | 'booking';
  entityId: string;
  toEmail: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): NotificationJob {
  const now = new Date();
  return {
    id: uuidv4(),
    tenantId: params.tenantId,
    type: params.type,
    entityType: params.entityType,
    entityId: params.entityId,
    idempotencyKey: params.idempotencyKey || `${params.type}:${params.entityType}:${params.entityId}:default`,
    toEmail: params.toEmail,
    payloadJson: params.payload,
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 3,
    runAfter: now,
    lastError: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

// Default escalation config (can be overridden per organization)
const DEFAULT_ESCALATION_CONFIG: Omit<EscalationConfig, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'> = {
  initialReminderHours: 48,
  secondReminderHours: 96,
  escalateToCoordinatorHours: 120,
  autoExpireHours: 168,
  enableReminders: true,
  enableEscalation: true,
  enableAutoExpire: true,
};

export interface EscalationResult {
  processedCount: number;
  nudgesSent: number;
  escalationsSent: number;
  expired: number;
  errors: string[];
}

/**
 * Get hours since request creation
 */
function getHoursSinceCreation(request: SchedulingRequest): number {
  const now = new Date();
  const created = new Date(request.createdAt);
  return (now.getTime() - created.getTime()) / (1000 * 60 * 60);
}

/**
 * Get days since request creation (for display)
 */
function getDaysSinceCreation(request: SchedulingRequest): number {
  return Math.floor(getHoursSinceCreation(request) / 24);
}

/**
 * Check if a notification of a given type was already sent for this request
 */
async function wasNotificationSent(
  entityId: string,
  notificationType: string
): Promise<boolean> {
  const jobs = await getNotificationJobsByEntityId('scheduling_request', entityId);
  return jobs.some(
    (job: NotificationJob) =>
      job.type === notificationType && (job.status === 'SENT' || job.status === 'PENDING' || job.status === 'SENDING')
  );
}

/**
 * Process all pending scheduling requests for escalation
 */
export async function processEscalations(
  config: Partial<typeof DEFAULT_ESCALATION_CONFIG> = {}
): Promise<EscalationResult> {
  const result: EscalationResult = {
    processedCount: 0,
    nudgesSent: 0,
    escalationsSent: 0,
    expired: 0,
    errors: [],
  };

  const escalationConfig = { ...DEFAULT_ESCALATION_CONFIG, ...config };

  try {
    // Get all pending scheduling requests
    const allRequests = await getAllSchedulingRequests();
    const pendingRequests = allRequests.filter((r) => r.status === 'pending');

    for (const request of pendingRequests) {
      result.processedCount++;

      try {
        const hoursSinceCreation = getHoursSinceCreation(request);
        const daysSinceCreation = getDaysSinceCreation(request);

        // Check if we should auto-expire
        if (
          escalationConfig.enableAutoExpire &&
          hoursSinceCreation >= escalationConfig.autoExpireHours
        ) {
          await handleAutoExpire(request, daysSinceCreation);
          result.expired++;
          continue;
        }

        // Check if we should escalate to coordinator
        if (
          escalationConfig.enableEscalation &&
          hoursSinceCreation >= escalationConfig.escalateToCoordinatorHours
        ) {
          const sent = await handleCoordinatorEscalation(request, daysSinceCreation);
          if (sent) result.escalationsSent++;
          continue;
        }

        // Check if we should send second nudge (urgent)
        if (
          escalationConfig.enableReminders &&
          hoursSinceCreation >= escalationConfig.secondReminderHours
        ) {
          const sent = await handleSecondNudge(request, daysSinceCreation);
          if (sent) result.nudgesSent++;
          continue;
        }

        // Check if we should send first nudge
        if (
          escalationConfig.enableReminders &&
          hoursSinceCreation >= escalationConfig.initialReminderHours
        ) {
          const sent = await handleFirstNudge(request, daysSinceCreation);
          if (sent) result.nudgesSent++;
        }
      } catch (error) {
        const errorMsg = `Error processing request ${request.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMsg);
        result.errors.push(errorMsg);
      }
    }
  } catch (error) {
    const errorMsg = `Error fetching requests: ${error instanceof Error ? error.message : 'Unknown error'}`;
    console.error(errorMsg);
    result.errors.push(errorMsg);
  }

  return result;
}

/**
 * Handle first nudge reminder (48h)
 */
async function handleFirstNudge(
  request: SchedulingRequest,
  daysSinceCreation: number
): Promise<boolean> {
  const alreadySent = await wasNotificationSent(request.id, 'nudge_reminder');
  if (alreadySent) return false;

  // Create nudge notification
  const job = buildNotificationJob({
    tenantId: request.organizationId,
    type: 'nudge_reminder',
    entityType: 'scheduling_request',
    entityId: request.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone || 'America/New_York',
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      publicLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/book/${request.publicToken}`,
      requestType: 'booking',
      daysSinceRequest: daysSinceCreation,
      isUrgent: false,
    },
  });
  await createNotificationJob(job);

  // Update request to track reminder sent
  await updateSchedulingRequest(request.id, {
    // Note: firstReminderSentAt field would need to be added to SchedulingRequest type
  } as Partial<SchedulingRequest>);

  return true;
}

/**
 * Handle second nudge reminder (96h, urgent)
 */
async function handleSecondNudge(
  request: SchedulingRequest,
  daysSinceCreation: number
): Promise<boolean> {
  // Check if first nudge was sent (idempotency key includes type)
  const firstNudgeSent = await wasNotificationSent(request.id, 'nudge_reminder');
  if (!firstNudgeSent) {
    // Send first nudge instead if it hasn't been sent
    return handleFirstNudge(request, daysSinceCreation);
  }

  // Use a different idempotency key for second nudge by appending discriminator
  const secondNudgeKey = `nudge_reminder:scheduling_request:${request.id}:urgent`;
  const jobs = await getNotificationJobsByEntityId('scheduling_request', request.id);
  const secondNudgeSent = jobs.some(
    (job: NotificationJob) =>
      job.idempotencyKey === secondNudgeKey &&
      (job.status === 'SENT' || job.status === 'PENDING' || job.status === 'SENDING')
  );
  if (secondNudgeSent) return false;

  // Create urgent nudge notification
  const job = buildNotificationJob({
    tenantId: request.organizationId,
    type: 'nudge_reminder',
    entityType: 'scheduling_request',
    entityId: request.id,
    toEmail: request.candidateEmail,
    idempotencyKey: secondNudgeKey,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone || 'America/New_York',
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      publicLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/book/${request.publicToken}`,
      requestType: 'booking',
      daysSinceRequest: daysSinceCreation,
      isUrgent: true,
    },
  });
  await createNotificationJob(job);

  return true;
}

/**
 * Handle coordinator escalation (120h)
 */
async function handleCoordinatorEscalation(
  request: SchedulingRequest,
  daysSinceCreation: number
): Promise<boolean> {
  const alreadySent = await wasNotificationSent(request.id, 'escalation_no_response');
  if (alreadySent) return false;

  // Get coordinator email - use creator or fallback to organization admin
  // For now, we'll use the interviewer email as a proxy for coordinator
  const coordinatorEmail = request.interviewerEmails[0] || 'coordinator@example.com';
  const coordinatorName = 'Coordinator';

  const job = buildNotificationJob({
    tenantId: request.organizationId,
    type: 'escalation_no_response',
    entityType: 'scheduling_request',
    entityId: request.id,
    toEmail: coordinatorEmail,
    payload: {
      coordinatorEmail,
      coordinatorName,
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      requestId: request.id,
      requestType: 'booking',
      daysSinceRequest: daysSinceCreation,
      publicLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/coordinator/${request.id}`,
    },
  });
  await createNotificationJob(job);

  return true;
}

/**
 * Handle auto-expire (168h)
 */
async function handleAutoExpire(
  request: SchedulingRequest,
  daysSinceCreation: number
): Promise<void> {
  // Update request status to expired
  await updateSchedulingRequest(request.id, {
    status: 'expired',
  });

  // Check if expiration notification was already sent
  const alreadySent = await wasNotificationSent(request.id, 'escalation_expired');
  if (alreadySent) return;

  // Get coordinator email
  const coordinatorEmail = request.interviewerEmails[0] || 'coordinator@example.com';
  const coordinatorName = 'Coordinator';

  // Send expiration notification to coordinator
  const job = buildNotificationJob({
    tenantId: request.organizationId,
    type: 'escalation_expired',
    entityType: 'scheduling_request',
    entityId: request.id,
    toEmail: coordinatorEmail,
    payload: {
      coordinatorEmail,
      coordinatorName,
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      requestId: request.id,
      requestType: 'booking',
      daysSinceRequest: daysSinceCreation,
      publicLink: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/coordinator/${request.id}`,
    },
  });
  await createNotificationJob(job);
}
