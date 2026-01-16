/**
 * Superadmin Tests
 */

import { isSuperadmin, getSuperadminEmails } from '@/lib/auth/superadmin';

describe('Superadmin', () => {
  const originalEnv = process.env.SUPERADMIN_EMAILS;

  afterEach(() => {
    // Restore original env
    if (originalEnv === undefined) {
      delete process.env.SUPERADMIN_EMAILS;
    } else {
      process.env.SUPERADMIN_EMAILS = originalEnv;
    }
  });

  describe('getSuperadminEmails', () => {
    it('should return default superadmin when env not set', () => {
      delete process.env.SUPERADMIN_EMAILS;
      const emails = getSuperadminEmails();
      expect(emails).toContain('aidanbiggins@gmail.com');
    });

    it('should parse comma-separated emails from env', () => {
      process.env.SUPERADMIN_EMAILS = 'admin@test.com, super@test.com';
      const emails = getSuperadminEmails();
      expect(emails).toContain('admin@test.com');
      expect(emails).toContain('super@test.com');
    });

    it('should handle single email', () => {
      process.env.SUPERADMIN_EMAILS = 'single@test.com';
      const emails = getSuperadminEmails();
      expect(emails).toEqual(['single@test.com']);
    });

    it('should trim whitespace', () => {
      process.env.SUPERADMIN_EMAILS = '  spaced@test.com  ,  other@test.com  ';
      const emails = getSuperadminEmails();
      expect(emails).toEqual(['spaced@test.com', 'other@test.com']);
    });

    it('should filter empty entries', () => {
      process.env.SUPERADMIN_EMAILS = 'valid@test.com,,';
      const emails = getSuperadminEmails();
      expect(emails).toEqual(['valid@test.com']);
    });
  });

  describe('isSuperadmin', () => {
    beforeEach(() => {
      process.env.SUPERADMIN_EMAILS = 'admin@test.com,super@test.com';
    });

    it('should return true for superadmin email', () => {
      expect(isSuperadmin('admin@test.com')).toBe(true);
      expect(isSuperadmin('super@test.com')).toBe(true);
    });

    it('should return false for non-superadmin email', () => {
      expect(isSuperadmin('user@test.com')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isSuperadmin('ADMIN@TEST.COM')).toBe(true);
      expect(isSuperadmin('Admin@Test.Com')).toBe(true);
    });

    it('should return false for null', () => {
      expect(isSuperadmin(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isSuperadmin(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSuperadmin('')).toBe(false);
    });
  });
});
