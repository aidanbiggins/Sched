/**
 * Job Run Service Tests
 */

import { memoryJobRunService, resetMemoryJobRuns } from '../jobRuns';

describe('memoryJobRunService', () => {
  beforeEach(() => {
    resetMemoryJobRuns();
  });

  describe('create', () => {
    it('should create a job run', async () => {
      const jobRun = await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-1',
        queueDepthBefore: 10,
      });

      expect(jobRun.id).toBeDefined();
      expect(jobRun.jobName).toBe('notify');
      expect(jobRun.triggeredBy).toBe('cron');
      expect(jobRun.instanceId).toBe('instance-1');
      expect(jobRun.status).toBe('running');
      expect(jobRun.queueDepthBefore).toBe(10);
      expect(jobRun.processed).toBe(0);
      expect(jobRun.failed).toBe(0);
    });
  });

  describe('update', () => {
    it('should update a job run', async () => {
      const jobRun = await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-1',
      });

      const finishedAt = new Date();
      const updated = await memoryJobRunService.update(jobRun.id, {
        finishedAt,
        durationMs: 1500,
        status: 'completed',
        processed: 5,
        failed: 1,
        skipped: 0,
        queueDepthAfter: 4,
      });

      expect(updated).not.toBe(null);
      expect(updated?.status).toBe('completed');
      expect(updated?.processed).toBe(5);
      expect(updated?.failed).toBe(1);
      expect(updated?.durationMs).toBe(1500);
      expect(updated?.queueDepthAfter).toBe(4);
    });

    it('should return null for non-existent job run', async () => {
      const updated = await memoryJobRunService.update('non-existent', {
        finishedAt: new Date(),
        durationMs: 1000,
        status: 'completed',
        processed: 0,
        failed: 0,
        skipped: 0,
      });

      expect(updated).toBe(null);
    });
  });

  describe('getById', () => {
    it('should return job run by id', async () => {
      const jobRun = await memoryJobRunService.create({
        jobName: 'sync',
        triggeredBy: 'manual',
        instanceId: 'instance-1',
      });

      const found = await memoryJobRunService.getById(jobRun.id);
      expect(found).not.toBe(null);
      expect(found?.id).toBe(jobRun.id);
    });

    it('should return null for non-existent id', async () => {
      const found = await memoryJobRunService.getById('non-existent');
      expect(found).toBe(null);
    });
  });

  describe('getLatestByJob', () => {
    it('should return latest job run for job name', async () => {
      await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-1',
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const latest = await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-2',
      });

      const found = await memoryJobRunService.getLatestByJob('notify');
      expect(found?.id).toBe(latest.id);
    });

    it('should return null when no runs exist', async () => {
      const found = await memoryJobRunService.getLatestByJob('notify');
      expect(found).toBe(null);
    });
  });

  describe('getRecent', () => {
    it('should return recent job runs', async () => {
      await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-1',
      });
      await memoryJobRunService.create({
        jobName: 'sync',
        triggeredBy: 'manual',
        instanceId: 'instance-2',
      });

      const recent = await memoryJobRunService.getRecent(10);
      expect(recent.length).toBe(2);
    });

    it('should respect limit', async () => {
      for (let i = 0; i < 5; i++) {
        await memoryJobRunService.create({
          jobName: 'notify',
          triggeredBy: 'cron',
          instanceId: `instance-${i}`,
        });
      }

      const recent = await memoryJobRunService.getRecent(3);
      expect(recent.length).toBe(3);
    });
  });

  describe('getByJobName', () => {
    it('should return runs for specific job', async () => {
      await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-1',
      });
      await memoryJobRunService.create({
        jobName: 'sync',
        triggeredBy: 'cron',
        instanceId: 'instance-2',
      });
      await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'manual',
        instanceId: 'instance-3',
      });

      const notifyRuns = await memoryJobRunService.getByJobName('notify');
      expect(notifyRuns.length).toBe(2);
      expect(notifyRuns.every((r) => r.jobName === 'notify')).toBe(true);
    });
  });

  describe('getFailureRate24h', () => {
    it('should return 0 when no runs exist', async () => {
      const rate = await memoryJobRunService.getFailureRate24h('notify');
      expect(rate).toBe(0);
    });

    it('should calculate failure rate correctly', async () => {
      // Create 4 runs: 2 completed, 1 failed, 1 running
      const run1 = await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-1',
      });
      await memoryJobRunService.update(run1.id, {
        finishedAt: new Date(),
        durationMs: 100,
        status: 'completed',
        processed: 1,
        failed: 0,
        skipped: 0,
      });

      const run2 = await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-2',
      });
      await memoryJobRunService.update(run2.id, {
        finishedAt: new Date(),
        durationMs: 100,
        status: 'completed',
        processed: 1,
        failed: 0,
        skipped: 0,
      });

      const run3 = await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-3',
      });
      await memoryJobRunService.update(run3.id, {
        finishedAt: new Date(),
        durationMs: 100,
        status: 'failed',
        processed: 0,
        failed: 1,
        skipped: 0,
      });

      // This one is still running, should be excluded
      await memoryJobRunService.create({
        jobName: 'notify',
        triggeredBy: 'cron',
        instanceId: 'instance-4',
      });

      const rate = await memoryJobRunService.getFailureRate24h('notify');
      // 1 failed out of 3 completed/failed = 33.33%
      expect(rate).toBeCloseTo(1 / 3, 2);
    });
  });
});
