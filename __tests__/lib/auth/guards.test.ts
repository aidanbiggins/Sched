/**
 * Auth Guards Tests
 */

import {
  requireUser,
  requireOrg,
  requireRole,
  requireOrgAdmin,
  requireSuperadmin,
  getActiveOrgId,
  getActiveOrgRole,
  ExtendedSession,
} from '@/lib/auth/guards';

describe('Auth Guards', () => {
  const createSession = (overrides: Partial<ExtendedSession['user']> = {}): ExtendedSession => ({
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      image: null,
      isSuperadmin: false,
      activeOrgId: 'org-123',
      activeOrgRole: 'member',
      organizations: [
        { id: 'org-123', name: 'Test Org', slug: 'test-org', role: 'member' },
      ],
      ...overrides,
    },
    expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  describe('requireUser', () => {
    it('should return true for valid session', () => {
      const session = createSession();
      expect(requireUser(session)).toBe(true);
    });

    it('should return false for null session', () => {
      expect(requireUser(null)).toBe(false);
    });

    it('should return false for session without user id', () => {
      const session = createSession({ id: undefined as unknown as string });
      expect(requireUser(session)).toBe(false);
    });

    it('should return false for session without email', () => {
      const session = createSession({ email: undefined as unknown as string });
      expect(requireUser(session)).toBe(false);
    });
  });

  describe('requireOrg', () => {
    it('should return true when user has active org', () => {
      const session = createSession();
      expect(requireOrg(session)).toBe(true);
    });

    it('should return false when no active org', () => {
      const session = createSession({ activeOrgId: null });
      expect(requireOrg(session)).toBe(false);
    });

    it('should return false for null session', () => {
      expect(requireOrg(null)).toBe(false);
    });
  });

  describe('requireRole', () => {
    it('should return true for member with member role required', () => {
      const session = createSession({ activeOrgRole: 'member' });
      expect(requireRole(session, 'member')).toBe(true);
    });

    it('should return true for admin with member role required', () => {
      const session = createSession({ activeOrgRole: 'admin' });
      expect(requireRole(session, 'member')).toBe(true);
    });

    it('should return true for admin with admin role required', () => {
      const session = createSession({ activeOrgRole: 'admin' });
      expect(requireRole(session, 'admin')).toBe(true);
    });

    it('should return false for member with admin role required', () => {
      const session = createSession({ activeOrgRole: 'member' });
      expect(requireRole(session, 'admin')).toBe(false);
    });

    it('should return true for superadmin regardless of org role', () => {
      const session = createSession({ isSuperadmin: true, activeOrgRole: 'member' });
      expect(requireRole(session, 'admin')).toBe(true);
    });

    it('should return false for null session', () => {
      expect(requireRole(null, 'member')).toBe(false);
    });
  });

  describe('requireOrgAdmin', () => {
    it('should return true for org admin', () => {
      const session = createSession({ activeOrgRole: 'admin' });
      expect(requireOrgAdmin(session)).toBe(true);
    });

    it('should return false for org member', () => {
      const session = createSession({ activeOrgRole: 'member' });
      expect(requireOrgAdmin(session)).toBe(false);
    });

    it('should return true for superadmin', () => {
      const session = createSession({ isSuperadmin: true, activeOrgRole: 'member' });
      expect(requireOrgAdmin(session)).toBe(true);
    });
  });

  describe('requireSuperadmin', () => {
    it('should return true for superadmin', () => {
      const session = createSession({ isSuperadmin: true });
      expect(requireSuperadmin(session)).toBe(true);
    });

    it('should return false for non-superadmin', () => {
      const session = createSession({ isSuperadmin: false });
      expect(requireSuperadmin(session)).toBe(false);
    });

    it('should return false for null session', () => {
      expect(requireSuperadmin(null)).toBe(false);
    });
  });

  describe('getActiveOrgId', () => {
    it('should return active org id', () => {
      const session = createSession({ activeOrgId: 'org-456' });
      expect(getActiveOrgId(session)).toBe('org-456');
    });

    it('should return null when no active org', () => {
      const session = createSession({ activeOrgId: null });
      expect(getActiveOrgId(session)).toBeNull();
    });

    it('should return null for null session', () => {
      expect(getActiveOrgId(null)).toBeNull();
    });
  });

  describe('getActiveOrgRole', () => {
    it('should return active org role', () => {
      const session = createSession({ activeOrgRole: 'admin' });
      expect(getActiveOrgRole(session)).toBe('admin');
    });

    it('should return null when no role', () => {
      const session = createSession({ activeOrgRole: null });
      expect(getActiveOrgRole(session)).toBeNull();
    });

    it('should return null for null session', () => {
      expect(getActiveOrgRole(null)).toBeNull();
    });
  });
});
