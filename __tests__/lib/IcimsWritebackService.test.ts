/**
 * Unit tests for IcimsWritebackService
 *
 * Tests writeback behavior including success, failure, and retry job creation.
 */

import { IcimsWritebackService } from '@/lib/icims/IcimsWritebackService';
import { IcimsClientMock } from '@/lib/icims/IcimsClientMock';
import {
  resetDatabase,
  getAllAuditLogs,
  getPendingSyncJobs,
  getSyncJobById,
} from '@/lib/db';
import {
  LinkCreatedNoteParams,
  BookedNoteParams,
  CanceledNoteParams,
  RescheduledNoteParams,
} from '@/lib/icims/noteFormatter';

describe('IcimsWritebackService', () => {
  let icimsClient: IcimsClientMock;
  let writebackService: IcimsWritebackService;

  beforeEach(() => {
    resetDatabase();
    icimsClient = new IcimsClientMock();
    icimsClient.clearNotes();
    writebackService = new IcimsWritebackService(icimsClient);
  });

  describe('writeLinkCreatedNote', () => {
    it('writes note when applicationId is provided', async () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: 'app-456',
        publicLink: 'https://example.com/book/abc',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      const result = await writebackService.writeLinkCreatedNote(params);

      expect(result.success).toBe(true);
      const notes = icimsClient.getApplicationNotes('app-456');
      expect(notes.length).toBe(1);
      expect(notes[0]).toContain('=== SCHEDULING LINK CREATED ===');
    });

    it('returns success without writing when applicationId is null', async () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-123',
        applicationId: null,
        publicLink: 'https://example.com/book/abc',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      const result = await writebackService.writeLinkCreatedNote(params);

      expect(result.success).toBe(true);
      expect(result.syncJobId).toBeUndefined();
    });

    it('creates sync job on failure', async () => {
      // Configure mock to fail
      icimsClient.setFailOnNextRequest(true);

      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-fail',
        applicationId: 'app-fail',
        publicLink: 'https://example.com/book/fail',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      const result = await writebackService.writeLinkCreatedNote(params);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.syncJobId).toBeDefined();

      const syncJob = await getSyncJobById(result.syncJobId!);
      expect(syncJob).toBeDefined();
      expect(syncJob?.type).toBe('icims_note');
      expect(syncJob?.status).toBe('pending');
      expect(syncJob?.entityType).toBe('scheduling_request');
    });

    it('logs attempt and success to audit log', async () => {
      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-audit',
        applicationId: 'app-audit',
        publicLink: 'https://example.com/book/audit',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      await writebackService.writeLinkCreatedNote(params);

      const logs = await getAllAuditLogs();
      const attemptLog = logs.find((l) => l.action === 'icims_note_attempt');
      const successLog = logs.find((l) => l.action === 'icims_note_success');

      expect(attemptLog).toBeDefined();
      expect(successLog).toBeDefined();
    });

    it('logs failure to audit log on error', async () => {
      icimsClient.setFailOnNextRequest(true);

      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-fail-audit',
        applicationId: 'app-fail-audit',
        publicLink: 'https://example.com/book/fail-audit',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      await writebackService.writeLinkCreatedNote(params);

      const logs = await getAllAuditLogs();
      const failedLog = logs.find((l) => l.action === 'icims_note_failed');

      expect(failedLog).toBeDefined();
      expect(failedLog?.payload).toHaveProperty('error');
    });
  });

  describe('writeBookedNote', () => {
    it('writes booked note with all details', async () => {
      const params: BookedNoteParams = {
        schedulingRequestId: 'req-book',
        bookingId: 'book-123',
        applicationId: 'app-book',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        scheduledStartUtc: new Date('2025-01-17T14:00:00Z'),
        scheduledEndUtc: new Date('2025-01-17T15:00:00Z'),
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-event',
        joinUrl: 'https://teams.microsoft.com/join/xyz',
      };

      const result = await writebackService.writeBookedNote(params);

      expect(result.success).toBe(true);
      const notes = icimsClient.getApplicationNotes('app-book');
      expect(notes.length).toBe(1);
      expect(notes[0]).toContain('=== INTERVIEW BOOKED ===');
      expect(notes[0]).toContain('book-123');
    });

    it('creates sync job with booking entity type on failure', async () => {
      icimsClient.setFailOnNextRequest(true);

      const params: BookedNoteParams = {
        schedulingRequestId: 'req-book-fail',
        bookingId: 'book-fail',
        applicationId: 'app-book-fail',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        scheduledStartUtc: new Date('2025-01-17T14:00:00Z'),
        scheduledEndUtc: new Date('2025-01-17T15:00:00Z'),
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-fail',
        joinUrl: null,
      };

      const result = await writebackService.writeBookedNote(params);

      expect(result.success).toBe(false);
      const syncJob = await getSyncJobById(result.syncJobId!);
      expect(syncJob?.entityType).toBe('booking');
      expect(syncJob?.entityId).toBe('book-fail');
    });
  });

  describe('writeCancelledNote', () => {
    it('writes cancelled note with reason', async () => {
      const params: CanceledNoteParams = {
        schedulingRequestId: 'req-cancel',
        bookingId: 'book-cancel',
        applicationId: 'app-cancel',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        reason: 'Position filled',
        cancelledBy: 'coordinator@company.com',
      };

      const result = await writebackService.writeCancelledNote(params);

      expect(result.success).toBe(true);
      const notes = icimsClient.getApplicationNotes('app-cancel');
      expect(notes[0]).toContain('=== INTERVIEW CANCELLED ===');
      expect(notes[0]).toContain('Position filled');
    });
  });

  describe('writeRescheduledNote', () => {
    it('writes rescheduled note with old and new times', async () => {
      const params: RescheduledNoteParams = {
        schedulingRequestId: 'req-resch',
        bookingId: 'book-resch',
        applicationId: 'app-resch',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        oldStartUtc: new Date('2025-01-17T14:00:00Z'),
        oldEndUtc: new Date('2025-01-17T15:00:00Z'),
        newStartUtc: new Date('2025-01-18T16:00:00Z'),
        newEndUtc: new Date('2025-01-18T17:00:00Z'),
        candidateTimezone: 'America/New_York',
        calendarEventId: 'cal-resch',
        reason: 'Interviewer conflict',
      };

      const result = await writebackService.writeRescheduledNote(params);

      expect(result.success).toBe(true);
      const notes = icimsClient.getApplicationNotes('app-resch');
      expect(notes[0]).toContain('=== INTERVIEW RESCHEDULED ===');
      expect(notes[0]).toContain('Previous Time');
      expect(notes[0]).toContain('New Time');
    });
  });

  describe('retryJob', () => {
    it('successfully retries a failed job', async () => {
      // First, create a failed job
      icimsClient.setFailOnNextRequest(true);

      const params: LinkCreatedNoteParams = {
        schedulingRequestId: 'req-retry',
        applicationId: 'app-retry',
        publicLink: 'https://example.com/book/retry',
        interviewerEmails: ['int@company.com'],
        organizerEmail: 'org@company.com',
        interviewType: 'phone_screen',
        durationMinutes: 45,
        windowStart: new Date('2025-01-15T09:00:00Z'),
        windowEnd: new Date('2025-01-22T17:00:00Z'),
        candidateTimezone: 'America/New_York',
      };

      const initialResult = await writebackService.writeLinkCreatedNote(params);
      expect(initialResult.success).toBe(false);

      // Now get the sync job and retry it (mock should succeed now)
      const syncJob = await getSyncJobById(initialResult.syncJobId!);
      expect(syncJob).toBeDefined();

      const retryResult = await writebackService.retryJob(syncJob!);

      expect(retryResult.success).toBe(true);
      const notes = icimsClient.getApplicationNotes('app-retry');
      expect(notes.length).toBe(1);
    });
  });

  describe('calculateNextRunAfter', () => {
    it('uses exponential backoff intervals', () => {
      const now = Date.now();

      // First retry: 1 minute
      const first = IcimsWritebackService.calculateNextRunAfter(0);
      expect(first.getTime() - now).toBeCloseTo(60000, -2);

      // Second retry: 5 minutes
      const second = IcimsWritebackService.calculateNextRunAfter(1);
      expect(second.getTime() - now).toBeCloseTo(300000, -2);

      // Third retry: 15 minutes
      const third = IcimsWritebackService.calculateNextRunAfter(2);
      expect(third.getTime() - now).toBeCloseTo(900000, -2);

      // Fourth retry: 30 minutes
      const fourth = IcimsWritebackService.calculateNextRunAfter(3);
      expect(fourth.getTime() - now).toBeCloseTo(1800000, -2);

      // Fifth+ retry: 60 minutes (capped)
      const fifth = IcimsWritebackService.calculateNextRunAfter(4);
      expect(fifth.getTime() - now).toBeCloseTo(3600000, -2);

      const tenth = IcimsWritebackService.calculateNextRunAfter(9);
      expect(tenth.getTime() - now).toBeCloseTo(3600000, -2);
    });
  });
});
