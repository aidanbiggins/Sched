/**
 * Organization Types
 *
 * Types for multi-tenant organization support.
 */

export type OrgMemberRole = 'admin' | 'member';

/**
 * Organization - A team or company using the scheduling system
 */
export interface Organization {
  id: string;
  name: string;
  slug: string;

  // Settings
  defaultTimezone: string;
  defaultDurationMinutes: number;

  // Limits
  maxMembers: number | null;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Organization Member - A user's membership in an organization
 */
export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrgMemberRole;

  // Invitation info
  invitedBy: string | null;
  invitedAt: Date | null;
  joinedAt: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User's organization membership with org details
 */
export interface UserOrgMembership {
  organization: Organization;
  role: OrgMemberRole;
  joinedAt: Date;
}

/**
 * Organization with member count
 */
export interface OrganizationWithMemberCount extends Organization {
  memberCount: number;
}

/**
 * Create organization input
 */
export interface CreateOrganizationInput {
  name: string;
  slug: string;
  defaultTimezone?: string;
  defaultDurationMinutes?: number;
}

/**
 * Update organization input
 */
export interface UpdateOrganizationInput {
  name?: string;
  defaultTimezone?: string;
  defaultDurationMinutes?: number;
  maxMembers?: number | null;
}
