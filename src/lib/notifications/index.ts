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
  nudgeReminderTemplate,
  escalationNoResponseTemplate,
  escalationExpiredTemplate,
  coordinatorBookingTemplate,
  coordinatorCancelTemplate,
  interviewerNotificationTemplate,
  interviewerReminderTemplate,
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
  // Coordinator notifications (M16)
  enqueueCoordinatorBookingNotification,
  enqueueCoordinatorCancelNotification,
  enqueueEscalationNotification,
} from './NotificationService';

// ICS calendar generator
export {
  generateIcsContent,
  generateGoogleCalendarUrl,
  generateOutlookCalendarUrl,
  generateOffice365CalendarUrl,
  generateCalendarLinks,
  createInterviewEventData,
  type CalendarEventData,
  type CalendarLinks,
} from './icsGenerator';
