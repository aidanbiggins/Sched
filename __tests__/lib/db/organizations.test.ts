/**
 * Organization Database Operations Tests
 */

import {
  generateSlug,
  isSlugAvailable,
  createOrganization,
  getOrganizationById,
  getOrganizationBySlug,
  updateOrganization,
  deleteOrganization,
  getUserOrganizations,
  getOrgMembership,
  addOrgMember,
  updateOrgMemberRole,
  removeOrgMember,
  getOrgMembers,
  getOrgMemberCount,
  resetOrganizationStores,
} from '@/lib/db/organizations';

describe('Organization Database Operations', () => {
  beforeEach(() => {
    resetOrganizationStores();
  });

  describe('generateSlug', () => {
    it('should convert name to lowercase slug', () => {
      expect(generateSlug('Test Organization')).toBe('test-organization');
    });

    it('should replace special characters with hyphens', () => {
      expect(generateSlug('Test & Company!')).toBe('test-company');
    });

    it('should remove leading/trailing hyphens', () => {
      expect(generateSlug('---Test---')).toBe('test');
    });

    it('should truncate to 50 characters', () => {
      const longName = 'a'.repeat(100);
      expect(generateSlug(longName).length).toBeLessThanOrEqual(50);
    });
  });

  describe('isSlugAvailable', () => {
    it('should return true for unused slug', async () => {
      const available = await isSlugAvailable('new-org');
      expect(available).toBe(true);
    });

    it('should return false for used slug', async () => {
      await createOrganization({ name: 'Test Org', slug: 'test-org' }, 'user-123');
      const available = await isSlugAvailable('test-org');
      expect(available).toBe(false);
    });
  });

  describe('createOrganization', () => {
    it('should create organization with creator as admin', async () => {
      const { organization, membership } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      expect(organization.name).toBe('Test Org');
      expect(organization.slug).toBe('test-org');
      expect(organization.id).toBeDefined();
      expect(membership.role).toBe('admin');
      expect(membership.userId).toBe('user-123');
      expect(membership.organizationId).toBe(organization.id);
    });

    it('should use default values when not provided', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      expect(organization.defaultTimezone).toBe('America/New_York');
      expect(organization.defaultDurationMinutes).toBe(60);
      expect(organization.maxMembers).toBe(50);
    });

    it('should use provided values', async () => {
      const { organization } = await createOrganization(
        {
          name: 'Test Org',
          slug: 'test-org',
          defaultTimezone: 'Europe/London',
          defaultDurationMinutes: 30,
        },
        'user-123'
      );

      expect(organization.defaultTimezone).toBe('Europe/London');
      expect(organization.defaultDurationMinutes).toBe(30);
    });
  });

  describe('getOrganizationById', () => {
    it('should return organization by ID', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      const found = await getOrganizationById(organization.id);
      expect(found).toEqual(organization);
    });

    it('should return null for non-existent ID', async () => {
      const found = await getOrganizationById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('getOrganizationBySlug', () => {
    it('should return organization by slug', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      const found = await getOrganizationBySlug('test-org');
      expect(found).toEqual(organization);
    });

    it('should return null for non-existent slug', async () => {
      const found = await getOrganizationBySlug('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('updateOrganization', () => {
    it('should update organization fields', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      const updated = await updateOrganization(organization.id, { name: 'New Name' });
      expect(updated?.name).toBe('New Name');
      expect(updated?.slug).toBe('test-org'); // unchanged
    });

    it('should return null for non-existent org', async () => {
      const updated = await updateOrganization('non-existent', { name: 'New Name' });
      expect(updated).toBeNull();
    });
  });

  describe('deleteOrganization', () => {
    it('should delete organization and memberships', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      const deleted = await deleteOrganization(organization.id);
      expect(deleted).toBe(true);

      const found = await getOrganizationById(organization.id);
      expect(found).toBeNull();
    });

    it('should return false for non-existent org', async () => {
      const deleted = await deleteOrganization('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('getUserOrganizations', () => {
    it('should return all organizations for a user', async () => {
      await createOrganization({ name: 'Org 1', slug: 'org-1' }, 'user-123');
      await createOrganization({ name: 'Org 2', slug: 'org-2' }, 'user-123');

      const orgs = await getUserOrganizations('user-123');
      expect(orgs).toHaveLength(2);
      expect(orgs.map(o => o.organization.name)).toContain('Org 1');
      expect(orgs.map(o => o.organization.name)).toContain('Org 2');
    });

    it('should return empty array for user with no orgs', async () => {
      const orgs = await getUserOrganizations('user-no-orgs');
      expect(orgs).toEqual([]);
    });
  });

  describe('getOrgMembership', () => {
    it('should return membership for user in org', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      const membership = await getOrgMembership(organization.id, 'user-123');
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('admin');
    });

    it('should return null for user not in org', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      const membership = await getOrgMembership(organization.id, 'other-user');
      expect(membership).toBeNull();
    });
  });

  describe('addOrgMember', () => {
    it('should add member with specified role', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      const membership = await addOrgMember(organization.id, 'new-user', 'member');
      expect(membership.userId).toBe('new-user');
      expect(membership.role).toBe('member');
      expect(membership.organizationId).toBe(organization.id);
    });

    it('should track invitedBy when provided', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );

      const membership = await addOrgMember(organization.id, 'new-user', 'member', 'user-123');
      expect(membership.invitedBy).toBe('user-123');
      expect(membership.invitedAt).not.toBeNull();
    });
  });

  describe('updateOrgMemberRole', () => {
    it('should update member role', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );
      await addOrgMember(organization.id, 'new-user', 'member');

      const updated = await updateOrgMemberRole(organization.id, 'new-user', 'admin');
      expect(updated?.role).toBe('admin');
    });

    it('should return null for non-existent membership', async () => {
      const updated = await updateOrgMemberRole('org-id', 'user-id', 'admin');
      expect(updated).toBeNull();
    });
  });

  describe('removeOrgMember', () => {
    it('should remove member from organization', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );
      await addOrgMember(organization.id, 'new-user', 'member');

      const removed = await removeOrgMember(organization.id, 'new-user');
      expect(removed).toBe(true);

      const membership = await getOrgMembership(organization.id, 'new-user');
      expect(membership).toBeNull();
    });

    it('should return false for non-existent membership', async () => {
      const removed = await removeOrgMember('org-id', 'user-id');
      expect(removed).toBe(false);
    });
  });

  describe('getOrgMembers', () => {
    it('should return all members of organization', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );
      await addOrgMember(organization.id, 'user-456', 'member');
      await addOrgMember(organization.id, 'user-789', 'admin');

      const members = await getOrgMembers(organization.id);
      expect(members).toHaveLength(3); // creator + 2 added
    });

    it('should return empty array for non-existent org', async () => {
      const members = await getOrgMembers('non-existent');
      expect(members).toEqual([]);
    });
  });

  describe('getOrgMemberCount', () => {
    it('should return correct member count', async () => {
      const { organization } = await createOrganization(
        { name: 'Test Org', slug: 'test-org' },
        'user-123'
      );
      await addOrgMember(organization.id, 'user-456', 'member');

      const count = await getOrgMemberCount(organization.id);
      expect(count).toBe(2);
    });

    it('should return 0 for non-existent org', async () => {
      const count = await getOrgMemberCount('non-existent');
      expect(count).toBe(0);
    });
  });

  describe('User creates org flow', () => {
    it('should make creator an admin', async () => {
      const { organization, membership } = await createOrganization(
        { name: 'My Company', slug: 'my-company' },
        'creator-user'
      );

      expect(membership.role).toBe('admin');
      expect(membership.userId).toBe('creator-user');

      const orgs = await getUserOrganizations('creator-user');
      expect(orgs[0].role).toBe('admin');
    });
  });

  describe('User joins org flow', () => {
    it('should add user as member by default', async () => {
      const { organization } = await createOrganization(
        { name: 'Existing Org', slug: 'existing-org' },
        'admin-user'
      );

      const membership = await addOrgMember(organization.id, 'new-user', 'member');
      expect(membership.role).toBe('member');

      const orgs = await getUserOrganizations('new-user');
      expect(orgs[0].role).toBe('member');
    });
  });
});
