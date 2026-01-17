'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface OrganizationDetails {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  createdAt: string;
}

export default function OrganizationSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [org, setOrg] = useState<OrganizationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', slug: '' });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchOrganization();
    }
  }, [session]);

  const fetchOrganization = async () => {
    try {
      const res = await fetch('/api/organizations');
      const data = await res.json();
      if (data.organizations && data.organizations.length > 0) {
        const currentOrg = data.organizations[0]; // Use first org for now
        setOrg(currentOrg);
        setFormData({ name: currentOrg.name, slug: currentOrg.slug || '' });
      }
    } catch (err) {
      console.error('Failed to fetch organization:', err);
      setError('Failed to load organization details');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update organization');
      }

      setSuccess('Organization updated successfully');
      fetchOrganization();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#1a5f5f]"></div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  const isAdmin = session.user.activeOrgRole === 'admin';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100">Organization Settings</h1>
            <p className="text-zinc-400 text-sm mt-1">Manage your organization details</p>
          </div>
          <Link
            href="/settings"
            className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Back to Settings
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400">
            {success}
          </div>
        )}

        {org ? (
          <div className="space-y-6">
            {/* Organization Details Form */}
            <form onSubmit={handleSubmit} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
              <h2 className="text-lg font-medium mb-4">Organization Details</h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!isAdmin}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#1a5f5f] disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Organization Slug
                  </label>
                  <input
                    type="text"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                    disabled={!isAdmin}
                    placeholder="my-organization"
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#1a5f5f] disabled:opacity-50"
                  />
                  <p className="text-xs text-zinc-500 mt-1">
                    URL-friendly identifier. Only lowercase letters, numbers, and hyphens.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Organization ID
                  </label>
                  <div className="px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-500 font-mono text-sm">
                    {org.id}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Members
                  </label>
                  <div className="px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-400">
                    {org.memberCount} member{org.memberCount !== 1 ? 's' : ''}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-1">
                    Created
                  </label>
                  <div className="px-4 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-zinc-400">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>

              {isAdmin && (
                <div className="mt-6 flex justify-end">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-4 py-2 bg-[#1a5f5f] hover:bg-[#1a5f5f]/80 disabled:opacity-50 rounded-lg text-white transition-colors"
                  >
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}

              {!isAdmin && (
                <p className="mt-4 text-sm text-zinc-500">
                  Only organization administrators can edit these settings.
                </p>
              )}
            </form>

            {/* Team Link */}
            <Link
              href="/settings/team"
              className="block bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-700 transition-colors group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium">Manage Team</h3>
                  <p className="text-zinc-400 text-sm">Add or remove members, manage roles</p>
                </div>
                <svg className="w-5 h-5 text-zinc-500 group-hover:text-zinc-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
            <p className="text-zinc-400">No organization found. Please join or create an organization first.</p>
            <Link
              href="/onboarding"
              className="inline-block mt-4 px-4 py-2 bg-[#1a5f5f] hover:bg-[#1a5f5f]/80 rounded-lg text-white transition-colors"
            >
              Get Started
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
