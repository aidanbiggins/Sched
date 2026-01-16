/**
 * Organization Invite Database Operations
 *
 * Memory adapter for managing organization invites.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  OrgInvite,
  InviteStatus,
  CreateInviteInput,
  AcceptInviteInput,
  InviteWithOrg,
} from '@/types/invite';
import { getOrganizationById, addOrgMember } from './organizations';

// In-memory storage for invites
// Use globalThis to persist across Next.js hot reloads in development
const globalForInvites = globalThis as unknown as {
  invitesStore: Map<string, OrgInvite> | undefined;
};

const invitesStore = globalForInvites.invitesStore ?? new Map<string, OrgInvite>();

if (process.env.NODE_ENV !== 'production') {
  globalForInvites.invitesStore = invitesStore;
}

/**
 * Generate a unique, URL-safe invite code
 */
export function generateInviteCode(): string {
  // Generate a short, memorable code (base62-ish)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a new invite
 */
export async function createInvite(input: CreateInviteInput): Promise<OrgInvite> {
  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + (input.expiresInDays || 7));

  const invite: OrgInvite = {
    id: uuidv4(),
    organizationId: input.organizationId,
    email: input.email || null,
    inviteCode: generateInviteCode(),
    role: input.role,
    status: 'pending',
    invitedBy: input.invitedBy,
    createdAt: now,
    expiresAt,
    acceptedAt: null,
    acceptedBy: null,
  };

  invitesStore.set(invite.id, invite);
  return invite;
}

/**
 * Get invite by ID
 */
export async function getInviteById(id: string): Promise<OrgInvite | null> {
  return invitesStore.get(id) || null;
}

/**
 * Get invite by code
 */
export async function getInviteByCode(code: string): Promise<OrgInvite | null> {
  for (const invite of invitesStore.values()) {
    if (invite.inviteCode === code) {
      return invite;
    }
  }
  return null;
}

/**
 * Get invite by code with organization details
 */
export async function getInviteWithOrg(code: string): Promise<InviteWithOrg | null> {
  const invite = await getInviteByCode(code);
  if (!invite) return null;

  const org = await getOrganizationById(invite.organizationId);
  if (!org) return null;

  return {
    ...invite,
    organizationName: org.name,
    organizationSlug: org.slug,
  };
}

/**
 * Get all invites for an organization
 */
export async function getOrgInvites(organizationId: string): Promise<OrgInvite[]> {
  const invites: OrgInvite[] = [];

  for (const invite of invitesStore.values()) {
    if (invite.organizationId === organizationId) {
      invites.push(invite);
    }
  }

  // Sort by creation date, newest first
  return invites.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/**
 * Get pending invites for an organization
 */
export async function getPendingInvites(organizationId: string): Promise<OrgInvite[]> {
  const invites = await getOrgInvites(organizationId);
  const now = new Date();

  return invites.filter(invite => {
    if (invite.status !== 'pending') return false;
    if (invite.expiresAt < now) {
      // Auto-expire the invite
      invite.status = 'expired';
      invitesStore.set(invite.id, invite);
      return false;
    }
    return true;
  });
}

/**
 * Get invites by email (for showing available invites on sign-in)
 */
export async function getInvitesByEmail(email: string): Promise<InviteWithOrg[]> {
  const results: InviteWithOrg[] = [];
  const now = new Date();

  for (const invite of invitesStore.values()) {
    if (invite.email?.toLowerCase() === email.toLowerCase() && invite.status === 'pending') {
      // Check expiration
      if (invite.expiresAt < now) {
        invite.status = 'expired';
        invitesStore.set(invite.id, invite);
        continue;
      }

      const org = await getOrganizationById(invite.organizationId);
      if (org) {
        results.push({
          ...invite,
          organizationName: org.name,
          organizationSlug: org.slug,
        });
      }
    }
  }

  return results;
}

/**
 * Accept an invite
 */
export async function acceptInvite(
  input: AcceptInviteInput
): Promise<{ success: boolean; error?: string; invite?: OrgInvite }> {
  const invite = await getInviteByCode(input.inviteCode);

  if (!invite) {
    return { success: false, error: 'Invite not found' };
  }

  if (invite.status !== 'pending') {
    return { success: false, error: `Invite has already been ${invite.status}` };
  }

  const now = new Date();
  if (invite.expiresAt < now) {
    invite.status = 'expired';
    invitesStore.set(invite.id, invite);
    return { success: false, error: 'Invite has expired' };
  }

  // Add user to organization
  await addOrgMember(
    invite.organizationId,
    input.userId,
    invite.role,
    invite.invitedBy
  );

  // Mark invite as accepted
  const updatedInvite: OrgInvite = {
    ...invite,
    status: 'accepted',
    acceptedAt: now,
    acceptedBy: input.userId,
  };

  invitesStore.set(invite.id, updatedInvite);

  return { success: true, invite: updatedInvite };
}

/**
 * Revoke an invite
 */
export async function revokeInvite(inviteId: string): Promise<OrgInvite | null> {
  const invite = invitesStore.get(inviteId);
  if (!invite || invite.status !== 'pending') {
    return null;
  }

  const updated: OrgInvite = {
    ...invite,
    status: 'revoked',
  };

  invitesStore.set(inviteId, updated);
  return updated;
}

/**
 * Delete an invite
 */
export async function deleteInvite(inviteId: string): Promise<boolean> {
  return invitesStore.delete(inviteId);
}

/**
 * Check if an email already has a pending invite for an organization
 */
export async function hasPendingInvite(
  organizationId: string,
  email: string
): Promise<boolean> {
  const now = new Date();

  for (const invite of invitesStore.values()) {
    if (
      invite.organizationId === organizationId &&
      invite.email?.toLowerCase() === email.toLowerCase() &&
      invite.status === 'pending' &&
      invite.expiresAt > now
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Clean up expired invites (can be called periodically)
 */
export async function cleanupExpiredInvites(): Promise<number> {
  const now = new Date();
  let count = 0;

  for (const invite of invitesStore.values()) {
    if (invite.status === 'pending' && invite.expiresAt < now) {
      invite.status = 'expired';
      invitesStore.set(invite.id, invite);
      count++;
    }
  }

  return count;
}

/**
 * Reset invites store (for testing)
 */
export function resetInvitesStore(): void {
  invitesStore.clear();
}
