/**
 * Join Organization Page
 *
 * Displays invite details and allows users to accept the invite.
 * Requires authentication - redirects to sign in if not logged in.
 */

'use client';

import { useEffect, useState, use } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface InviteDetails {
  organizationName: string;
  organizationSlug: string;
  role: string;
  inviterName?: string;
  expiresAt: string;
  status: string;
}

interface PageParams {
  inviteCode: string;
}

export default function JoinPage({ params }: { params: Promise<PageParams> }) {
  const { inviteCode } = use(params);
  const { data: session, status } = useSession();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    async function fetchInvite() {
      try {
        const response = await fetch(`/api/invites/${inviteCode}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to fetch invite');
        }
        const data = await response.json();
        setInvite(data.invite);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load invite');
      } finally {
        setLoading(false);
      }
    }

    fetchInvite();
  }, [inviteCode]);

  const handleAccept = async () => {
    if (!session?.user) {
      router.push(`/signin?callbackUrl=/join/${inviteCode}`);
      return;
    }

    setAccepting(true);
    setError(null);

    try {
      const response = await fetch(`/api/invites/${inviteCode}/accept`, {
        method: 'POST',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept invite');
      }

      setAccepted(true);
      // Redirect to hub after a brief moment
      setTimeout(() => {
        router.push('/hub');
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept invite');
    } finally {
      setAccepting(false);
    }
  };

  // Not authenticated
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-[#1a5f5f]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-[#1a5f5f]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            You've been invited!
          </h1>
          <p className="text-gray-600 mb-6">
            Sign in to view and accept this invitation.
          </p>
          <Link
            href={`/signin?callbackUrl=/join/${inviteCode}`}
            className="inline-flex items-center justify-center w-full py-3 px-4 bg-[#1a5f5f] text-white font-medium rounded-lg hover:bg-[#154d4d] transition-colors"
          >
            Sign In to Continue
          </Link>
        </div>
      </div>
    );
  }

  // Loading
  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[#1a5f5f] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  // Error
  if (error && !invite) {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Invalid Invitation
          </h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <Link
            href="/hub"
            className="inline-flex items-center justify-center w-full py-3 px-4 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  // Accepted
  if (accepted) {
    return (
      <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg max-w-md w-full p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">
            Welcome to {invite?.organizationName}!
          </h1>
          <p className="text-gray-600 mb-6">
            You've successfully joined as a {invite?.role}.
          </p>
          <p className="text-sm text-gray-500">Redirecting to dashboard...</p>
        </div>
      </div>
    );
  }

  // Show invite details
  return (
    <div className="min-h-screen bg-[#faf9f7] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a5f5f] px-8 py-6 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-semibold text-white">
            You're invited to join
          </h1>
          <p className="text-2xl font-bold text-white mt-1">
            {invite?.organizationName}
          </p>
        </div>

        {/* Details */}
        <div className="p-8">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">Role</span>
              <span className="font-medium text-gray-900 capitalize">{invite?.role}</span>
            </div>
            {invite?.inviterName && (
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">Invited by</span>
                <span className="font-medium text-gray-900">{invite.inviterName}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">Expires</span>
              <span className="font-medium text-gray-900">
                {invite?.expiresAt ? new Date(invite.expiresAt).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>

          {/* Signed in as */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-500 mb-1">Signed in as</p>
            <p className="font-medium text-gray-900">{session?.user?.email}</p>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full py-3 px-4 bg-[#1a5f5f] text-white font-medium rounded-lg hover:bg-[#154d4d] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {accepting ? 'Joining...' : 'Accept Invitation'}
            </button>
            <Link
              href="/hub"
              className="block w-full py-3 px-4 text-center bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              Decline
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
