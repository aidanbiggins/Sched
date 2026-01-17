/**
 * NotificationService
 *
 * Handles enqueueing notification jobs with idempotency.
 * Provides high-level methods for each notification trigger point.
 */

import { v4 as uuidv4 } from 'uuid';
import { DateTime } from 'luxon';
import {
  NotificationJob,
  NotificationType,
  NotificationEntityType,
  SchedulingRequest,
  Booking,
  AvailabilityRequest,
  CoordinatorNotificationPreferences,
} from '@/types/scheduling';
import {
  createNotificationJob,
  cancelPendingNotificationJobsByEntity,
  getCoordinatorPreferences,
} from '@/lib/db';

// ============================================
// Idempotency Key Generation
// ============================================

/**
 * Generate a deterministic idempotency key
 *
 * Format: {type}:{entityType}:{entityId}:{discriminator}
 *
 * Discriminators:
 * - For single events (booking, cancel): empty or 'v1'
 * - For reminders: target time bucket (ISO date-hour)
 * - For resends: timestamp bucket (to allow intentional resends)
 */
function generateIdempotencyKey(
  type: NotificationType,
  entityType: NotificationEntityType,
  entityId: string,
  discriminator?: string
): string {
  const parts = [type, entityType, entityId];
  if (discriminator) {
    parts.push(discriminator);
  }
  return parts.join(':');
}

/**
 * Generate time bucket for reminder idempotency
 * Rounds to the hour to prevent duplicate reminders for the same hour
 */
function getTimeBucket(date: Date): string {
  return DateTime.fromJSDate(date, { zone: 'UTC' }).toFormat("yyyy-MM-dd'T'HH");
}

// ============================================
// Base Job Creation
// ============================================

interface CreateJobOptions {
  tenantId?: string | null;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  toEmail: string;
  payload: Record<string, unknown>;
  runAfter?: Date;
  idempotencyDiscriminator?: string;
}

async function createJob(options: CreateJobOptions): Promise<NotificationJob> {
  const {
    tenantId,
    type,
    entityType,
    entityId,
    toEmail,
    payload,
    runAfter,
    idempotencyDiscriminator,
  } = options;

  const now = new Date();
  const idempotencyKey = generateIdempotencyKey(type, entityType, entityId, idempotencyDiscriminator);

  const job: NotificationJob = {
    id: uuidv4(),
    tenantId: tenantId || null,
    type,
    entityType,
    entityId,
    idempotencyKey,
    toEmail,
    payloadJson: payload,
    status: 'PENDING',
    attempts: 0,
    maxAttempts: 5,
    runAfter: runAfter || now,
    lastError: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
  };

  return createNotificationJob(job);
}

// ============================================
// High-Level Enqueue Methods
// ============================================

/**
 * Enqueue availability request notification
 * Sent when a coordinator creates an availability request
 */
export async function enqueueAvailabilityRequestNotification(
  request: AvailabilityRequest,
  publicLink: string,
  tenantId?: string
): Promise<NotificationJob> {
  return createJob({
    tenantId,
    type: 'candidate_availability_request',
    entityType: 'availability_request',
    entityId: request.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone || 'America/New_York',
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      publicLink,
      expiresAt: request.expiresAt.toISOString(),
      windowStart: request.windowStart.toISOString(),
      windowEnd: request.windowEnd.toISOString(),
    },
  });
}

/**
 * Enqueue self-schedule link notification
 * Sent when a coordinator creates a scheduling request
 */
export async function enqueueSelfScheduleLinkNotification(
  request: SchedulingRequest,
  publicLink: string,
  tenantId?: string
): Promise<NotificationJob> {
  return createJob({
    tenantId,
    type: 'candidate_self_schedule_link',
    entityType: 'scheduling_request',
    entityId: request.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      publicLink,
      expiresAt: request.expiresAt.toISOString(),
    },
  });
}

/**
 * Enqueue booking confirmation notification
 * Sent when a booking is created
 */
export async function enqueueBookingConfirmationNotification(
  request: SchedulingRequest,
  booking: Booking,
  tenantId?: string
): Promise<NotificationJob> {
  const scheduledStartLocal = DateTime.fromJSDate(booking.scheduledStart, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("EEEE, MMMM d, yyyy 'at' h:mm a ZZZZ");
  const scheduledEndLocal = DateTime.fromJSDate(booking.scheduledEnd, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("h:mm a ZZZZ");

  return createJob({
    tenantId,
    type: 'booking_confirmation',
    entityType: 'booking',
    entityId: booking.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      scheduledStartUtc: booking.scheduledStart.toISOString(),
      scheduledEndUtc: booking.scheduledEnd.toISOString(),
      scheduledStartLocal,
      scheduledEndLocal,
      conferenceJoinUrl: booking.conferenceJoinUrl,
      interviewerEmails: request.interviewerEmails,
      calendarEventId: booking.calendarEventId,
    },
  });
}

/**
 * Enqueue reschedule confirmation notification
 */
export async function enqueueRescheduleConfirmationNotification(
  request: SchedulingRequest,
  booking: Booking,
  oldStart: Date,
  oldEnd: Date,
  reason: string | null,
  tenantId?: string
): Promise<NotificationJob> {
  const newStartLocal = DateTime.fromJSDate(booking.scheduledStart, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("EEEE, MMMM d, yyyy 'at' h:mm a ZZZZ");
  const newEndLocal = DateTime.fromJSDate(booking.scheduledEnd, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("h:mm a ZZZZ");

  // Use a new idempotency key for each reschedule
  const discriminator = `reschedule-${getTimeBucket(new Date())}`;

  return createJob({
    tenantId,
    type: 'reschedule_confirmation',
    entityType: 'booking',
    entityId: booking.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      oldStartUtc: oldStart.toISOString(),
      oldEndUtc: oldEnd.toISOString(),
      newStartUtc: booking.scheduledStart.toISOString(),
      newEndUtc: booking.scheduledEnd.toISOString(),
      newStartLocal,
      newEndLocal,
      conferenceJoinUrl: booking.conferenceJoinUrl,
      reason,
    },
    idempotencyDiscriminator: discriminator,
  });
}

/**
 * Enqueue cancel notice notification
 */
export async function enqueueCancelNoticeNotification(
  request: SchedulingRequest,
  reason: string,
  cancelledBy: string,
  tenantId?: string
): Promise<NotificationJob> {
  return createJob({
    tenantId,
    type: 'cancel_notice',
    entityType: 'scheduling_request',
    entityId: request.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      reason,
      cancelledBy,
    },
  });
}

/**
 * Enqueue reminder notifications (24h and 2h)
 * Creates jobs scheduled for the appropriate time before the interview
 */
export async function enqueueReminderNotifications(
  request: SchedulingRequest,
  booking: Booking,
  tenantId?: string
): Promise<{ reminder24h: NotificationJob | null; reminder2h: NotificationJob | null }> {
  const scheduledStartLocal = DateTime.fromJSDate(booking.scheduledStart, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("EEEE, MMMM d, yyyy 'at' h:mm a ZZZZ");
  const scheduledEndLocal = DateTime.fromJSDate(booking.scheduledEnd, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("h:mm a ZZZZ");

  const basePayload = {
    candidateName: request.candidateName,
    candidateEmail: request.candidateEmail,
    candidateTimezone: request.candidateTimezone,
    reqTitle: request.reqTitle,
    interviewType: request.interviewType,
    durationMinutes: request.durationMinutes,
    scheduledStartUtc: booking.scheduledStart.toISOString(),
    scheduledEndUtc: booking.scheduledEnd.toISOString(),
    scheduledStartLocal,
    scheduledEndLocal,
    conferenceJoinUrl: booking.conferenceJoinUrl,
  };

  const now = new Date();
  const interviewTime = booking.scheduledStart.getTime();

  // 24h reminder
  const reminder24hTime = new Date(interviewTime - 24 * 60 * 60 * 1000);
  let reminder24h: NotificationJob | null = null;
  if (reminder24hTime > now) {
    reminder24h = await createJob({
      tenantId,
      type: 'reminder_24h',
      entityType: 'booking',
      entityId: booking.id,
      toEmail: request.candidateEmail,
      payload: { ...basePayload, hoursUntil: 24 },
      runAfter: reminder24hTime,
      idempotencyDiscriminator: getTimeBucket(reminder24hTime),
    });
  }

  // 2h reminder
  const reminder2hTime = new Date(interviewTime - 2 * 60 * 60 * 1000);
  let reminder2h: NotificationJob | null = null;
  if (reminder2hTime > now) {
    reminder2h = await createJob({
      tenantId,
      type: 'reminder_2h',
      entityType: 'booking',
      entityId: booking.id,
      toEmail: request.candidateEmail,
      payload: { ...basePayload, hoursUntil: 2 },
      runAfter: reminder2hTime,
      idempotencyDiscriminator: getTimeBucket(reminder2hTime),
    });
  }

  return { reminder24h, reminder2h };
}

/**
 * Cancel pending reminder notifications for a booking
 * Called when a booking is cancelled or rescheduled
 */
export async function cancelPendingReminders(bookingId: string): Promise<number> {
  return cancelPendingNotificationJobsByEntity('booking', bookingId, ['reminder_24h', 'reminder_2h']);
}

/**
 * Enqueue a resend of the self-schedule link
 * Uses a timestamp-based idempotency key to allow intentional resends
 */
export async function enqueueResendSelfScheduleLink(
  request: SchedulingRequest,
  publicLink: string,
  tenantId?: string
): Promise<NotificationJob> {
  const discriminator = `resend-${Date.now()}`;

  return createJob({
    tenantId,
    type: 'candidate_self_schedule_link',
    entityType: 'scheduling_request',
    entityId: request.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      publicLink,
      expiresAt: request.expiresAt.toISOString(),
    },
    idempotencyDiscriminator: discriminator,
  });
}

/**
 * Enqueue a resend of the booking confirmation
 * Uses a timestamp-based idempotency key to allow intentional resends
 */
export async function enqueueResendBookingConfirmation(
  request: SchedulingRequest,
  booking: Booking,
  tenantId?: string
): Promise<NotificationJob> {
  const scheduledStartLocal = DateTime.fromJSDate(booking.scheduledStart, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("EEEE, MMMM d, yyyy 'at' h:mm a ZZZZ");
  const scheduledEndLocal = DateTime.fromJSDate(booking.scheduledEnd, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("h:mm a ZZZZ");

  const discriminator = `resend-${Date.now()}`;

  return createJob({
    tenantId,
    type: 'booking_confirmation',
    entityType: 'booking',
    entityId: booking.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      scheduledStartUtc: booking.scheduledStart.toISOString(),
      scheduledEndUtc: booking.scheduledEnd.toISOString(),
      scheduledStartLocal,
      scheduledEndLocal,
      conferenceJoinUrl: booking.conferenceJoinUrl,
      interviewerEmails: request.interviewerEmails,
      calendarEventId: booking.calendarEventId,
    },
    idempotencyDiscriminator: discriminator,
  });
}

/**
 * Enqueue a resend of the availability request link
 */
export async function enqueueResendAvailabilityRequest(
  request: AvailabilityRequest,
  publicLink: string,
  tenantId?: string
): Promise<NotificationJob> {
  const discriminator = `resend-${Date.now()}`;

  return createJob({
    tenantId,
    type: 'candidate_availability_request',
    entityType: 'availability_request',
    entityId: request.id,
    toEmail: request.candidateEmail,
    payload: {
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      candidateTimezone: request.candidateTimezone || 'America/New_York',
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      durationMinutes: request.durationMinutes,
      publicLink,
      expiresAt: request.expiresAt.toISOString(),
      windowStart: request.windowStart.toISOString(),
      windowEnd: request.windowEnd.toISOString(),
    },
    idempotencyDiscriminator: discriminator,
  });
}

// ============================================
// Coordinator Notifications (M16)
// ============================================

/**
 * Get default preferences for when user has no saved preferences
 */
function getDefaultCoordinatorPreferences(): Omit<CoordinatorNotificationPreferences, 'id' | 'userId' | 'organizationId' | 'createdAt' | 'updatedAt'> {
  return {
    notifyOnBooking: true,
    notifyOnCancel: true,
    notifyOnEscalation: true,
    digestFrequency: 'immediate',
  };
}

/**
 * Check if coordinator should be notified based on preferences
 */
async function shouldNotifyCoordinator(
  userId: string,
  organizationId: string,
  notificationType: 'booking' | 'cancel' | 'escalation'
): Promise<boolean> {
  const prefs = await getCoordinatorPreferences(userId, organizationId);
  const effectivePrefs = prefs || getDefaultCoordinatorPreferences();

  // Check immediate frequency - digest modes would be handled by a separate batch job
  if (effectivePrefs.digestFrequency !== 'immediate') {
    return false; // Digest mode - don't send immediate notification
  }

  switch (notificationType) {
    case 'booking':
      return effectivePrefs.notifyOnBooking;
    case 'cancel':
      return effectivePrefs.notifyOnCancel;
    case 'escalation':
      return effectivePrefs.notifyOnEscalation;
    default:
      return false;
  }
}

/**
 * Enqueue coordinator booking notification
 * Sent when a candidate books an interview
 */
export async function enqueueCoordinatorBookingNotification(
  request: SchedulingRequest,
  booking: Booking,
  coordinatorUserId: string,
  coordinatorEmail: string,
  coordinatorName: string,
  tenantId?: string
): Promise<NotificationJob | null> {
  // Check if coordinator wants this notification
  const organizationId = request.organizationId || '';
  if (organizationId && !(await shouldNotifyCoordinator(coordinatorUserId, organizationId, 'booking'))) {
    return null;
  }

  const scheduledStartLocal = DateTime.fromJSDate(booking.scheduledStart, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("EEEE, MMMM d, yyyy 'at' h:mm a ZZZZ");

  return createJob({
    tenantId,
    type: 'coordinator_booking',
    entityType: 'booking',
    entityId: booking.id,
    toEmail: coordinatorEmail,
    payload: {
      coordinatorEmail,
      coordinatorName,
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      scheduledStartUtc: booking.scheduledStart.toISOString(),
      scheduledEndUtc: booking.scheduledEnd.toISOString(),
      scheduledStartLocal,
      conferenceJoinUrl: booking.conferenceJoinUrl,
    },
  });
}

/**
 * Enqueue coordinator cancel notification
 * Sent when a candidate cancels their interview
 */
export async function enqueueCoordinatorCancelNotification(
  request: SchedulingRequest,
  booking: Booking,
  reason: string | null,
  coordinatorUserId: string,
  coordinatorEmail: string,
  coordinatorName: string,
  tenantId?: string
): Promise<NotificationJob | null> {
  // Check if coordinator wants this notification
  const organizationId = request.organizationId || '';
  if (organizationId && !(await shouldNotifyCoordinator(coordinatorUserId, organizationId, 'cancel'))) {
    return null;
  }

  const scheduledStartLocal = DateTime.fromJSDate(booking.scheduledStart, { zone: 'UTC' })
    .setZone(request.candidateTimezone)
    .toFormat("EEEE, MMMM d, yyyy 'at' h:mm a ZZZZ");

  // Use timestamp discriminator since multiple cancels might happen
  const discriminator = `cancel-${Date.now()}`;

  return createJob({
    tenantId,
    type: 'coordinator_cancel',
    entityType: 'booking',
    entityId: booking.id,
    toEmail: coordinatorEmail,
    payload: {
      coordinatorEmail,
      coordinatorName,
      candidateName: request.candidateName,
      candidateEmail: request.candidateEmail,
      reqTitle: request.reqTitle,
      interviewType: request.interviewType,
      scheduledStartUtc: booking.scheduledStart.toISOString(),
      scheduledEndUtc: booking.scheduledEnd.toISOString(),
      scheduledStartLocal,
      reason,
    },
    idempotencyDiscriminator: discriminator,
  });
}

/**
 * Enqueue escalation notification to coordinator
 * Sent when a candidate hasn't responded for a configured period
 */
export async function enqueueEscalationNotification(
  request: SchedulingRequest | AvailabilityRequest,
  requestType: 'availability' | 'booking',
  coordinatorUserId: string,
  coordinatorEmail: string,
  coordinatorName: string,
  daysSinceRequest: number,
  isExpired: boolean,
  tenantId?: string
): Promise<NotificationJob | null> {
  // Check if coordinator wants this notification
  const organizationId = 'organizationId' in request ? request.organizationId || '' : '';
  if (organizationId && !(await shouldNotifyCoordinator(coordinatorUserId, organizationId, 'escalation'))) {
    return null;
  }

  const publicLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/coordinator/${request.id}`;
  const notificationType: NotificationType = isExpired ? 'escalation_expired' : 'escalation_no_response';

  // Use day bucket for idempotency - one escalation per day per request
  const discriminator = `escalation-day-${daysSinceRequest}`;

  return createJob({
    tenantId,
    type: notificationType,
    entityType: requestType === 'availability' ? 'availability_request' : 'scheduling_request',
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
      requestType,
      daysSinceRequest,
      publicLink,
    },
    idempotencyDiscriminator: discriminator,
  });
}
