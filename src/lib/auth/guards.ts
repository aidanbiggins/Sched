/**
 * Auth Guard Utilities
 *
 * Helper functions for checking authentication and authorization.
 */

import { Session } from 'next-auth';
import type { OrgMemberRole } from '@/types/organization';

/**
 * Extended session type with organization info
 */
export interface ExtendedSession extends Session {
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    isSuperadmin: boolean;
    activeOrgId?: string | null;
    activeOrgRole?: OrgMemberRole | null;
    organizations?: Array<{
      id: string;
      name: string;
      slug: string;
      role: OrgMemberRole;
    }>;
  };
}

/**
 * Check if session has authenticated user
 */
export function requireUser(session: Session | null): session is ExtendedSession {
  return session?.user?.id != null && session?.user?.email != null;
}

/**
 * Check if session has active organization
 */
export function requireOrg(session: Session | null): boolean {
  if (!requireUser(session)) return false;
  const extSession = session as ExtendedSession;
  return !!extSession.user.activeOrgId;
}

/**
 * Check if user has at least the specified role in active org
 */
export function requireRole(session: Session | null, minRole: OrgMemberRole): boolean {
  if (!requireOrg(session)) return false;
  const extSession = session as ExtendedSession;

  // Superadmin bypasses role checks
  if (extSession.user.isSuperadmin) return true;

  const userRole = extSession.user.activeOrgRole;
  if (!userRole) return false;

  // Role hierarchy: admin > member
  if (minRole === 'member') {
    return userRole === 'member' || userRole === 'admin';
  }
  if (minRole === 'admin') {
    return userRole === 'admin';
  }

  return false;
}

/**
 * Check if user is org admin in active org
 */
export function requireOrgAdmin(session: Session | null): boolean {
  return requireRole(session, 'admin');
}

/**
 * Check if user is superadmin
 */
export function requireSuperadmin(session: Session | null): boolean {
  if (!requireUser(session)) return false;
  const extSession = session as ExtendedSession;
  return extSession.user.isSuperadmin === true;
}

/**
 * Get the active organization ID from session
 */
export function getActiveOrgId(session: Session | null): string | null {
  if (!requireUser(session)) return null;
  const extSession = session as ExtendedSession;
  return extSession.user.activeOrgId || null;
}

/**
 * Get the user's role in active org
 */
export function getActiveOrgRole(session: Session | null): OrgMemberRole | null {
  if (!requireUser(session)) return null;
  const extSession = session as ExtendedSession;
  return extSession.user.activeOrgRole || null;
}
