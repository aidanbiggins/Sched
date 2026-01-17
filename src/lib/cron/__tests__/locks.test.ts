/**
 * Lock Service Tests
 */

import { memoryLockService, resetMemoryLocks } from '../locks';

describe('memoryLockService', () => {
  beforeEach(() => {
    resetMemoryLocks();
  });

  describe('acquire', () => {
    it('should acquire lock when not held', async () => {
      const result = await memoryLockService.acquire('notify', 'instance-1');
      expect(result).toBe(true);
    });

    it('should fail to acquire lock held by another instance', async () => {
      await memoryLockService.acquire('notify', 'instance-1');
      const result = await memoryLockService.acquire('notify', 'instance-2');
      expect(result).toBe(false);
    });

    it('should allow same instance to extend lock', async () => {
      await memoryLockService.acquire('notify', 'instance-1');
      const result = await memoryLockService.acquire('notify', 'instance-1');
      expect(result).toBe(true);
    });

    it('should acquire expired lock', async () => {
      // Acquire with very short TTL
      await memoryLockService.acquire('notify', 'instance-1', 1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await memoryLockService.acquire('notify', 'instance-2');
      expect(result).toBe(true);
    });

    it('should handle different job names independently', async () => {
      await memoryLockService.acquire('notify', 'instance-1');
      const result = await memoryLockService.acquire('sync', 'instance-2');
      expect(result).toBe(true);
    });
  });

  describe('release', () => {
    it('should release lock held by instance', async () => {
      await memoryLockService.acquire('notify', 'instance-1');
      const result = await memoryLockService.release('notify', 'instance-1');
      expect(result).toBe(true);
    });

    it('should fail to release lock held by another instance', async () => {
      await memoryLockService.acquire('notify', 'instance-1');
      const result = await memoryLockService.release('notify', 'instance-2');
      expect(result).toBe(false);
    });

    it('should succeed when releasing non-existent lock', async () => {
      const result = await memoryLockService.release('notify', 'instance-1');
      expect(result).toBe(true);
    });

    it('should allow new instance to acquire after release', async () => {
      await memoryLockService.acquire('notify', 'instance-1');
      await memoryLockService.release('notify', 'instance-1');
      const result = await memoryLockService.acquire('notify', 'instance-2');
      expect(result).toBe(true);
    });
  });

  describe('isHeld', () => {
    it('should return false for unheld lock', async () => {
      const result = await memoryLockService.isHeld('notify');
      expect(result).toBe(false);
    });

    it('should return true for held lock', async () => {
      await memoryLockService.acquire('notify', 'instance-1');
      const result = await memoryLockService.isHeld('notify');
      expect(result).toBe(true);
    });

    it('should return false for expired lock', async () => {
      await memoryLockService.acquire('notify', 'instance-1', 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result = await memoryLockService.isHeld('notify');
      expect(result).toBe(false);
    });
  });

  describe('getHolder', () => {
    it('should return null for unheld lock', async () => {
      const result = await memoryLockService.getHolder('notify');
      expect(result).toBe(null);
    });

    it('should return lock info for held lock', async () => {
      await memoryLockService.acquire('notify', 'instance-1');
      const result = await memoryLockService.getHolder('notify');
      expect(result).not.toBe(null);
      expect(result?.lockedBy).toBe('instance-1');
      expect(result?.jobName).toBe('notify');
    });

    it('should return null for expired lock', async () => {
      await memoryLockService.acquire('notify', 'instance-1', 1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const result = await memoryLockService.getHolder('notify');
      expect(result).toBe(null);
    });
  });
});
