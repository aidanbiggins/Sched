/**
 * InviteModal - Tabbed modal for inviting team members
 *
 * Two options:
 * 1. Invite by Email - Enter email addresses to send invites
 * 2. Share Link - Generate a shareable invite link
 */

'use client';

import { useState } from 'react';
import { CopyLinkButton } from '../sharing';
import type { OrgMemberRole } from '@/types/organization';

export interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
  organizationName: string;
  onInviteCreated?: () => void;
}

type TabType = 'email' | 'link';

export function InviteModal({
  isOpen,
  onClose,
  organizationId,
  organizationName,
  onInviteCreated,
}: InviteModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('email');
  const [emails, setEmails] = useState('');
  const [role, setRole] = useState<OrgMemberRole>('coordinator');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEmailInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    const emailList = emails
      .split(/[,\n]/)
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));

    if (emailList.length === 0) {
      setError('Please enter at least one valid email address');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch(`/api/organizations/${organizationId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: emailList,
          role,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send invites');
      }

      const data = await response.json();
      setSuccess(`Invites sent to ${data.invitesSent} email${data.invitesSent !== 1 ? 's' : ''}`);
      setEmails('');
      onInviteCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch(`/api/organizations/${organizationId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          linkOnly: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate link');
      }

      const data = await response.json();
      const baseUrl = window.location.origin;
      setGeneratedLink(`${baseUrl}/join/${data.inviteCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setEmails('');
    setError(null);
    setSuccess(null);
    setGeneratedLink(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Invite to {organizationName}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => setActiveTab('email')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'email'
                ? 'text-[#1a5f5f]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                />
              </svg>
              Invite by Email
            </span>
            {activeTab === 'email' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1a5f5f]" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'link'
                ? 'text-[#1a5f5f]'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              Share Link
            </span>
            {activeTab === 'link' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#1a5f5f]" />
            )}
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {success}
            </div>
          )}

          {/* Role Selector (shared between tabs) */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrgMemberRole)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1a5f5f] focus:border-[#1a5f5f] outline-none transition-shadow"
            >
              <option value="coordinator">Coordinator</option>
              <option value="interviewer">Interviewer</option>
              <option value="admin">Admin</option>
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {role === 'admin' && 'Full access including team management'}
              {role === 'coordinator' && 'Can create and manage scheduling requests'}
              {role === 'interviewer' && 'Can view their assigned interviews'}
            </p>
          </div>

          {/* Email Tab Content */}
          {activeTab === 'email' && (
            <form onSubmit={handleEmailInvite}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email addresses
                </label>
                <textarea
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  placeholder="Enter email addresses, separated by commas or new lines"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1a5f5f] focus:border-[#1a5f5f] outline-none transition-shadow resize-none"
                />
              </div>
              <button
                type="submit"
                disabled={isLoading || !emails.trim()}
                className="w-full py-2.5 px-4 bg-[#1a5f5f] text-white font-medium rounded-lg hover:bg-[#154d4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? 'Sending...' : 'Send Invites'}
              </button>
            </form>
          )}

          {/* Link Tab Content */}
          {activeTab === 'link' && (
            <div>
              {!generatedLink ? (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    Generate a shareable link that anyone can use to join your organization.
                    The link expires in 7 days.
                  </p>
                  <button
                    onClick={handleGenerateLink}
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 bg-[#1a5f5f] text-white font-medium rounded-lg hover:bg-[#154d4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isLoading ? 'Generating...' : 'Generate Invite Link'}
                  </button>
                </>
              ) : (
                <div>
                  <p className="text-sm text-gray-600 mb-3">
                    Share this link with your team:
                  </p>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
                    <p className="text-sm font-mono text-gray-800 break-all">
                      {generatedLink}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <CopyLinkButton text={generatedLink} variant="primary" className="flex-1" />
                    <button
                      onClick={() => setGeneratedLink(null)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Generate New
                    </button>
                  </div>
                  <p className="mt-3 text-xs text-gray-500 text-center">
                    This link expires in 7 days
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default InviteModal;
