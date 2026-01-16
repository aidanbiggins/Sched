/**
 * InviteTeamStep - Invite team members
 *
 * Optional step to invite colleagues to the organization.
 */

'use client';

import { useState } from 'react';
import { CopyLinkButton } from '@/components/sharing';

export interface InviteTeamStepProps {
  organizationId: string;
  onNext: () => void;
  onBack: () => void;
}

export function InviteTeamStep({ organizationId, onNext, onBack }: InviteTeamStepProps) {
  const [emails, setEmails] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSendInvites = async () => {
    const emailList = emails
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter((e) => e && e.includes('@'));

    if (emailList.length === 0) {
      setError('Please enter at least one valid email address');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${organizationId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emails: emailList,
          role: 'coordinator',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to send invites');
      }

      setSent(true);
      setEmails('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invites');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/organizations/${organizationId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'coordinator',
          linkOnly: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate link');
      }

      const data = await response.json();
      const baseUrl = window.location.origin;
      setInviteLink(`${baseUrl}/join/${data.inviteCode}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-center px-4 max-w-md mx-auto">
      {/* Team icon */}
      <div className="w-16 h-16 bg-[#1a5f5f]/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-[#1a5f5f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-gray-900 mb-2">Invite Your Team</h2>
      <p className="text-gray-600 mb-6">
        Add colleagues who help with interview scheduling. You can always do this later.
      </p>

      {/* Error message */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Success message */}
      {sent && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Invites sent successfully!
        </div>
      )}

      {/* Invite options */}
      <div className="space-y-4 mb-6 text-left">
        {/* Email invites */}
        <div className="bg-gray-50 rounded-xl p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Invite by email
          </label>
          <textarea
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            placeholder="Enter email addresses, separated by commas"
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1a5f5f] focus:border-[#1a5f5f] outline-none transition-shadow resize-none"
          />
          <button
            onClick={handleSendInvites}
            disabled={loading || !emails.trim()}
            className="mt-2 w-full py-2 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Sending...' : 'Send Invites'}
          </button>
        </div>

        {/* Or divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-500">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Link invite */}
        <div className="bg-gray-50 rounded-xl p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Share invite link
          </label>
          {inviteLink ? (
            <div>
              <div className="bg-white border border-gray-200 rounded-lg p-2 mb-2">
                <p className="text-xs font-mono text-gray-600 truncate">{inviteLink}</p>
              </div>
              <CopyLinkButton text={inviteLink} variant="secondary" className="w-full" />
            </div>
          ) : (
            <button
              onClick={handleGenerateLink}
              disabled={loading}
              className="w-full py-2 px-4 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? 'Generating...' : 'Generate Invite Link'}
            </button>
          )}
          <p className="mt-2 text-xs text-gray-500">Link expires in 7 days</p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 px-4 py-2.5 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="flex-1 px-4 py-2.5 bg-[#1a5f5f] text-white font-medium rounded-lg hover:bg-[#154d4d] transition-colors"
        >
          {sent || inviteLink ? 'Continue' : 'Skip for Now'}
        </button>
      </div>
    </div>
  );
}

export default InviteTeamStep;
