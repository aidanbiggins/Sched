/**
 * Notifications Module
 *
 * Exports all notification-related services and utilities.
 */

// Email service
export {
  sendEmail,
  isEmailConfigured,
  getEmailServiceStatus,
  type EmailOptions,
  type EmailResult,
} from './EmailService';

// Templates
export {
  candidateAvailabilityRequestTemplate,
  candidateSelfScheduleLinkTemplate,
  bookingConfirmationTemplate,
  rescheduleConfirmationTemplate,
  cancelNoticeTemplate,
  reminderTemplate,
  type EmailTemplate,
} from './templates';

// Notification service (enqueue functions)
export {
  enqueueAvailabilityRequestNotification,
  enqueueSelfScheduleLinkNotification,
  enqueueBookingConfirmationNotification,
  enqueueRescheduleConfirmationNotification,
  enqueueCancelNoticeNotification,
  enqueueReminderNotifications,
  cancelPendingReminders,
  enqueueResendSelfScheduleLink,
  enqueueResendBookingConfirmation,
  enqueueResendAvailabilityRequest,
} from './NotificationService';
