'use client';

/**
 * Org Picker Page
 *
 * Shown to users with multiple organizations who need to select one.
 */

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function OrgPickerPage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const [isSelecting, setIsSelecting] = useState<string | null>(null);

  const handleSelectOrg = async (orgId: string) => {
    setIsSelecting(orgId);

    try {
      const response = await fetch('/api/organizations/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });

      if (!response.ok) {
        throw new Error('Failed to select organization');
      }

      // Update session with new active org
      await updateSession();

      // Redirect to hub
      router.push('/hub');
    } catch (error) {
      console.error('Failed to select org:', error);
      setIsSelecting(null);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const organizations = session.user.organizations || [];

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Select Organization
          </h1>

          <p className="text-gray-600 mb-6 text-center">
            Choose which organization you want to work with.
          </p>

          <div className="space-y-3">
            {organizations.map(org => (
              <button
                key={org.id}
                onClick={() => handleSelectOrg(org.id)}
                disabled={isSelecting !== null}
                className="w-full p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-medium text-gray-900">{org.name}</h3>
                    <p className="text-sm text-gray-500">/{org.slug}</p>
                  </div>
                  <div className="flex items-center">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        org.role === 'admin'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {org.role === 'admin' ? 'Admin' : 'Member'}
                    </span>
                    {isSelecting === org.id && (
                      <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => router.push('/onboarding')}
              className="w-full text-center text-sm text-indigo-600 hover:text-indigo-700"
            >
              Create a new organization
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
