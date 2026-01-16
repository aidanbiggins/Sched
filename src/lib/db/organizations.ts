/**
 * Organization Database Operations
 *
 * Memory adapter for organization management.
 */

import { v4 as uuidv4 } from 'uuid';
import type {
  Organization,
  OrgMember,
  OrgMemberRole,
  CreateOrganizationInput,
  UpdateOrganizationInput,
  UserOrgMembership,
} from '@/types/organization';

// In-memory storage for organizations
// Use globalThis to persist across Next.js hot reloads in development
const globalForOrgs = globalThis as unknown as {
  organizationsStore: Map<string, Organization> | undefined;
  orgMembersStore: Map<string, OrgMember> | undefined;
};

const organizationsStore = globalForOrgs.organizationsStore ?? new Map<string, Organization>();
const orgMembersStore = globalForOrgs.orgMembersStore ?? new Map<string, OrgMember>();

if (process.env.NODE_ENV !== 'production') {
  globalForOrgs.organizationsStore = organizationsStore;
  globalForOrgs.orgMembersStore = orgMembersStore;
}

/**
 * Generate a URL-friendly slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Check if a slug is available
 */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  for (const org of organizationsStore.values()) {
    if (org.slug === slug) return false;
  }
  return true;
}

/**
 * Create a new organization
 */
export async function createOrganization(
  input: CreateOrganizationInput,
  creatorUserId: string
): Promise<{ organization: Organization; membership: OrgMember }> {
  const now = new Date();
  const orgId = uuidv4();

  const organization: Organization = {
    id: orgId,
    name: input.name,
    slug: input.slug,
    defaultTimezone: input.defaultTimezone || 'America/New_York',
    defaultDurationMinutes: input.defaultDurationMinutes || 60,
    maxMembers: 50,
    createdAt: now,
    updatedAt: now,
  };

  // Creator becomes admin
  const membership: OrgMember = {
    id: uuidv4(),
    organizationId: orgId,
    userId: creatorUserId,
    role: 'admin',
    invitedBy: null,
    invitedAt: null,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  organizationsStore.set(organization.id, organization);
  orgMembersStore.set(membership.id, membership);

  return { organization, membership };
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(id: string): Promise<Organization | null> {
  return organizationsStore.get(id) || null;
}

/**
 * Get organization by slug
 */
export async function getOrganizationBySlug(slug: string): Promise<Organization | null> {
  for (const org of organizationsStore.values()) {
    if (org.slug === slug) return org;
  }
  return null;
}

/**
 * Update organization
 */
export async function updateOrganization(
  id: string,
  updates: UpdateOrganizationInput
): Promise<Organization | null> {
  const org = organizationsStore.get(id);
  if (!org) return null;

  const updated: Organization = {
    ...org,
    ...updates,
    updatedAt: new Date(),
  };

  organizationsStore.set(id, updated);
  return updated;
}

/**
 * Delete organization
 */
export async function deleteOrganization(id: string): Promise<boolean> {
  // Delete all memberships
  for (const [memberId, member] of orgMembersStore.entries()) {
    if (member.organizationId === id) {
      orgMembersStore.delete(memberId);
    }
  }

  return organizationsStore.delete(id);
}

/**
 * Get user's organization memberships
 */
export async function getUserOrganizations(userId: string): Promise<UserOrgMembership[]> {
  const memberships: UserOrgMembership[] = [];

  for (const member of orgMembersStore.values()) {
    if (member.userId === userId) {
      const org = organizationsStore.get(member.organizationId);
      if (org) {
        memberships.push({
          organization: org,
          role: member.role,
          joinedAt: member.joinedAt,
        });
      }
    }
  }

  return memberships;
}

/**
 * Get organization membership for a user
 */
export async function getOrgMembership(
  organizationId: string,
  userId: string
): Promise<OrgMember | null> {
  for (const member of orgMembersStore.values()) {
    if (member.organizationId === organizationId && member.userId === userId) {
      return member;
    }
  }
  return null;
}

/**
 * Add member to organization
 */
export async function addOrgMember(
  organizationId: string,
  userId: string,
  role: OrgMemberRole,
  invitedBy?: string
): Promise<OrgMember> {
  const now = new Date();

  const membership: OrgMember = {
    id: uuidv4(),
    organizationId,
    userId,
    role,
    invitedBy: invitedBy || null,
    invitedAt: invitedBy ? now : null,
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  orgMembersStore.set(membership.id, membership);
  return membership;
}

/**
 * Update member role
 */
export async function updateOrgMemberRole(
  organizationId: string,
  userId: string,
  role: OrgMemberRole
): Promise<OrgMember | null> {
  for (const [memberId, member] of orgMembersStore.entries()) {
    if (member.organizationId === organizationId && member.userId === userId) {
      const updated: OrgMember = {
        ...member,
        role,
        updatedAt: new Date(),
      };
      orgMembersStore.set(memberId, updated);
      return updated;
    }
  }
  return null;
}

/**
 * Remove member from organization
 */
export async function removeOrgMember(
  organizationId: string,
  userId: string
): Promise<boolean> {
  for (const [memberId, member] of orgMembersStore.entries()) {
    if (member.organizationId === organizationId && member.userId === userId) {
      orgMembersStore.delete(memberId);
      return true;
    }
  }
  return false;
}

/**
 * Get all members of an organization
 */
export async function getOrgMembers(organizationId: string): Promise<OrgMember[]> {
  const members: OrgMember[] = [];

  for (const member of orgMembersStore.values()) {
    if (member.organizationId === organizationId) {
      members.push(member);
    }
  }

  return members;
}

/**
 * Get member count for an organization
 */
export async function getOrgMemberCount(organizationId: string): Promise<number> {
  let count = 0;
  for (const member of orgMembersStore.values()) {
    if (member.organizationId === organizationId) {
      count++;
    }
  }
  return count;
}

/**
 * Reset organization stores (for testing)
 */
export function resetOrganizationStores(): void {
  organizationsStore.clear();
  orgMembersStore.clear();
}
