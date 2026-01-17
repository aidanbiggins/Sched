/**
 * Tests for Escalation Service
 * M16: Communications & Portal Hardening
 */

import { processEscalations } from '@/lib/escalation/EscalationService';

// Mock the database functions
jest.mock('@/lib/db', () => ({
  getAllSchedulingRequests: jest.fn(),
  getNotificationJobsByEntityId: jest.fn(),
  createNotificationJob: jest.fn(),
  updateSchedulingRequest: jest.fn(),
}));

import {
  getAllSchedulingRequests,
  getNotificationJobsByEntityId,
  createNotificationJob,
  updateSchedulingRequest,
} from '@/lib/db';

const mockGetAllSchedulingRequests = getAllSchedulingRequests as jest.Mock;
const mockGetNotificationJobsByEntityId = getNotificationJobsByEntityId as jest.Mock;
const mockCreateNotificationJob = createNotificationJob as jest.Mock;
const mockUpdateSchedulingRequest = updateSchedulingRequest as jest.Mock;

describe('EscalationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetNotificationJobsByEntityId.mockResolvedValue([]);
    mockCreateNotificationJob.mockResolvedValue({ id: 'new-job-id' });
    mockUpdateSchedulingRequest.mockResolvedValue({});
  });

  describe('processEscalations', () => {
    it('should process no requests when none are pending', async () => {
      mockGetAllSchedulingRequests.mockResolvedValue([]);

      const result = await processEscalations();

      expect(result.processedCount).toBe(0);
      expect(result.nudgesSent).toBe(0);
      expect(result.escalationsSent).toBe(0);
      expect(result.expired).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should skip requests that are not pending', async () => {
      mockGetAllSchedulingRequests.mockResolvedValue([
        {
          id: 'req-1',
          status: 'booked',
          createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000), // 3 days ago
        },
      ]);

      const result = await processEscalations();

      expect(result.processedCount).toBe(0);
      expect(mockCreateNotificationJob).not.toHaveBeenCalled();
    });

    it('should send first nudge after 48 hours', async () => {
      const createdAt = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50 hours ago
      mockGetAllSchedulingRequests.mockResolvedValue([
        {
          id: 'req-1',
          status: 'pending',
          createdAt,
          candidateName: 'Test Candidate',
          candidateEmail: 'candidate@example.com',
          candidateTimezone: 'America/New_York',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          durationMinutes: 60,
          publicToken: 'token123',
          organizationId: 'org-1',
          interviewerEmails: ['interviewer@example.com'],
        },
      ]);

      const result = await processEscalations();

      expect(result.nudgesSent).toBe(1);
      expect(mockCreateNotificationJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'nudge_reminder',
          toEmail: 'candidate@example.com',
          payloadJson: expect.objectContaining({
            isUrgent: false,
          }),
        })
      );
    });

    it('should send urgent nudge after 96 hours', async () => {
      const createdAt = new Date(Date.now() - 100 * 60 * 60 * 1000); // 100 hours ago
      mockGetAllSchedulingRequests.mockResolvedValue([
        {
          id: 'req-1',
          status: 'pending',
          createdAt,
          candidateName: 'Test Candidate',
          candidateEmail: 'candidate@example.com',
          candidateTimezone: 'America/New_York',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          durationMinutes: 60,
          publicToken: 'token123',
          organizationId: 'org-1',
          interviewerEmails: ['interviewer@example.com'],
        },
      ]);

      // First nudge was already sent
      mockGetNotificationJobsByEntityId.mockResolvedValue([
        {
          id: 'job-1',
          type: 'nudge_reminder',
          status: 'SENT',
          idempotencyKey: 'nudge_reminder:scheduling_request:req-1:default',
        },
      ]);

      const result = await processEscalations();

      expect(result.nudgesSent).toBe(1);
      expect(mockCreateNotificationJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'nudge_reminder',
          payloadJson: expect.objectContaining({
            isUrgent: true,
          }),
        })
      );
    });

    it('should escalate to coordinator after 120 hours', async () => {
      const createdAt = new Date(Date.now() - 125 * 60 * 60 * 1000); // 125 hours ago
      mockGetAllSchedulingRequests.mockResolvedValue([
        {
          id: 'req-1',
          status: 'pending',
          createdAt,
          candidateName: 'Test Candidate',
          candidateEmail: 'candidate@example.com',
          candidateTimezone: 'America/New_York',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          durationMinutes: 60,
          publicToken: 'token123',
          organizationId: 'org-1',
          interviewerEmails: ['interviewer@example.com'],
        },
      ]);

      const result = await processEscalations();

      expect(result.escalationsSent).toBe(1);
      expect(mockCreateNotificationJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'escalation_no_response',
          toEmail: 'interviewer@example.com',
        })
      );
    });

    it('should auto-expire after 168 hours', async () => {
      const createdAt = new Date(Date.now() - 170 * 60 * 60 * 1000); // 170 hours ago
      mockGetAllSchedulingRequests.mockResolvedValue([
        {
          id: 'req-1',
          status: 'pending',
          createdAt,
          candidateName: 'Test Candidate',
          candidateEmail: 'candidate@example.com',
          candidateTimezone: 'America/New_York',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          durationMinutes: 60,
          publicToken: 'token123',
          organizationId: 'org-1',
          interviewerEmails: ['interviewer@example.com'],
        },
      ]);

      const result = await processEscalations();

      expect(result.expired).toBe(1);
      expect(mockUpdateSchedulingRequest).toHaveBeenCalledWith('req-1', {
        status: 'expired',
      });
      expect(mockCreateNotificationJob).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'escalation_expired',
        })
      );
    });

    it('should not send duplicate notifications', async () => {
      const createdAt = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50 hours ago
      mockGetAllSchedulingRequests.mockResolvedValue([
        {
          id: 'req-1',
          status: 'pending',
          createdAt,
          candidateName: 'Test Candidate',
          candidateEmail: 'candidate@example.com',
          candidateTimezone: 'America/New_York',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          durationMinutes: 60,
          publicToken: 'token123',
          organizationId: 'org-1',
          interviewerEmails: ['interviewer@example.com'],
        },
      ]);

      // Nudge already sent
      mockGetNotificationJobsByEntityId.mockResolvedValue([
        {
          id: 'job-1',
          type: 'nudge_reminder',
          status: 'SENT',
          idempotencyKey: 'nudge_reminder:scheduling_request:req-1:default',
        },
      ]);

      const result = await processEscalations();

      expect(result.nudgesSent).toBe(0);
      expect(mockCreateNotificationJob).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockGetAllSchedulingRequests.mockRejectedValue(new Error('Database error'));

      const result = await processEscalations();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Database error');
    });

    it('should respect custom escalation config', async () => {
      const createdAt = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30 hours ago
      mockGetAllSchedulingRequests.mockResolvedValue([
        {
          id: 'req-1',
          status: 'pending',
          createdAt,
          candidateName: 'Test Candidate',
          candidateEmail: 'candidate@example.com',
          candidateTimezone: 'America/New_York',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          durationMinutes: 60,
          publicToken: 'token123',
          organizationId: 'org-1',
          interviewerEmails: ['interviewer@example.com'],
        },
      ]);

      // Custom config with 24h first reminder
      const result = await processEscalations({
        initialReminderHours: 24,
      });

      expect(result.nudgesSent).toBe(1);
    });

    it('should skip reminders when disabled', async () => {
      const createdAt = new Date(Date.now() - 50 * 60 * 60 * 1000); // 50 hours ago
      mockGetAllSchedulingRequests.mockResolvedValue([
        {
          id: 'req-1',
          status: 'pending',
          createdAt,
          candidateName: 'Test Candidate',
          candidateEmail: 'candidate@example.com',
          candidateTimezone: 'America/New_York',
          reqTitle: 'Software Engineer',
          interviewType: 'phone_screen',
          durationMinutes: 60,
          publicToken: 'token123',
          organizationId: 'org-1',
          interviewerEmails: ['interviewer@example.com'],
        },
      ]);

      const result = await processEscalations({
        enableReminders: false,
      });

      expect(result.nudgesSent).toBe(0);
      expect(mockCreateNotificationJob).not.toHaveBeenCalled();
    });
  });
});
