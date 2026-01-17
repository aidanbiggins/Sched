/**
 * Team Management Page
 *
 * View and manage organization members, send invites.
 */

'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { InviteModal } from '@/components/team';
import type { OrgMemberRole } from '@/types/organization';

interface OrgMember {
  id: string;
  userId: string;
  role: OrgMemberRole;
  joinedAt: string;
  user?: {
    name: string;
    email: string;
    image?: string;
  };
}

interface PendingInvite {
  id: string;
  email: string | null;
  role: OrgMemberRole;
  inviteCode: string;
  createdAt: string;
  expiresAt: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
}

export default function TeamSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [userRole, setUserRole] = useState<OrgMemberRole | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchTeamData();
    }
  }, [session]);

  const fetchTeamData = async () => {
    try {
      // Fetch user's organizations
      const orgsRes = await fetch('/api/organizations');
      const orgsData = await orgsRes.json();

      console.log('Team page - orgsData:', orgsData);

      if (orgsData.organizations?.length > 0) {
        const org = orgsData.organizations[0];
        console.log('Team page - setting org:', org);
        // API returns flat structure: { id, name, slug, role, joinedAt }
        setOrganization({ id: org.id, name: org.name, slug: org.slug });
        setUserRole(org.role);

        // Fetch members
        const membersRes = await fetch(`/api/organizations/${org.id}/members`);
        if (membersRes.ok) {
          const membersData = await membersRes.json();
          setMembers(membersData.members || []);
        }

        // Fetch pending invites (only for admins)
        if (org.role === 'admin') {
          const invitesRes = await fetch(`/api/organizations/${org.id}/invites?pending=true`);
          if (invitesRes.ok) {
            const invitesData = await invitesRes.json();
            setPendingInvites(invitesData.invites || []);
          }
        }
      } else {
        console.log('Team page - no organizations found');
      }
    } catch (error) {
      console.error('Failed to fetch team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const revokeInvite = async (inviteId: string) => {
    if (!organization || !confirm('Are you sure you want to revoke this invite?')) return;

    try {
      const res = await fetch(`/api/organizations/${organization.id}/invites/${inviteId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
      }
    } catch (error) {
      console.error('Failed to revoke invite:', error);
    }
  };

  const removeMember = async (userId: string) => {
    if (!organization || !confirm('Are you sure you want to remove this member?')) return;

    try {
      const res = await fetch(`/api/organizations/${organization.id}/members/${userId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        setMembers(prev => prev.filter(m => m.userId !== userId));
      }
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  };

  const getRoleBadge = (role: OrgMemberRole) => {
    const styles: Record<OrgMemberRole, string> = {
      admin: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      member: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    };
    return styles[role] || styles.member;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 max-w-md text-center">
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">No Organization</h2>
          <p className="text-zinc-400 mb-6">You need to create or join an organization first.</p>
          <Link
            href="/onboarding"
            className="inline-flex px-4 py-2 bg-[#1a5f5f] text-white rounded-lg hover:bg-[#154d4d] transition-colors"
          >
            Get Started
          </Link>
        </div>
      </div>
    );
  }

  const isAdmin = userRole === 'admin';

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
              <Link href="/settings" className="hover:text-zinc-300 transition-colors">Settings</Link>
              <span>/</span>
              <span className="text-zinc-300">Team</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-zinc-100">{organization.name}</h1>
            <p className="text-zinc-400 text-sm mt-1">
              {members.length} member{members.length !== 1 ? 's' : ''}
              {pendingInvites.length > 0 && ` · ${pendingInvites.length} pending`}
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a5f5f] text-white rounded-lg hover:bg-[#154d4d] transition-colors w-full sm:w-auto"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Invite Members
            </button>
          )}
        </div>

        {/* Members Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden mb-6">
          <div className="px-4 sm:px-6 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-medium text-zinc-100">Members</h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {members.map((member) => (
              <div key={member.id} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 font-medium flex-shrink-0">
                    {member.user?.name?.charAt(0) || '?'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-zinc-100 font-medium truncate">{member.user?.name || 'Unknown'}</p>
                    <p className="text-zinc-500 text-sm truncate">{member.user?.email || member.userId}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 pl-13 sm:pl-0">
                  <span className={`px-2.5 py-1 text-xs rounded-full border capitalize ${getRoleBadge(member.role)}`}>
                    {member.role}
                  </span>
                  {isAdmin && member.userId !== session?.user?.id && (
                    <button
                      onClick={() => removeMember(member.userId)}
                      className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Remove member"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
            {members.length === 0 && (
              <div className="px-6 py-8 text-center text-zinc-500">
                No members yet. Invite your team!
              </div>
            )}
          </div>
        </div>

        {/* Pending Invites Section (admins only) */}
        {isAdmin && pendingInvites.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-zinc-800">
              <h2 className="text-lg font-medium text-zinc-100">Pending Invites</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 rounded-full bg-zinc-800/50 border border-dashed border-zinc-700 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <p className="text-zinc-100 font-medium truncate">
                        {invite.email || 'Link invite'}
                      </p>
                      <p className="text-zinc-500 text-xs">
                        Expires {new Date(invite.expiresAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 pl-13 sm:pl-0">
                    <span className={`px-2.5 py-1 text-xs rounded-full border capitalize ${getRoleBadge(invite.role)}`}>
                      {invite.role}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          const link = `${window.location.origin}/join/${invite.inviteCode}`;
                          navigator.clipboard.writeText(link);
                        }}
                        className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                        title="Copy invite link"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                      </button>
                      <button
                        onClick={() => revokeInvite(invite.id)}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Revoke invite"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back link */}
        <div className="mt-6">
          <Link
            href="/settings"
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Settings
          </Link>
        </div>
      </div>

      {/* Invite Modal */}
      {organization && (
        <InviteModal
          isOpen={showInviteModal}
          onClose={() => setShowInviteModal(false)}
          organizationId={organization.id}
          organizationName={organization.name}
          onInviteCreated={fetchTeamData}
        />
      )}
    </div>
  );
}
