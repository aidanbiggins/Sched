/**
 * Interviewer Profiles Settings Page
 * M15: Capacity Planning
 *
 * Manage interviewer capacity settings.
 */

'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { InterviewerProfile } from '@/types/capacity';

interface Organization {
  id: string;
  name: string;
  slug: string;
  role: string;
}

interface InterviewerFormData {
  email: string;
  maxInterviewsPerWeek: number;
  maxInterviewsPerDay: number;
  bufferMinutes: number;
  tags: string[];
}

export default function InterviewerSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [profiles, setProfiles] = useState<InterviewerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProfile, setEditingProfile] = useState<InterviewerProfile | null>(null);
  const [formData, setFormData] = useState<InterviewerFormData>({
    email: '',
    maxInterviewsPerWeek: 10,
    maxInterviewsPerDay: 3,
    bufferMinutes: 15,
    tags: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      fetchData();
    }
  }, [session]);

  const fetchData = async () => {
    try {
      // Fetch user's organizations
      const orgsRes = await fetch('/api/organizations');
      const orgsData = await orgsRes.json();

      if (orgsData.organizations?.length > 0) {
        const org = orgsData.organizations[0];
        setOrganization(org);

        // Fetch interviewer profiles
        const profilesRes = await fetch(`/api/capacity/interviewers?organizationId=${org.id}`);
        if (profilesRes.ok) {
          const profilesData = await profilesRes.json();
          setProfiles(profilesData.profiles || []);
        }
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProfile = async () => {
    if (!organization || !formData.email) return;
    setSaving(true);

    try {
      const res = await fetch('/api/capacity/interviewers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          organizationId: organization.id,
        }),
      });

      if (res.ok) {
        setShowAddModal(false);
        resetForm();
        fetchData();
      } else {
        const error = await res.json();
        alert(error.error || 'Failed to add interviewer');
      }
    } catch (error) {
      console.error('Failed to add interviewer:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editingProfile) return;
    setSaving(true);

    try {
      const res = await fetch(`/api/capacity/interviewers/${editingProfile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setEditingProfile(null);
        resetForm();
        fetchData();
      }
    } catch (error) {
      console.error('Failed to update interviewer:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (id: string) => {
    if (!confirm('Are you sure you want to remove this interviewer profile?')) return;

    try {
      const res = await fetch(`/api/capacity/interviewers/${id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Failed to delete interviewer:', error);
    }
  };

  const handleToggleActive = async (profile: InterviewerProfile) => {
    try {
      const res = await fetch(`/api/capacity/interviewers/${profile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !profile.isActive }),
      });

      if (res.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Failed to toggle interviewer status:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      email: '',
      maxInterviewsPerWeek: 10,
      maxInterviewsPerDay: 3,
      bufferMinutes: 15,
      tags: [],
    });
    setTagInput('');
  };

  const openEditModal = (profile: InterviewerProfile) => {
    setEditingProfile(profile);
    setFormData({
      email: profile.email,
      maxInterviewsPerWeek: profile.maxInterviewsPerWeek,
      maxInterviewsPerDay: profile.maxInterviewsPerDay,
      bufferMinutes: profile.bufferMinutes,
      tags: profile.tags || [],
    });
    setShowAddModal(true);
  };

  const addTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({
        ...formData,
        tags: [...formData.tags, tagInput.trim()],
      });
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter((t) => t !== tag),
    });
  };

  const getUtilizationColor = (value: number) => {
    if (value >= 100) return 'text-red-400';
    if (value >= 90) return 'text-amber-400';
    if (value >= 70) return 'text-yellow-400';
    return 'text-emerald-400';
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

  return (
    <div className="min-h-screen bg-zinc-950 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <div className="flex items-center gap-2 text-zinc-500 text-sm mb-1">
              <Link href="/settings" className="hover:text-zinc-300 transition-colors">Settings</Link>
              <span>/</span>
              <span className="text-zinc-300">Interviewers</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold text-zinc-100">Interviewer Capacity</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Manage interviewer capacity limits and preferences
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setEditingProfile(null);
              setShowAddModal(true);
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1a5f5f] text-white rounded-lg hover:bg-[#154d4d] transition-colors w-full sm:w-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Interviewer
          </button>
        </div>

        {/* Profiles List */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b border-zinc-800">
            <h2 className="text-lg font-medium text-zinc-100">
              Interviewer Profiles ({profiles.length})
            </h2>
          </div>
          <div className="divide-y divide-zinc-800">
            {profiles.map((profile) => (
              <div key={profile.id} className="px-4 sm:px-6 py-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-medium flex-shrink-0 ${
                      profile.isActive
                        ? 'bg-[#1a5f5f]/30 text-[#3eb9b9]'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}>
                      {profile.email.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className={`font-medium truncate ${profile.isActive ? 'text-zinc-100' : 'text-zinc-500'}`}>
                        {profile.email}
                      </p>
                      <div className="flex items-center gap-3 text-sm text-zinc-500 mt-0.5">
                        <span>{profile.maxInterviewsPerWeek}/week</span>
                        <span>{profile.maxInterviewsPerDay}/day</span>
                        {profile.tags && profile.tags.length > 0 && (
                          <span className="hidden sm:inline">
                            {profile.tags.slice(0, 2).join(', ')}
                            {profile.tags.length > 2 && ` +${profile.tags.length - 2}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pl-13 sm:pl-0">
                    {!profile.isActive && (
                      <span className="px-2 py-0.5 text-xs bg-zinc-800 text-zinc-500 rounded">
                        Inactive
                      </span>
                    )}
                    <button
                      onClick={() => handleToggleActive(profile)}
                      className={`p-2 rounded-lg transition-colors ${
                        profile.isActive
                          ? 'text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10'
                          : 'text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10'
                      }`}
                      title={profile.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {profile.isActive ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => openEditModal(profile)}
                      className="p-2 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeleteProfile(profile.id)}
                      className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {profiles.length === 0 && (
              <div className="px-6 py-12 text-center text-zinc-500">
                <svg className="w-12 h-12 mx-auto mb-4 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <p className="mb-2">No interviewer profiles yet</p>
                <p className="text-sm text-zinc-600">Add interviewers to start tracking their capacity</p>
              </div>
            )}
          </div>
        </div>

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

      {/* Add/Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h3 className="text-lg font-medium text-zinc-100">
                {editingProfile ? 'Edit Interviewer' : 'Add Interviewer'}
              </h3>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Email */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!editingProfile}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#1a5f5f] disabled:opacity-50"
                  placeholder="interviewer@company.com"
                />
              </div>

              {/* Capacity Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">Max per Week</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formData.maxInterviewsPerWeek}
                    onChange={(e) => setFormData({ ...formData, maxInterviewsPerWeek: parseInt(e.target.value) || 10 })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#1a5f5f]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1.5">Max per Day</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={formData.maxInterviewsPerDay}
                    onChange={(e) => setFormData({ ...formData, maxInterviewsPerDay: parseInt(e.target.value) || 3 })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#1a5f5f]"
                  />
                </div>
              </div>

              {/* Buffer */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Buffer between interviews (minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={formData.bufferMinutes}
                  onChange={(e) => setFormData({ ...formData, bufferMinutes: parseInt(e.target.value) || 15 })}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 focus:outline-none focus:ring-2 focus:ring-[#1a5f5f]"
                />
              </div>

              {/* Tags */}
              <div>
                <label className="block text-sm text-zinc-400 mb-1.5">Tags</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                    className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#1a5f5f]"
                    placeholder="e.g., engineering, senior"
                  />
                  <button
                    type="button"
                    onClick={addTag}
                    className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    Add
                  </button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {formData.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-zinc-800 text-zinc-300 text-sm rounded"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => removeTag(tag)}
                          className="text-zinc-500 hover:text-zinc-200"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-zinc-800 flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingProfile(null);
                  resetForm();
                }}
                className="px-4 py-2 text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingProfile ? handleUpdateProfile : handleAddProfile}
                disabled={saving || !formData.email}
                className="px-4 py-2 bg-[#1a5f5f] text-white rounded-lg hover:bg-[#154d4d] transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : editingProfile ? 'Save Changes' : 'Add Interviewer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
