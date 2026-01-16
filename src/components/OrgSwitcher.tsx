'use client';

/**
 * Organization Switcher Component
 *
 * Dropdown to switch between organizations the user belongs to.
 */

import { useState, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

export function OrgSwitcher() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSelecting, setIsSelecting] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!session?.user) return null;

  const organizations = session.user.organizations || [];
  const activeOrg = organizations.find(o => o.id === session.user.activeOrgId);

  const handleSelectOrg = async (orgId: string) => {
    if (orgId === session.user.activeOrgId) {
      setIsOpen(false);
      return;
    }

    setIsSelecting(orgId);

    try {
      const response = await fetch('/api/organizations/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId }),
      });

      if (!response.ok) {
        throw new Error('Failed to switch organization');
      }

      // Refresh session and page
      await updateSession();
      router.refresh();
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch org:', error);
    } finally {
      setIsSelecting(null);
    }
  };

  // Don't show switcher if no orgs or only one org
  if (organizations.length <= 1) {
    if (activeOrg) {
      return (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
          <span className="text-sm font-medium text-gray-700">{activeOrg.name}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              activeOrg.role === 'admin'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {activeOrg.role === 'admin' ? 'Admin' : 'Member'}
          </span>
        </div>
      );
    }
    return null;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
      >
        <span className="text-sm font-medium text-gray-700">
          {activeOrg?.name || 'Select Org'}
        </span>
        {activeOrg && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded ${
              activeOrg.role === 'admin'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-gray-200 text-gray-600'
            }`}
          >
            {activeOrg.role === 'admin' ? 'Admin' : 'Member'}
          </span>
        )}
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          <div className="px-3 py-2 border-b border-gray-100">
            <p className="text-xs font-medium text-gray-500 uppercase">
              Switch Organization
            </p>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {organizations.map(org => (
              <button
                key={org.id}
                onClick={() => handleSelectOrg(org.id)}
                disabled={isSelecting !== null}
                className={`w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${
                  org.id === session.user.activeOrgId ? 'bg-indigo-50' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{org.name}</p>
                  <p className="text-xs text-gray-500">/{org.slug}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded ${
                      org.role === 'admin'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {org.role === 'admin' ? 'Admin' : 'Member'}
                  </span>
                  {org.id === session.user.activeOrgId && (
                    <svg
                      className="w-4 h-4 text-indigo-600"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                  {isSelecting === org.id && (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-600" />
                  )}
                </div>
              </button>
            ))}
          </div>

          <div className="border-t border-gray-100 px-3 py-2">
            <button
              onClick={() => {
                setIsOpen(false);
                router.push('/onboarding');
              }}
              className="text-sm text-indigo-600 hover:text-indigo-700"
            >
              + Create new organization
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
