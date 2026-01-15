/**
 * Unit tests for Token Utilities
 */

import {
  generatePublicToken,
  hashToken,
  calculateTokenExpiry,
  isTokenExpired,
  getTokenTtlDays,
} from '@/lib/utils/tokens';

describe('Token Utilities', () => {
  describe('generatePublicToken', () => {
    it('generates a 64-character hex token', () => {
      const { token } = generatePublicToken();
      expect(token).toMatch(/^[a-f0-9]{64}$/);
    });

    it('generates unique tokens', () => {
      const tokens = new Set(
        Array.from({ length: 100 }, () => generatePublicToken().token)
      );
      expect(tokens.size).toBe(100);
    });

    it('returns both token and tokenHash', () => {
      const result = generatePublicToken();
      expect(result.token).toBeDefined();
      expect(result.tokenHash).toBeDefined();
      expect(result.token).not.toBe(result.tokenHash);
    });

    it('tokenHash is deterministic for same token', () => {
      const { token, tokenHash } = generatePublicToken();
      const hash2 = hashToken(token);
      expect(tokenHash).toBe(hash2);
    });
  });

  describe('hashToken', () => {
    it('produces consistent hash for same input', () => {
      const token = 'test-token-123';
      const hash1 = hashToken(token);
      const hash2 = hashToken(token);
      expect(hash1).toBe(hash2);
    });

    it('produces different hashes for different tokens', () => {
      const hash1 = hashToken('token-a');
      const hash2 = hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });

    it('produces a 64-character hex hash (SHA-256)', () => {
      const hash = hashToken('any-token');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('calculateTokenExpiry', () => {
    it('calculates expiry based on TTL days', () => {
      const ttlDays = getTokenTtlDays();
      const now = new Date();
      const expiry = calculateTokenExpiry(now);

      const expectedMs = ttlDays * 24 * 60 * 60 * 1000;
      const actualMs = expiry.getTime() - now.getTime();

      expect(actualMs).toBe(expectedMs);
    });

    it('defaults to current time if no date provided', () => {
      const before = new Date();
      const expiry = calculateTokenExpiry();
      const after = new Date();

      const ttlDays = getTokenTtlDays();
      const ttlMs = ttlDays * 24 * 60 * 60 * 1000;

      expect(expiry.getTime()).toBeGreaterThanOrEqual(before.getTime() + ttlMs);
      expect(expiry.getTime()).toBeLessThanOrEqual(after.getTime() + ttlMs + 1000);
    });
  });

  describe('isTokenExpired', () => {
    it('returns false for future date', () => {
      const futureDate = new Date(Date.now() + 1000 * 60 * 60);
      expect(isTokenExpired(futureDate)).toBe(false);
    });

    it('returns true for past date', () => {
      const pastDate = new Date(Date.now() - 1000);
      expect(isTokenExpired(pastDate)).toBe(true);
    });

    it('returns false when expiry equals now (not yet expired)', () => {
      // Edge case: expiry exactly at now is not expired (using > not >=)
      const now = new Date();
      // At the instant of expiry, it's still technically valid
      // (will become expired 1ms later)
      expect(isTokenExpired(now)).toBe(false);
    });
  });

  describe('getTokenTtlDays', () => {
    it('returns a positive number', () => {
      const ttl = getTokenTtlDays();
      expect(typeof ttl).toBe('number');
      expect(ttl).toBeGreaterThan(0);
    });

    it('returns 14 as default', () => {
      // This assumes PUBLIC_LINK_TTL_DAYS is not set or is set to 14
      const ttl = getTokenTtlDays();
      expect(ttl).toBe(14);
    });
  });
});
