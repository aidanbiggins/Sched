/**
 * Tests for IcimsWritebackService
 * Tests note writeback, failure handling, and sync job creation
 */

import { v4 as uuidv4 } from 'uuid';
import {
  IcimsWritebackService,
  resetIcimsWritebackService,
} from '@/lib/icims/IcimsWritebackService';
import { IcimsClient } from '@/lib/icims/IcimsClient';
import {
  resetDatabase,
  getAllAuditLogs,
  getSyncJobsByEntityId,
  getSyncJobById,
} from '@/lib/db';
import { LinkCreatedNoteParams, BookedNoteParams, CanceledNoteParams } from '@/lib/icims/noteFormatter';

// Mock IcimsClient
class MockIcimsClient implements IcimsClient {
  public shouldFail = false;
  public failureMessage = 'Mock API error';
  public addedNotes: Array<{ applicationId: string; note: string }> = [];

  async getApplication(applicationId: string) {
    return {
      id: applicationId,
      candidateName: 'Test Candidate',
      candidateEmail: 'candidate@test.com',
      requisitionId: 'REQ-001',
      requisitionTitle: 'Test Position',
      status: 'active',
    };
  }

  async addApplicationNote(applicationId: string, note: string): Promise<void> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    this.addedNotes.push({ applicationId, note });
  }

  reset() {
    this.shouldFail = false;
    this.failureMessage = 'Mock API error';
    this.addedNotes = [];
  }
}

describe('IcimsWritebackService', () => {
  let mockClient: MockIcimsClient;
  let service: IcimsWritebackService;

  beforeEach(() => {
    resetDatabase();
    resetIcimsWritebackService();
    mockClient = new MockIcimsClient();
    service = new IcimsWritebackService(mockClient);
  });

  afterEach(() => {
    mockClient.reset();
  });

  describe('writeLinkCreatedNote', () => {
    const baseParams: LinkCreatedNoteParams = {
      schedulingRequestId: 'req-123',
      applicationId: 'APP-456',
      publicLink: 'https://schedule.example.com/book/abc123',
      interviewerEmails: ['interviewer@company.com'],
      organizerEmail: 'scheduling@company.com',
      interviewType: 'phone_screen',
      durationMinutes: 45,
      windowStart: new Date('2026-01-15T14:00:00Z'),
      windowEnd: new Date('2026-01-28T14:00:00Z'),
      candidateTimezone: 'America/New_York',
    };

    it('should write note successfully', async () => {
      const result = await service.writeLinkCreatedNote(baseParams);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockClient.addedNotes).toHaveLength(1);
      expect(mockClient.addedNotes[0].applicationId).toBe('APP-456');
      expect(mockClient.addedNotes[0].note).toContain('=== SCHEDULING LINK CREATED ===');
    });

    it('should skip writeback when applicationId is null', async () => {
      const params = { ...baseParams, applicationId: null };

      const result = await service.writeLinkCreatedNote(params);

      expect(result.success).toBe(true);
      expect(mockClient.addedNotes).toHaveLength(0);
    });

    it('should create audit log on success', async () => {
      await service.writeLinkCreatedNote(baseParams);

      const logs = await getAllAuditLogs();
      const attemptLog = logs.find((l) => l.action === 'icims_note_attempt');
      const successLog = logs.find((l) => l.action === 'icims_note_success');

      expect(attemptLog).toBeDefined();
      expect(successLog).toBeDefined();
      expect(attemptLog?.payload).toMatchObject({
        applicationId: 'APP-456',
        noteType: 'link_created',
      });
    });

    it('should create sync job on failure', async () => {
      mockClient.shouldFail = true;
      mockClient.failureMessage = 'iCIMS API timeout';

      const result = await service.writeLinkCreatedNote(baseParams);

      expect(result.success).toBe(false);
      expect(result.error).toBe('iCIMS API timeout');
      expect(result.syncJobId).toBeDefined();

      // Check sync job was created
      const jobs = await getSyncJobsByEntityId('req-123');
      expect(jobs).toHaveLength(1);
      expect(jobs[0].type).toBe('icims_note');
      expect(jobs[0].status).toBe('pending');
      expect(jobs[0].lastError).toBe('iCIMS API timeout');
    });

    it('should create audit logs on failure', async () => {
      mockClient.shouldFail = true;

      await service.writeLinkCreatedNote(baseParams);

      const logs = await getAllAuditLogs();
      const failLog = logs.find((l) => l.action === 'icims_note_failed');
      const syncJobLog = logs.find((l) => l.action === 'sync_job_created');

      expect(failLog).toBeDefined();
      expect(syncJobLog).toBeDefined();
    });
  });

  describe('writeBookedNote', () => {
    const baseParams: BookedNoteParams = {
      schedulingRequestId: 'req-123',
      bookingId: 'booking-789',
      applicationId: 'APP-456',
      interviewerEmails: ['interviewer@company.com'],
      organizerEmail: 'scheduling@company.com',
      scheduledStartUtc: new Date('2026-01-15T14:00:00Z'),
      scheduledEndUtc: new Date('2026-01-15T15:00:00Z'),
      candidateTimezone: 'America/New_York',
      calendarEventId: 'cal-event-123',
      joinUrl: 'https://teams.microsoft.com/meet/abc123',
    };

    it('should write booking note successfully', async () => {
      const result = await service.writeBookedNote(baseParams);

      expect(result.success).toBe(true);
      expect(mockClient.addedNotes).toHaveLength(1);
      expect(mockClient.addedNotes[0].note).toContain('=== INTERVIEW BOOKED ===');
      expect(mockClient.addedNotes[0].note).toContain('Booking ID: booking-789');
    });

    it('should associate sync job with booking entity on failure', async () => {
      mockClient.shouldFail = true;

      await service.writeBookedNote(baseParams);

      const jobs = await getSyncJobsByEntityId('booking-789');
      expect(jobs).toHaveLength(1);
      expect(jobs[0].entityType).toBe('booking');
    });
  });

  describe('writeCancelledNote', () => {
    const baseParams: CanceledNoteParams = {
      schedulingRequestId: 'req-123',
      bookingId: 'booking-789',
      applicationId: 'APP-456',
      interviewerEmails: ['interviewer@company.com'],
      organizerEmail: 'scheduling@company.com',
      reason: 'Candidate withdrew',
      cancelledBy: 'coordinator',
    };

    it('should write cancellation note successfully', async () => {
      const result = await service.writeCancelledNote(baseParams);

      expect(result.success).toBe(true);
      expect(mockClient.addedNotes[0].note).toContain('=== INTERVIEW CANCELLED ===');
      expect(mockClient.addedNotes[0].note).toContain('Reason: Candidate withdrew');
    });
  });

  describe('retryJob', () => {
    it('should successfully retry a failed job', async () => {
      // First create a failed job
      mockClient.shouldFail = true;
      mockClient.failureMessage = 'Initial failure';

      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: 'APP-456',
        publicLink: 'https://schedule.example.com/book/abc123',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2026-01-15T14:00:00Z'),
        windowEnd: new Date('2026-01-28T14:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      const initialResult = await service.writeLinkCreatedNote(params);
      expect(initialResult.syncJobId).toBeDefined();

      // Get the sync job
      const job = await getSyncJobById(initialResult.syncJobId!);
      expect(job).toBeDefined();

      // Now make the client work and retry
      mockClient.shouldFail = false;
      const retryResult = await service.retryJob(job!);

      expect(retryResult.success).toBe(true);
      expect(mockClient.addedNotes).toHaveLength(1);
    });

    it('should return failure result on retry failure', async () => {
      // Create a failed job
      mockClient.shouldFail = true;

      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: 'APP-456',
        publicLink: 'https://schedule.example.com/book/abc123',
        interviewerEmails: ['interviewer@company.com'],
        organizerEmail: 'scheduling@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2026-01-15T14:00:00Z'),
        windowEnd: new Date('2026-01-28T14:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      const initialResult = await service.writeLinkCreatedNote(params);
      const job = await getSyncJobById(initialResult.syncJobId!);

      // Keep client failing and retry
      mockClient.failureMessage = 'Retry also failed';
      const retryResult = await service.retryJob(job!);

      expect(retryResult.success).toBe(false);
      expect(retryResult.error).toBe('Retry also failed');
    });
  });

  describe('calculateNextRunAfter', () => {
    it('should return correct backoff intervals', () => {
      // Use a fixed "now" to test intervals
      const baseTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(baseTime);

      const after0 = IcimsWritebackService.calculateNextRunAfter(0);
      const after1 = IcimsWritebackService.calculateNextRunAfter(1);
      const after2 = IcimsWritebackService.calculateNextRunAfter(2);
      const after3 = IcimsWritebackService.calculateNextRunAfter(3);
      const after4 = IcimsWritebackService.calculateNextRunAfter(4);
      const after10 = IcimsWritebackService.calculateNextRunAfter(10); // Should cap at max

      expect(after0.getTime() - baseTime).toBe(60000);    // 1 min
      expect(after1.getTime() - baseTime).toBe(300000);   // 5 min
      expect(after2.getTime() - baseTime).toBe(900000);   // 15 min
      expect(after3.getTime() - baseTime).toBe(1800000);  // 30 min
      expect(after4.getTime() - baseTime).toBe(3600000);  // 60 min
      expect(after10.getTime() - baseTime).toBe(3600000); // Capped at 60 min

      jest.restoreAllMocks();
    });
  });
});
