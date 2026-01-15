/**
 * Tests for Sync Jobs Database Layer
 */

import {
  createSyncJob,
  getSyncJobById,
  updateSyncJob,
  getPendingSyncJobs,
  getSyncJobsByEntityId,
  getLatestSyncJobByEntityId,
  resetDatabase,
} from '@/lib/db';
import { SyncJob } from '@/types/scheduling';

describe('syncJobs database layer', () => {
  beforeEach(() => {
    resetDatabase();
  });

  const createTestJob = (overrides: Partial<SyncJob> = {}): SyncJob => ({
    id: `job-${Math.random().toString(36).substring(7)}`,
    type: 'icims_note',
    entityId: 'entity-123',
    entityType: 'scheduling_request',
    attempts: 0,
    maxAttempts: 5,
    status: 'pending',
    lastError: null,
    payload: { test: true },
    runAfter: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  describe('createSyncJob', () => {
    it('should create a sync job', async () => {
      const job = createTestJob({ id: 'job-1' });

      const created = await createSyncJob(job);

      expect(created.id).toBe('job-1');
      expect(created.type).toBe('icims_note');
      expect(created.status).toBe('pending');
    });

    it('should store payload correctly', async () => {
      const job = createTestJob({
        payload: {
          applicationId: 'APP-123',
          noteText: 'Test note content',
          noteType: 'link_created',
        },
      });

      const created = await createSyncJob(job);

      expect(created.payload).toEqual({
        applicationId: 'APP-123',
        noteText: 'Test note content',
        noteType: 'link_created',
      });
    });
  });

  describe('getSyncJobById', () => {
    it('should retrieve job by ID', async () => {
      const job = createTestJob({ id: 'job-find-me' });
      await createSyncJob(job);

      const found = await getSyncJobById('job-find-me');

      expect(found).not.toBeNull();
      expect(found?.id).toBe('job-find-me');
    });

    it('should return null for non-existent job', async () => {
      const found = await getSyncJobById('non-existent');

      expect(found).toBeNull();
    });
  });

  describe('updateSyncJob', () => {
    it('should update job status', async () => {
      const job = createTestJob({ id: 'job-update' });
      await createSyncJob(job);

      const updated = await updateSyncJob('job-update', { status: 'processing' });

      expect(updated?.status).toBe('processing');
    });

    it('should update attempts and lastError', async () => {
      const job = createTestJob({ id: 'job-retry' });
      await createSyncJob(job);

      const updated = await updateSyncJob('job-retry', {
        attempts: 2,
        lastError: 'Connection timeout',
      });

      expect(updated?.attempts).toBe(2);
      expect(updated?.lastError).toBe('Connection timeout');
    });

    it('should update runAfter for backoff', async () => {
      const job = createTestJob({ id: 'job-backoff' });
      await createSyncJob(job);

      const futureDate = new Date(Date.now() + 300000);
      const updated = await updateSyncJob('job-backoff', { runAfter: futureDate });

      expect(updated?.runAfter.getTime()).toBe(futureDate.getTime());
    });

    it('should return null for non-existent job', async () => {
      const updated = await updateSyncJob('non-existent', { status: 'completed' });

      expect(updated).toBeNull();
    });

    it('should update the updatedAt timestamp', async () => {
      const oldDate = new Date('2025-01-01');
      const job = createTestJob({ id: 'job-timestamp', updatedAt: oldDate });
      await createSyncJob(job);

      const updated = await updateSyncJob('job-timestamp', { status: 'completed' });

      expect(updated?.updatedAt.getTime()).toBeGreaterThan(oldDate.getTime());
    });
  });

  describe('getPendingSyncJobs', () => {
    it('should return pending jobs that are ready to run', async () => {
      const pastDate = new Date(Date.now() - 60000);
      const job1 = createTestJob({ id: 'job-ready-1', runAfter: pastDate });
      const job2 = createTestJob({ id: 'job-ready-2', runAfter: pastDate });

      await createSyncJob(job1);
      await createSyncJob(job2);

      const pending = await getPendingSyncJobs();

      expect(pending).toHaveLength(2);
    });

    it('should not return jobs scheduled for the future', async () => {
      const pastDate = new Date(Date.now() - 60000);
      const futureDate = new Date(Date.now() + 60000);

      const readyJob = createTestJob({ id: 'job-ready', runAfter: pastDate });
      const futureJob = createTestJob({ id: 'job-future', runAfter: futureDate });

      await createSyncJob(readyJob);
      await createSyncJob(futureJob);

      const pending = await getPendingSyncJobs();

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('job-ready');
    });

    it('should not return completed or failed jobs', async () => {
      const pastDate = new Date(Date.now() - 60000);

      const pendingJob = createTestJob({ id: 'job-pending', runAfter: pastDate, status: 'pending' });
      const completedJob = createTestJob({ id: 'job-completed', runAfter: pastDate, status: 'completed' });
      const failedJob = createTestJob({ id: 'job-failed', runAfter: pastDate, status: 'failed' });

      await createSyncJob(pendingJob);
      await createSyncJob(completedJob);
      await createSyncJob(failedJob);

      const pending = await getPendingSyncJobs();

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('job-pending');
    });

    it('should not return processing jobs', async () => {
      const pastDate = new Date(Date.now() - 60000);

      const pendingJob = createTestJob({ id: 'job-pending', runAfter: pastDate, status: 'pending' });
      const processingJob = createTestJob({ id: 'job-processing', runAfter: pastDate, status: 'processing' });

      await createSyncJob(pendingJob);
      await createSyncJob(processingJob);

      const pending = await getPendingSyncJobs();

      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('job-pending');
    });

    it('should respect the limit parameter', async () => {
      const pastDate = new Date(Date.now() - 60000);

      for (let i = 0; i < 15; i++) {
        await createSyncJob(createTestJob({ id: `job-${i}`, runAfter: pastDate }));
      }

      const limited = await getPendingSyncJobs(5);

      expect(limited).toHaveLength(5);
    });

    it('should order by runAfter (oldest first)', async () => {
      const date1 = new Date(Date.now() - 120000);
      const date2 = new Date(Date.now() - 60000);
      const date3 = new Date(Date.now() - 30000);

      await createSyncJob(createTestJob({ id: 'job-middle', runAfter: date2 }));
      await createSyncJob(createTestJob({ id: 'job-newest', runAfter: date3 }));
      await createSyncJob(createTestJob({ id: 'job-oldest', runAfter: date1 }));

      const pending = await getPendingSyncJobs();

      expect(pending[0].id).toBe('job-oldest');
      expect(pending[1].id).toBe('job-middle');
      expect(pending[2].id).toBe('job-newest');
    });
  });

  describe('getSyncJobsByEntityId', () => {
    it('should return all jobs for an entity', async () => {
      const job1 = createTestJob({ id: 'job-1', entityId: 'entity-A' });
      const job2 = createTestJob({ id: 'job-2', entityId: 'entity-A' });
      const job3 = createTestJob({ id: 'job-3', entityId: 'entity-B' });

      await createSyncJob(job1);
      await createSyncJob(job2);
      await createSyncJob(job3);

      const jobsA = await getSyncJobsByEntityId('entity-A');
      const jobsB = await getSyncJobsByEntityId('entity-B');

      expect(jobsA).toHaveLength(2);
      expect(jobsB).toHaveLength(1);
    });

    it('should order by createdAt descending (newest first)', async () => {
      const date1 = new Date('2026-01-01');
      const date2 = new Date('2026-01-02');
      const date3 = new Date('2026-01-03');

      await createSyncJob(createTestJob({ id: 'job-oldest', entityId: 'entity-A', createdAt: date1 }));
      await createSyncJob(createTestJob({ id: 'job-newest', entityId: 'entity-A', createdAt: date3 }));
      await createSyncJob(createTestJob({ id: 'job-middle', entityId: 'entity-A', createdAt: date2 }));

      const jobs = await getSyncJobsByEntityId('entity-A');

      expect(jobs[0].id).toBe('job-newest');
      expect(jobs[1].id).toBe('job-middle');
      expect(jobs[2].id).toBe('job-oldest');
    });

    it('should return empty array for entity with no jobs', async () => {
      const jobs = await getSyncJobsByEntityId('non-existent-entity');

      expect(jobs).toEqual([]);
    });
  });

  describe('getLatestSyncJobByEntityId', () => {
    it('should return the most recent job for an entity', async () => {
      const date1 = new Date('2026-01-01');
      const date2 = new Date('2026-01-02');

      await createSyncJob(createTestJob({ id: 'job-older', entityId: 'entity-A', createdAt: date1 }));
      await createSyncJob(createTestJob({ id: 'job-newer', entityId: 'entity-A', createdAt: date2 }));

      const latest = await getLatestSyncJobByEntityId('entity-A');

      expect(latest?.id).toBe('job-newer');
    });

    it('should return null for entity with no jobs', async () => {
      const latest = await getLatestSyncJobByEntityId('non-existent');

      expect(latest).toBeNull();
    });
  });
});
