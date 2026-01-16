/**
 * Tests for iCIMS HTTP Helper
 */

import { generateIdempotencyKey } from '@/lib/icims/icimsHttp';
import { resetIcimsMetrics } from '@/lib/icims/icimsMetrics';

describe('iCIMS HTTP Helper', () => {
  beforeEach(() => {
    resetIcimsMetrics();
  });

  describe('generateIdempotencyKey', () => {
    it('generates deterministic key for same inputs', () => {
      const noteText = 'Interview scheduled: 2026-01-16 at 2:00 PM';
      const applicationId = 'APP-123';

      const key1 = generateIdempotencyKey(applicationId, noteText);
      const key2 = generateIdempotencyKey(applicationId, noteText);

      expect(key1).toBe(key2);
    });

    it('generates different keys for different note text', () => {
      const applicationId = 'APP-123';

      const key1 = generateIdempotencyKey(applicationId, 'Note A');
      const key2 = generateIdempotencyKey(applicationId, 'Note B');

      expect(key1).not.toBe(key2);
    });

    it('generates different keys for different application IDs', () => {
      const noteText = 'Same note';

      const key1 = generateIdempotencyKey('APP-123', noteText);
      const key2 = generateIdempotencyKey('APP-456', noteText);

      expect(key1).not.toBe(key2);
    });

    it('follows expected key format', () => {
      const key = generateIdempotencyKey('APP-123', 'Test note');

      // Format: sched-{applicationId}-{hash}-{date}
      expect(key).toMatch(/^sched-APP-123-[a-f0-9]+-\d{4}-\d{2}-\d{2}$/);
    });

    it('includes current date in key', () => {
      const key = generateIdempotencyKey('APP-123', 'Test note');
      const today = new Date().toISOString().split('T')[0];

      expect(key).toContain(today);
    });

    it('generates consistent hash for same content', () => {
      // Same note should produce same hash portion
      const note = 'Interview scheduled with John Smith';
      const key1 = generateIdempotencyKey('APP-123', note);
      const key2 = generateIdempotencyKey('APP-123', note);

      // Extract hash portion (between second hyphen and date)
      const hash1 = key1.split('-')[2];
      const hash2 = key2.split('-')[2];

      expect(hash1).toBe(hash2);
    });

    it('handles empty note text', () => {
      const key = generateIdempotencyKey('APP-123', '');

      expect(key).toMatch(/^sched-APP-123-[a-f0-9]+-\d{4}-\d{2}-\d{2}$/);
    });

    it('handles special characters in note text', () => {
      const note = 'Note with special chars: @#$%^&*()';
      const key = generateIdempotencyKey('APP-123', note);

      expect(key).toMatch(/^sched-APP-123-[a-f0-9]+-\d{4}-\d{2}-\d{2}$/);
    });

    it('handles unicode characters', () => {
      const note = 'Interview with 李明 at 下午2:00';
      const key = generateIdempotencyKey('APP-123', note);

      expect(key).toMatch(/^sched-APP-123-[a-f0-9]+-\d{4}-\d{2}-\d{2}$/);
    });

    it('handles very long note text', () => {
      const note = 'A'.repeat(10000);
      const key = generateIdempotencyKey('APP-123', note);

      // Key should be reasonably sized regardless of input length
      expect(key.length).toBeLessThan(100);
    });
  });
});

// Note: icimsRequest tests require mocking fetch, which is covered
// in the integration tests with more comprehensive scenarios
