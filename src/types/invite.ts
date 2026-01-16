/**
 * Organization Invite Types
 *
 * Types for inviting users to organizations.
 */

import type { OrgMemberRole } from './organization';

export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';

/**
 * Organization Invite - An invitation to join an organization
 */
export interface OrgInvite {
  id: string;
  organizationId: string;

  // Invite details
  email: string | null; // null for link-only invites
  inviteCode: string;
  role: OrgMemberRole;
  status: InviteStatus;

  // Invitation tracking
  invitedBy: string; // user ID
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  acceptedBy: string | null; // user ID who accepted
}

/**
 * Create invite input
 */
export interface CreateInviteInput {
  organizationId: string;
  email?: string;
  role: OrgMemberRole;
  invitedBy: string;
  expiresInDays?: number; // default 7
}

/**
 * Invite with organization details (for display)
 */
export interface InviteWithOrg extends OrgInvite {
  organizationName: string;
  organizationSlug: string;
  inviterName?: string;
}

/**
 * Accept invite input
 */
export interface AcceptInviteInput {
  inviteCode: string;
  userId: string;
}
